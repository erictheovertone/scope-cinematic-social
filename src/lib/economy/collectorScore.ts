// ── Collector composite score — config + pure math ───────────────────────────
//
// Plan: docs/economy/Indexer_Decisions.md §"Collector — weighted composite score
// (LOCKED)". The nightly Collector job (src/app/api/cron/collector/route.ts)
// reads each Scope user's holdings + trade activity from Zora's API, scores them
// with the weighted blend below, ranks, and awards Collector (Top 1k) via the
// is_top_collector flag.
//
// WEIGHTS LIVE HERE — tune without touching the job. Each signal is normalized
// 0–1 by PERCENTILE RANK across all users (not min-max — percentile resists a
// single whale stretching the scale), then multiplied by its weight and summed.

export const COLLECTOR_WEIGHTS = {
  distinctPosts: 0.40,    // breadth — distinct Scope posts (coins) the user holds
  distinctCreators: 0.25, // breadth — distinct creators behind those holdings
  holdingsValue: 0.20,    // conviction — USD value of the user's Scope holdings
  tradeVolume: 0.15,      // liquidity — cumulative USD trade volume on Scope coins
} as const;

// Weights must sum to 1 (a composite score stays in [0,1]). Guarded at import so
// a bad edit fails loudly rather than silently skewing every rank.
const _weightSum = Object.values(COLLECTOR_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(_weightSum - 1) > 1e-9) {
  throw new Error(`[collectorScore] COLLECTOR_WEIGHTS must sum to 1 (got ${_weightSum})`);
}

export const COLLECTOR_CONFIG = {
  topN: 1000, // award Collector to the top-N; everyone qualifying if fewer exist

  // Score COLLECTING, not self-dealing. A creator's OWN coins (their post,
  // backed by themselves) are excluded from every signal, so the rank measures
  // support of OTHERS' work and can't be farmed by minting + self-backing your
  // own posts. Mirrors First Cut's "external collector" rule (sender ≠ creator).
  // Flip to true to count self-held / self-traded coins per the literal spec.
  // (Eric: ratify — this is the one interpretive call in the build.)
  countSelfCreated: false,
} as const;

export type CollectorSignals = {
  distinctPosts: number;
  distinctCreators: number;
  holdingsValue: number;
  tradeVolume: number;
};

/**
 * Percentile rank of each value within its column, across ALL users:
 *   pct(x) = (# users strictly below x) / (N − 1), clamped to [0,1].
 * The global minimum (which includes every zero-activity user) maps to 0; the
 * maximum maps to 1; ties share the lower bound. Because the top can only ever
 * reach 1, a single outsized whale cannot stretch the scale. O(n log n).
 */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map((v) => (v > 0 ? 1 : 0));
  const sorted = [...values].sort((a, b) => a - b);
  const denom = n - 1;
  // # strictly below v = lower-bound index of v in the sorted array.
  const below = (v: number) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return values.map((v) => below(v) / denom);
}

/** Weighted composite from a user's four percentile-normalized signals. */
export function compositeScore(pct: CollectorSignals): number {
  return (
    COLLECTOR_WEIGHTS.distinctPosts * pct.distinctPosts +
    COLLECTOR_WEIGHTS.distinctCreators * pct.distinctCreators +
    COLLECTOR_WEIGHTS.holdingsValue * pct.holdingsValue +
    COLLECTOR_WEIGHTS.tradeVolume * pct.tradeVolume
  );
}

/**
 * Score + rank a set of users from their raw signals. Returns rows sorted by
 * composite score desc, each carrying the raw signals (for the cache table) and
 * the final score. Percentiles are computed PER SIGNAL across the whole input
 * set, so adding/removing users reshapes the curve — exactly the intent.
 */
export function rankCollectors<T extends { signals: CollectorSignals }>(
  users: T[],
): (T & { score: number })[] {
  const posts = percentileRanks(users.map((u) => u.signals.distinctPosts));
  const creators = percentileRanks(users.map((u) => u.signals.distinctCreators));
  const value = percentileRanks(users.map((u) => u.signals.holdingsValue));
  const volume = percentileRanks(users.map((u) => u.signals.tradeVolume));
  return users
    .map((u, i) => ({
      ...u,
      score: compositeScore({
        distinctPosts: posts[i],
        distinctCreators: creators[i],
        holdingsValue: value[i],
        tradeVolume: volume[i],
      }),
    }))
    .sort((a, b) => b.score - a.score);
}
