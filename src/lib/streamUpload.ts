// ── streamUpload — client-side Cloudflare Stream upload (Brief V2) ────────────
// House law: the file NEVER goes through our API. Our /api/stream/direct-upload
// route mints a one-time TUS upload URL; the browser PATCHes the bytes STRAIGHT to
// Cloudflare here. One path for all sizes (TUS, resumable) — no size branching.
//
// Minimal inline TUS client (no new dependency). TUS chunks must be a multiple of
// 256 KiB (except the last). We HEAD first to learn the current offset (resume-safe),
// then PATCH sequential chunks, advancing to the server-reported Upload-Offset.

const CHUNK = 5 * 1024 * 1024; // 5 MiB — a multiple of 256 KiB; good progress granularity

async function requestUploadUrl(file: File): Promise<{ uploadUrl: string; uid: string }> {
  const res = await fetch('/api/stream/direct-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadLength: file.size, name: file.name }),
  });
  if (!res.ok) throw new Error(`stream sign failed (${res.status})`);
  const j = await res.json();
  if (!j?.uploadUrl || !j?.uid) throw new Error('stream sign: no uploadUrl/uid');
  return { uploadUrl: j.uploadUrl, uid: j.uid };
}

async function currentOffset(uploadUrl: string): Promise<number> {
  const res = await fetch(uploadUrl, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' } });
  if (!res.ok) return 0; // fresh upload (or HEAD unsupported) → start at 0
  return Number(res.headers.get('Upload-Offset') ?? 0) || 0;
}

/**
 * Upload a video file to Cloudflare Stream via TUS. Returns the Stream video UID.
 * `onProgress(0..1)` reports upload progress (not encoding — that runs async on Stream).
 */
export async function uploadVideoToStream(file: File, onProgress?: (frac: number) => void): Promise<string> {
  const { uploadUrl, uid } = await requestUploadUrl(file);
  let offset = await currentOffset(uploadUrl);
  onProgress?.(file.size ? offset / file.size : 0);

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK, file.size);
    // Brief V2a — per-chunk timeout: a stalled PATCH (iOS backgrounding / dead connection)
    // must FAIL VISIBLY, never hang the POSTING overlay forever. 90s per 5 MiB chunk is
    // generous even on slow cell. Abort → throws → surfaced as "Uploading video failed".
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    let res: Response;
    try {
      res = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
        },
        body: file.slice(offset, end),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new Error(`stream tus PATCH stalled/failed at offset ${offset} (${(e as Error)?.name === 'AbortError' ? 'timeout' : (e as Error)?.message})`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status !== 204 && res.status !== 200) {
      throw new Error(`stream tus PATCH failed (${res.status}) at offset ${offset}`);
    }
    const next = Number(res.headers.get('Upload-Offset') ?? end);
    offset = Number.isFinite(next) && next > offset ? next : end;
    onProgress?.(file.size ? offset / file.size : 1);
  }
  return uid;
}
