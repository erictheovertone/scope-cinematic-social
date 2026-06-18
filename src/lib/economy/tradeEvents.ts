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

export interface TradeSettledDetail {
  postId: string;
  /** Signed pieces change for the OPTIMISTIC holdings patch (+buy, −sell).
   *  Receipt-true (the chain's word); value/order reconcile from the real read.
   *  Optional — listeners that only refetch ignore it (backward-compatible). */
  piecesDelta?: number;
}

/** Fire after ANY successful trade. `opts.piecesDelta` enables the optimistic
 *  wallet patch; omit it and listeners simply refetch as before. */
export function notifyTradeSettled(postId: string, opts?: { piecesDelta?: number }): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TRADE_SETTLED_EVENT, { detail: { postId, piecesDelta: opts?.piecesDelta } }));
}

/** Subscribe; returns an unsubscribe. cb gets the postId + the full detail. */
export function onTradeSettled(cb: (postId: string | undefined, detail?: TradeSettledDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as TradeSettledDetail | undefined;
    cb(detail?.postId, detail);
  };
  window.addEventListener(TRADE_SETTLED_EVENT, handler);
  return () => window.removeEventListener(TRADE_SETTLED_EVENT, handler);
}
