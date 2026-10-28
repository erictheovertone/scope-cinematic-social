// ── mediaOwnership — Brief V3 §2: one <video> per create step, owned by the step ──────────────────
// WebKit keeps a hardware decoder for a <video> that still has a src — paused, offscreen, or already
// unmounted by React (webkit.org/b/193449). A detached element is only freed at GC, which on iOS can be
// never-before-the-tab-dies. So every create-flow <video> is CLAIMED by the step that owns it and
// RELEASED (pause → removeAttribute('src') → load()) the moment that step lets go of it — never left
// for GC. At each step boundary the flow asks for leftovers: any claimed element from another step that
// still holds a decoder is a bug — console.error in dev, a `leak:` crumb under ?debug=video in prod.

import { vdbg } from './videoDebug';

export type MediaOwner = 'probe' | 'media' | 'crop' | 'finishing' | 'edit' | 'posting';

// WeakRef'd so a registry entry never keeps an element alive by itself.
const claims = new Map<WeakRef<HTMLVideoElement>, MediaOwner>();

export function claimVideo(v: HTMLVideoElement, owner: MediaOwner): void {
  for (const [ref] of claims) if (ref.deref() === v) return;
  claims.set(new WeakRef(v), owner);
}

/** Release the element's decoder NOW (pause → removeAttribute('src') → load()) and drop the claim. */
export function releaseVideo(v: HTMLVideoElement | null | undefined): void {
  if (!v) return;
  try {
    v.pause();
    v.removeAttribute('src');
    v.load();
  } catch { /* already gone */ }
  for (const [ref] of claims) { const el = ref.deref(); if (!el || el === v) claims.delete(ref); }
}

/** Live = still holds (or is acquiring) a decoder: networkState LOADING or readyState ≥ HAVE_METADATA. */
const holdsDecoder = (v: HTMLVideoElement) => v.networkState === 2 || v.readyState >= 1;

/**
 * Step-boundary check. Returns the owners of claimed elements that are still decoding but do NOT
 * belong to `step` (the media step may also hold the one-shot probe; `allow` names any other owner
 * the caller knows is legitimately finishing up). Logs them as a bug.
 */
export function assertStepBoundary(step: string, allow: MediaOwner[] = []): MediaOwner[] {
  const leaked: MediaOwner[] = [];
  for (const [ref, owner] of claims) {
    const v = ref.deref();
    if (!v) { claims.delete(ref); continue; }
    if (!holdsDecoder(v)) continue;
    if (owner === step || allow.includes(owner) || (step === 'media' && owner === 'probe')) continue;
    leaked.push(owner);
  }
  if (leaked.length) {
    vdbg('leak', `${leaked.join(',')} alive at step:${step}`);
    if (process.env.NODE_ENV !== 'production') console.error(`[V3 assert] <video> from step ${leaked.join(', ')} still decoding at step:${step}`);
  }
  return leaked;
}
