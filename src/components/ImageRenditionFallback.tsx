'use client';

// ── ImageRenditionFallback — one global net for un-baked images ───────────────
//
// feedImage points post-media images at a baked rendition (`{master}.600.webp` /
// `.1600.webp`). New posts have them; LEGACY posts (and deck covers / posters we
// don't bake) don't — that rendition 404s. This single capture-phase <img> error
// listener catches any failed rendition and rewrites the src back to the MASTER by
// stripping the `.{w}.webp` suffix (which was appended to the full master path, so
// the strip is exact — original extension preserved). No per-call-site changes;
// zero transform. (A one-time backfill would remove the 404 round-trip on legacy.)

import { useEffect } from 'react';

const RENDITION_URL = /^(.*)\.(?:600|1600)\.webp(\?.*)?$/;

export default function ImageRenditionFallback() {
  useEffect(() => {
    const onError = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLImageElement)) return;
      if (el.dataset.renditionFellBack) return; // already reverted — avoid a loop
      const src = el.currentSrc || el.src;
      const m = src.match(RENDITION_URL);
      if (!m) return;
      el.dataset.renditionFellBack = '1';
      el.src = m[1]; // the master (e.g. …/abc.jpg) — the rendition suffix stripped
    };
    // Capture phase: <img> 'error' does not bubble, so a document-level listener
    // must capture to see it.
    document.addEventListener('error', onError, true);
    return () => document.removeEventListener('error', onError, true);
  }, []);
  return null;
}
