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
