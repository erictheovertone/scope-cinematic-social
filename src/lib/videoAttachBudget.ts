// ── videoAttachBudget (Brief V3d) ────────────────────────────────────────────
import { pushTrace } from "@/lib/videoTrace"; // HOME-4 — budget crumbs (debug only)
//
// Caps the number of AUTOPLAY video players that may be ATTACHED (buffering an HLS/
// progressive source) at once, so a long fast scroll can't accumulate unbounded
// buffers/decoders down the feed. Feed/grid/scroll autoplay players acquire a slot
// before attaching; on release (leaving the NEAR window / unmount) any waiter is
// pinged to retry. forcePlay (theatre/modal single-focus) is EXEMPT — it never calls
// these.
//
// Leak-resistant: acquire returns whether a slot was granted; release is idempotent per
// holder because callers release from a React effect CLEANUP (runs on unmount + dep
// change). The count can never go negative.

// HOME-2 §4 — cap by surface, set in ONE place. Phone keeps 3 (one-decoder discipline); desktop
// covers every video on a 1440/2560 masonry screen (ceiling 8) so in-view players aren't starved at 3.
function maxAttached(): number {
  return typeof window !== "undefined" && window.innerWidth >= 1024 ? 8 : 3;
}

let attached = 0;
const waiters = new Set<() => void>();
// HOME-5 §4 / HOME-3 §E — each slot holder reports a VISIBILITY SCORE (fraction of the card on
// screen now, 0 = off-screen) and how to EVICT it. A requester that hits a full budget preempts the
// LEAST-visible current holder when the requester beats it by a clear margin: a card the member is
// looking at always beats a prebuffer (score 0), AND a more-visible on-screen card beats a
// less-visible on-screen holder (the phone-cap-3 case — a 4th fully-visible card was denied behind
// three others, one of them scrolling off). The margin stops two similarly-visible cards trading
// the slot back and forth.
export type AttachHolder = { score: () => number; evict: () => void };
const holders = new Set<AttachHolder>();
const PREEMPT_MARGIN = 0.15; // requester must beat the weakest holder by this visible-fraction

// Brief P1a — dev-only paired-count trace (strip-safe): confirm acquire/release stay
// symmetric across N attach→destroy cycles (the count must return to 0, never leak/negative).
const budgetLog = (op: string) => { if (process.env.NODE_ENV !== "production") console.log(`[attach-budget] ${op} → ${attached}/${maxAttached()}`); };

/** Try to take an attach slot for `holder`. Grants if room; else the requester preempts the
 *  LEAST-visible current holder when it beats that holder's score by PREEMPT_MARGIN (HOME-5 §4 +
 *  HOME-3 §E — generalised from off-screen-only to least-visible); else denies. */
export function acquireAttach(holder: AttachHolder): boolean {
  if (attached < maxAttached()) {
    attached += 1; holders.add(holder);
    budgetLog("acquire"); pushTrace(`budget acquire ${attached}/${maxAttached()}`); // HOME-4
    return true;
  }
  // Full. Find the weakest (least-visible) current holder; the requester preempts it if it is
  // clearly more visible. Off-screen holders score 0, so an on-screen requester still evicts a
  // prebuffer exactly as before — and a more-visible on-screen card now also evicts a less-visible
  // on-screen holder (the phone-cap-3 denial).
  const my = holder.score();
  let victim: AttachHolder | undefined;
  let min = Infinity;
  for (const h of holders) { const s = h.score(); if (s < min) { min = s; victim = h; } }
  if (victim && my > min + PREEMPT_MARGIN) {
    holders.delete(victim); attached -= 1; // free the victim's slot…
    victim.evict();                        // …and tell it to tear down (idempotent vs its own release)
    attached += 1; holders.add(holder);
    budgetLog("preempt"); pushTrace(`budget preempt ${attached}/${maxAttached()} (${my.toFixed(2)}>${min.toFixed(2)})`); // HOME-5/HOME-3
    return true;
  }
  budgetLog("DENIED (full)"); pushTrace(`budget deny ${attached}/${maxAttached()}`); // HOME-4
  return false;
}

/** Give `holder`'s slot back and ping waiters (idempotent — a preempted holder is already out). */
export function releaseAttach(holder: AttachHolder): void {
  if (!holders.has(holder)) return;
  holders.delete(holder); if (attached > 0) attached -= 1;
  budgetLog("release"); pushTrace(`budget release ${attached}/${maxAttached()}`); // HOME-4
  for (const w of Array.from(waiters)) w();
}

/** Subscribe to "a slot freed" so a capped player can retry. Returns an unsubscribe. */
export function onAttachSlotFree(cb: () => void): () => void {
  waiters.add(cb);
  return () => { waiters.delete(cb); };
}

// ── Overlay occlusion (Brief C3-13) ──────────────────────────────────────────
// A fullscreen video surface (the profile post-scroll viewer, lightbox, theatre) sits
// OVER the grid. The grid's gridMode players use a viewport-root IntersectionObserver,
// so they still read as "in view" behind the overlay and HOLD all MAX_ATTACHED slots —
// starving the overlay's own players (they never attach → never play → frozen posters).
// While an overlay is active, background grid players (gridMode && !inOverlay) release
// and stop acquiring; the overlay's own players acquire freely.
let overlayCount = 0;
const overlaySubs = new Set<(active: boolean) => void>();
/** Mark a fullscreen video overlay mounted; call the returned fn on unmount. */
export function pushVideoOverlay(): () => void {
  overlayCount += 1;
  for (const s of Array.from(overlaySubs)) s(true);
  return () => {
    overlayCount = Math.max(0, overlayCount - 1);
    const active = overlayCount > 0;
    for (const s of Array.from(overlaySubs)) s(active);
  };
}
export function isVideoOverlayActive(): boolean { return overlayCount > 0; }
export function onVideoOverlayChange(cb: (active: boolean) => void): () => void {
  overlaySubs.add(cb);
  return () => { overlaySubs.delete(cb); };
}
