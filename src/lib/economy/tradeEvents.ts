// ── The ONE post-trade refresh signal ───────────────────────────────────────
//
// Every trade entry point — mint-flow backing, standalone collect (buy), sell —
// calls notifyTradeSettled(postId) on success. Every surface that shows piece
// counts or market data (wallet HOLDINGS, the MC chips on feed tiles + the
// lightbox, the profile grid) listens via onTradeSettled. No entry point can
// leave holdings stale, and no surface re-implements the wiring.
//
// Event name kept as 'scope:market-moved' so the existing MC-chip listeners
// (PostItem / PostModal / profile page) keep working unchanged — this module
// just makes the dispatch/subscribe a single, named path.

export const TRADE_SETTLED_EVENT = 'scope:market-moved';

/** Fire after ANY successful trade, with the affected post. */
export function notifyTradeSettled(postId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TRADE_SETTLED_EVENT, { detail: { postId } }));
}

/** Subscribe; returns an unsubscribe. cb gets the postId that settled. */
export function onTradeSettled(cb: (postId: string | undefined) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => cb((e as CustomEvent).detail?.postId);
  window.addEventListener(TRADE_SETTLED_EVENT, handler);
  return () => window.removeEventListener(TRADE_SETTLED_EVENT, handler);
}
