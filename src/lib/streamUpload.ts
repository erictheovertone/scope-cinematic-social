// ── streamUpload — client-side Cloudflare Stream upload (Brief V2, resumable VID-2b) ─────────────
// House law: the file NEVER goes through our API. /api/stream/direct-upload mints a one-time tus
// upload URL (carrying the Stream token server-side); the browser uploads the bytes STRAIGHT to
// Cloudflare here, via tus-js-client with RESUME ON.
//
// Why VID-2b: the old inline tus client never persisted the upload URL, so every retry minted a NEW
// URL and restarted from byte 0, and a single failed PATCH threw and gave up. Long iPhone clips over
// a flaky connection could take ~3 tries to get through. Now:
//   · the (uploadUrl, uid) is stored in localStorage keyed per file → resume across retries AND a
//     page reload, from the server-confirmed offset (tus HEADs the URL and continues);
//   · tus retryDelays give exponential backoff on a dropped PATCH — the chunk is re-sent, not failed;
//   · visibilitychange→visible / online re-`start()`s a stalled upload (survives iOS backgrounding);
//   · we only start fresh (byte 0, new URL) if Stream says the stored URL is 404/410 — the crumb says so;
//   · chunkSize = 5 MiB: Cloudflare tus requires a multiple of 256 KiB, min 5 MB (5 MiB = 256 KiB×20);
//     the small end means a drop on mobile costs one small chunk, not a big one.
import { vdbg, vdbgError } from '@/lib/videoDebug';

const CHUNK = 5 * 1024 * 1024; // 5 MiB — Stream's documented tus minimum, a 256 KiB multiple
const MAX_FRESH_RESTARTS = 2;  // dead-URL (404/410) → re-mint; capped so we can't loop forever

export type UploadPhase = 'uploading' | 'resuming';
export interface UploadState { phase: UploadPhase; pct: number; retries: number; resumes: number; }

const fp = (file: File) => `scope:tus:${file.name}:${file.size}:${file.lastModified}`;
function loadStored(file: File): { uploadUrl: string; uid: string } | null {
  try { const s = localStorage.getItem(fp(file)); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveStored(file: File, v: { uploadUrl: string; uid: string }) {
  try { localStorage.setItem(fp(file), JSON.stringify(v)); } catch { /* private mode */ }
}
function clearStored(file: File) {
  try { localStorage.removeItem(fp(file)); } catch { /* private mode */ }
}

async function mintUploadUrl(file: File): Promise<{ uploadUrl: string; uid: string }> {
  const res = await fetch('/api/stream/direct-upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadLength: file.size, name: file.name }),
  });
  if (!res.ok) throw new Error(`stream sign failed (${res.status})`);
  const j = await res.json();
  if (!j?.uploadUrl || !j?.uid) throw new Error('stream sign: no uploadUrl/uid');
  return { uploadUrl: j.uploadUrl, uid: j.uid };
}

/**
 * Upload a video to Cloudflare Stream via resumable tus. Returns the Stream video UID.
 * `onProgress(0..1)` is upload progress (not encoding — that runs async on Stream). `onState`
 * reports uploading/resuming + retry/resume counts for a "Resuming…" UI. Resolves on success;
 * rejects only after tus exhausts its backoff — the caller may call this again to RESUME (same URL).
 */
export async function uploadVideoToStream(
  file: File,
  onProgress?: (frac: number) => void,
  onState?: (s: UploadState) => void,
): Promise<string> {
  const { Upload } = await import('tus-js-client');
  let retries = 0, resumes = 0, freshRestarts = 0;
  let lastPct = 0;
  let lastProgressAt = Date.now();
  let stored = loadStored(file);
  let urlOk = !!stored; // resuming an existing URL vs a freshly minted one
  const mb = (b: number) => (b / (1024 * 1024)).toFixed(0);
  const crumb = (extra?: string) =>
    vdbg('up', `${Math.round(lastPct * 100)}% · ${mb(lastPct * file.size)}/${mb(file.size)} MB · retry ${retries} · resumed ${resumes} · url ${urlOk ? 'ok' : 'new'}${extra ? ' · ' + extra : ''}`);

  return new Promise<string>((resolve, reject) => {
    type TusUpload = InstanceType<typeof Upload>;
    let upload: TusUpload | null = null;
    let finished = false;

    const cleanup = () => {
      finished = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
    const maybeResume = (why: string) => {
      if (finished || !upload) return;
      if (Date.now() - lastProgressAt < 2500) return; // still progressing — leave it alone
      resumes++;
      onState?.({ phase: 'resuming', pct: lastPct, retries, resumes });
      crumb(`resume:${why}`);
      try { upload.start(); } catch { /* tus is mid-flight */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') maybeResume('visible'); };
    const onOnline = () => maybeResume('online');

    const begin = async () => {
      if (!stored) {
        try { stored = await mintUploadUrl(file); urlOk = false; saveStored(file, stored); }
        catch (e) { cleanup(); return reject(e as Error); }
      }
      const uid = stored.uid;
      upload = new Upload(file, {
        uploadUrl: stored.uploadUrl,       // resume this exact URL — never a fresh POST
        chunkSize: CHUNK,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000], // exponential backoff on a dropped chunk
        removeFingerprintOnSuccess: true,
        metadata: { name: file.name },
        onShouldRetry: (err: unknown) => {
          const status = (err as { originalResponse?: { getStatus?: () => number } })?.originalResponse?.getStatus?.() ?? 0;
          if (status === 404 || status === 410) { // the stored URL is gone/expired → don't retry it
            clearStored(file); stored = null; urlOk = true; crumb(`url-${status}→fresh`);
            return false; // falls through to onError, which re-mints + restarts
          }
          retries++;
          onState?.({ phase: 'uploading', pct: lastPct, retries, resumes });
          crumb(`retry:${status || 'net'}`);
          return true;
        },
        onProgress: (sent: number, total: number) => {
          lastPct = total ? sent / total : 0;
          lastProgressAt = Date.now();
          onProgress?.(lastPct);
          onState?.({ phase: 'uploading', pct: lastPct, retries, resumes });
          crumb();
        },
        onSuccess: () => { clearStored(file); cleanup(); crumb('done'); resolve(uid); },
        onError: (err: unknown) => {
          // dead-URL path cleared `stored` → re-mint a fresh URL and restart ONCE (capped).
          if (!stored && freshRestarts < MAX_FRESH_RESTARTS) {
            freshRestarts++; crumb('restart-fresh'); upload = null; begin();
            return;
          }
          cleanup();
          vdbgError(`tus upload failed: ${(err as Error)?.message ?? String(err)}`);
          reject(err as Error);
        },
      });
      upload.start(); // fresh URL → uploads from 0; resumed URL → tus HEADs for the offset first
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    begin();
  });
}
