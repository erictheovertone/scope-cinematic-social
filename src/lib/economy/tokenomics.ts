// ── Tokenomics: the ONE place the raw↔fragment conversion lives ──────────────
//
// A post's coin is an ERC-20 with 18 decimals. The app's display unit is a
// FRAGMENT: 1 fragment = 100,000 base tokens. So a wallet's decimal token balance
// (formatEther(raw) — already ÷1e18) divided by TOKENS_PER_PIECE is its fragment
// count. Holdings, the collect sheet, and now the wallet activity tab all read
// through this constant — same number everywhere, never a hardcoded divisor.
//
// (Named TOKENS_PER_PIECE to match the existing code identifiers in real.ts /
// zoraCoins.ts / CollectSheetV2 — the "pieces"→"fragments" rename is user-facing
// copy only, not code symbols.)

export const TOKENS_PER_PIECE = 100_000;

/** Decimal token units (i.e. formatEther(raw) or Alchemy's metadata `value`) →
 *  whole fragments. Rounds to the nearest fragment for per-trade display. */
export function tokenUnitsToFragments(tokenUnits: number): number {
  if (!Number.isFinite(tokenUnits) || tokenUnits <= 0) return 0;
  return Math.round(tokenUnits / TOKENS_PER_PIECE);
}

// ── FIRST CUT REWARDS (Scope-funded, from the platform's 0.2% referral stream) ─
// FC holders earn FC_REWARD_RATE of every trade's volume on coins they hold an
// ACTIVE First Cut in, split by rank weight. Env-tunable (server-side dial —
// accrual + payouts read it; no redeploy to retune). CREATOR_FEE_RATE lives in
// recap.ts; this is the FC analogue, kept here with the other tokenomics truths.
export const FC_REWARD_RATE = Number(process.env.FC_REWARD_RATE ?? '0.0018');

/** Linear-descending rank weight: weight(rank r of n active slots) =
 *  (n − r + 1) / Σ(1..n). For 10 slots: #1 = 18.18% … #10 = 1.82%.
 *  Weights over the ELIGIBLE set always sum to 1 — the pool fully distributes. */
export function fcRankWeight(rank: number, n: number): number {
  if (!Number.isInteger(rank) || !Number.isInteger(n) || n <= 0 || rank < 1 || rank > n) return 0;
  return (n - rank + 1) / ((n * (n + 1)) / 2);
}
