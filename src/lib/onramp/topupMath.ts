// ── Top-up sheet math (BAL-1b.1) — pure, unit-tested ──────────────────────────────────────────────
// Kept out of the component so the two rules the brief names can be asserted directly.

export const TOPUP_AMOUNTS = [10, 25, 50] as const;

/** How many "collects" an amount buys, where ONE collect costs `pricePerCollect` dollars (the live
    buyQuote.usdAmount of this post's buy). No/zero price → null (show no count). */
export function collectsFor(amount: number, pricePerCollect: number | null | undefined): number | null {
  if (!pricePerCollect || pricePerCollect <= 0) return null;
  return Math.floor(amount / pricePerCollect);
}

/** The preselected amount: the smallest offered amount that covers the shortfall; over the top amount
    (or no shortfall) → the $25 default, except a shortfall above $50 preselects $50. */
export function preselectAmount(shortfallUsd: number | null | undefined): number {
  if (shortfallUsd && shortfallUsd > 0) return TOPUP_AMOUNTS.find((a) => a >= shortfallUsd) ?? 50;
  return 25;
}
