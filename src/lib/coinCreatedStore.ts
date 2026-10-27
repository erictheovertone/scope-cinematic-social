"use client";

// ── CEL-1 — the single coin-created receipt store ─────────────────────────────
// Anti-fork: BOTH mint paths (create-post flow AND existing-post → Create coin)
// call onCoinConfirmed(result) at the receipt-confirmed point — the ONLY place the
// celebration opens. One app-root <CoinCreatedSheet/> reads this store. The sheet
// fires ONLY on a confirmed receipt (createScopeCoin returns a parsed on-chain
// deployment; it throws on revert/drop), NEVER on tx submit — pending UI stays as-is.

import { useSyncExternalStore } from "react";

export interface CoinCreatedResult {
  post: {
    id: string;
    userId: string;
    /** caption / title line under the symbol */
    title: string;
    /** layout id → box aspect + the existing layout label string */
    layoutId: string;
    mediaType: "image" | "video";
    /** photo src, or a playable video src (HLS/mp4); null → poster only */
    mediaUrl: string | null;
    /** video poster (graded hero frame); also the photo has none */
    posterUrl: string | null;
    cropX?: number;
    cropY?: number;
    cropWidth?: number;
    cropHeight?: number;
    /** deck name — ONLY when the post is in a deck; null → the row is omitted */
    deckName?: string | null;
  };
  coin: { symbol: string; address: string };
  receipt: { hash: string; chainLabel: string };
}

let state: CoinCreatedResult | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** The single receipt-confirmed entry point. Both mint paths call this. */
export function onCoinConfirmed(result: CoinCreatedResult) {
  state = result;
  emit();
}

/** Dismiss — clears the sheet; the flow's own post-mint behavior proceeds unchanged. */
export function clearCoinCreated() {
  state = null;
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
const getSnapshot = () => state;
const getServerSnapshot = () => null;

export function useCoinCreated(): CoinCreatedResult | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
