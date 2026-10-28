'use client';
// ── createDraft — Brief C3-11: create-flow draft persistence ───────────────────
//
// Upgrading to Pro mid-flow (either rail) unmounts CreatePostFlow (router.push /
// window.location), and an app relaunch mid-flow drops everything too — all the
// in-memory useState is lost. This persists the draft to IndexedDB the moment any
// step completes, and restores it (to the exact step) on return. The media BLOBS are
// stored, not object URLs (those don't survive a reload). One draft at a time; expires
// after 24h. No new deps — raw IndexedDB. Best-effort: every op is wrapped so a failure
// (private mode, blocked storage) never blocks the create flow.

export interface CreateDraft {
  savedAt: number;
  /** C3-11 — the Privy user id that owns this draft. On a shared device the restore refuses
   *  a draft whose owner != the current user, so the next person never sees someone else's. */
  ownerId: string;
  step: 'crop' | 'finishing' | 'edit';
  media: { id: string; blob: Blob; type: 'image' | 'video'; name: string }[];
  chosenLayoutId: string | null;
  editGeometry: unknown | null;
  editParams: unknown;
  caption: string;
  customThumbnail: { blob: Blob; name: string } | null;
  videoAutoplay: boolean;
  snippetWindow: { start: number; length: number } | null;
  music: { trackId: string | null; track: unknown | null; mode: 'bed' | 'music_only' | null; start: number };
  /** Brief V3 §5 — the video's auto-thumbnail (its own first frame, JPEG data URL) + duration, so a
   *  crash-safe restore can frame the crop on a still and skip the probe decode. Absent on older drafts. */
  poster?: string | null;
  durationS?: number;
}

const DB_NAME = 'scope-create';
const STORE = 'draft';
const KEY = 'current';
const TTL_MS = 24 * 60 * 60 * 1000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraft(d: CreateDraft): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(d, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* best-effort — never block the flow */ }
}

export async function loadDraft(): Promise<CreateDraft | null> {
  try {
    const db = await openDb();
    const d = await new Promise<CreateDraft | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result as CreateDraft | undefined);
      r.onerror = () => reject(r.error);
    });
    db.close();
    if (!d || !d.media?.length) return null;
    if (Date.now() - d.savedAt > TTL_MS) { await clearDraft(); return null; }
    return d;
  } catch { return null; }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch { /* ignore */ }
}

// ── Brief V3 §5 — the create flow's own "did the last page end cleanly" marker ────────────────────
// The ?debug=video breadcrumb only exists with the overlay on, so production restore can't use it.
// While a create session holds media past the media step the flow keeps this key set; a clean end
// (publish, discard, close, unmount, a real pagehide) removes it. iOS killing the tab under decode
// pressure runs none of that, so the key survives into the next load = the previous page crashed.
// localStorage (not sessionStorage) so a killed-then-relaunched PWA still sees it.
const LIVE_KEY = 'scope:create-live';

export function markCreateLive(step: string): void {
  try { localStorage.setItem(LIVE_KEY, JSON.stringify({ step, at: Date.now() })); } catch { /* storage off */ }
}
export function markCreateClean(): void {
  try { localStorage.removeItem(LIVE_KEY); } catch { /* storage off */ }
}
/** Read (without consuming) the step a previous page was on when it died, or null if it ended cleanly. */
export function peekUncleanCreateExit(): string | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { step?: string };
    return typeof j?.step === 'string' ? j.step : 'unknown';
  } catch { return null; }
}

/** V3 §5 — can the stored blob still be read? (first + last byte). iOS can hand back an IDB file whose
 *  bytes are gone after a crash; that used to surface much later as "tus PATCH stalled at offset 0". */
export async function blobReadable(b: Blob, timeoutMs = 5000): Promise<boolean> {
  try {
    const ends = b.size > 1 ? [b.slice(0, 1), b.slice(b.size - 1)] : [b.slice(0, 1)];
    const bufs = await Promise.race([
      Promise.all(ends.map((x) => x.arrayBuffer())),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('read timeout')), timeoutMs)),
    ]);
    return b.size > 0 && bufs.every((x) => x.byteLength === 1);
  } catch { return false; }
}
