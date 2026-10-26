// ── videoAttachBudget (Brief V3d) ────────────────────────────────────────────
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

const MAX_ATTACHED = 3;

let attached = 0;
const waiters = new Set<() => void>();

// Brief P1a — dev-only paired-count trace (strip-safe): confirm acquire/release stay
// symmetric across N attach→destroy cycles (the count must return to 0, never leak/negative).
const budgetLog = (op: string) => { if (process.env.NODE_ENV !== "production") console.log(`[attach-budget] ${op} → ${attached}/${MAX_ATTACHED}`); };

/** Try to take an attach slot. Returns true if granted. */
export function acquireAttach(): boolean {
  if (attached >= MAX_ATTACHED) {
    // Brief M10c — log DENIALS (not just grants): a starved surface (e.g. Mirage cells
    // blocked by a still-mounted feed holding all slots) is invisible without this.
    budgetLog("DENIED (full)");
    return false;
  }
  attached += 1;
  budgetLog("acquire");
  return true;
}

/** Give a slot back and ping waiters that one freed. */
export function releaseAttach(): void {
  if (attached > 0) attached -= 1;
  budgetLog("release");
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
