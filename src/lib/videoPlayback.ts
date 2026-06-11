"use client";

/**
 * videoPlayback — concurrency coordinator for autoplay GRADED videos in the FEED
 * (and profile scroll), where tiles are large/near-full-width. Only a small CAP
 * play at once (1 mobile / 2 desktop), prioritized by nearest-to-viewport-centre;
 * the rest show their graded poster — never N big concurrent pipelines.
 *
 * The PROFILE GRID does NOT use this — grid tiles are small and go "alive" (every
 * in-view autoplay tile attempts to play; the device's <video> decoder limit caps
 * it, overflow rests as posters). See GradedVideo `gridMode`.
 *
 * Each GradedVideo (feed/scroll) registers a setter and reports a visibility
 * "score" (distance of its centre from the viewport centre; Infinity off-screen);
 * the coordinator grants "active" to the lowest-score CAP and revokes the rest.
 */

type Setter = (active: boolean) => void;
interface Entry { score: number; set: Setter; active: boolean }

const entries = new Map<string, Entry>();

let _cap = 0;
function cap(): number {
  if (_cap) return _cap;
  if (typeof window === 'undefined') { _cap = 1; return _cap; }
  const mobile = window.matchMedia?.('(max-width: 768px)')?.matches ?? window.innerWidth <= 768;
  _cap = mobile ? 1 : 2; // start: 1 mobile / 2 desktop (tune here if needed)
  return _cap;
}
export function playbackCap(): number { return cap(); }

let raf = 0;
function schedule() {
  if (raf || typeof window === 'undefined') return;
  raf = window.requestAnimationFrame(() => {
    raf = 0;
    const winners = new Set(
      [...entries.entries()]
        .filter(([, e]) => e.score < Infinity)
        .sort((a, b) => a[1].score - b[1].score)
        .slice(0, cap())
        .map(([id]) => id),
    );
    entries.forEach((e, id) => {
      const next = winners.has(id);
      if (e.active !== next) { e.active = next; e.set(next); }
    });
  });
}

export function registerAutoplayVideo(id: string, set: Setter): () => void {
  entries.set(id, { score: Infinity, set, active: false });
  schedule();
  return () => { entries.delete(id); schedule(); };
}

export function reportVisibility(id: string, score: number) {
  const e = entries.get(id);
  if (e && e.score !== score) { e.score = score; schedule(); }
}
