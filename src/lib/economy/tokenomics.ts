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
