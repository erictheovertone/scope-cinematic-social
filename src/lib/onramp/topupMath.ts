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

/** LIVE landing step (BAL-1b.2 §6 bug fix). Given the current baseline (nullable — no successful read
    yet) and a FRESH SUCCESSFUL balance read, decide the next baseline and whether to land.
    • No baseline yet → the first successful read BECOMES the baseline; never land on it (so a failed /
      late Continue read can't make the host see balance > 0 and land before any money arrives).
    • Baseline set → land only when the read is strictly above it. */
export function liveLandingStep(baseline: number | null, read: number): { baseline: number; land: boolean } {
  if (baseline == null) return { baseline: read, land: false };
  return { baseline, land: read > baseline };
}
