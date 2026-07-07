// ── SCOPE EARNINGS — shared shape + session cache + derivations ───────────────
//
// ONE dataset (every historical BUY of the user's coins as { t, usd×fee } from
// /api/earnings), fetched ONCE per app session; the wallet header stat and the
// detail sheet both read the cache, and the range chips re-slice it client-side
// (never a refetch per chip). Fee math lives server-side on the recap engine's
// single sources (swapUsd × CREATOR_FEE_RATE) — nothing here computes fees.

export interface EarningEvent {
  /** Swap block time, epoch ms. */
  t: number;
  /** The creator's cut of that swap (already × CREATOR_FEE_RATE, server-side). */
  usd: number;
}

export interface EarningsData {
  accountCreatedAt: string;
  events: EarningEvent[]; // sorted ascending by t
  /** A coin needed >4 swap pages — the signal to prioritize the cron-precompute. */
  heavy: boolean;
  /** A coin hit the pagination cap — figures are a floor, not exact. */
  truncated: boolean;
  /** Per-post rollup of the same events (the wallet PORTFOLIO detail).
      Optional: older session-cached payloads may lack it. */
  byPost?: {
    postId: string; coinAddress: string | null; usd: number;
    ticker: string | null; thumb: string | null; layoutId: string | null;
  }[];
}

const DAY_MS = 86_400_000;

// Session cache — the recap prefetch pattern: one in-flight/settled promise per
// uuid for the whole app session. Failures are NOT cached (retry on next open).
const cache = new Map<string, Promise<EarningsData | null>>();

export function getEarnings(userUuid: string): Promise<EarningsData | null> {
  const hit = cache.get(userUuid);
  if (hit) return hit;
  const p = (async (): Promise<EarningsData | null> => {
    try {
      const res = await fetch(`/api/earnings?userId=${userUuid}`);
      if (!res.ok) { console.error('[earnings] HTTP', res.status); return null; }
      const data = (await res.json()) as EarningsData;
      if (data.heavy) console.warn('[earnings] heavy history flagged — cron-precompute signal');
      return data;
    } catch (e) {
      console.error('[earnings] fetch failed', e);
      return null;
    }
  })();
  cache.set(userUuid, p);
  p.then((d) => { if (d == null) cache.delete(userUuid); }); // don't cache a failure
  return p;
}

export const sumAll = (events: EarningEvent[]): number =>
  events.reduce((s, e) => s + e.usd, 0);

export const sumSince = (events: EarningEvent[], sinceMs: number): number =>
  events.reduce((s, e) => (e.t > sinceMs ? s + e.usd : s), 0);

/** Cumulative chart series over a window: one point per day from the window
    start to today, each = running sum of earnings WITHIN the window (windows
    start at 0 — the chart shows growth over the range; the hero stays all-time).
    rangeDays null = ALL (window starts at account creation). */
export function cumulativeSeries(
  data: EarningsData,
  rangeDays: number | null,
): { t: number; cum: number }[] {
  const now = Date.now();
  const created = Date.parse(data.accountCreatedAt) || now;
  const start = rangeDays == null ? created : Math.max(created, now - rangeDays * DAY_MS);
  const startDay = Math.floor(start / DAY_MS);
  const endDay = Math.floor(now / DAY_MS);

  // Bucket in-window earnings by UTC day.
  const byDay = new Map<number, number>();
  for (const e of data.events) {
    if (e.t < start) continue;
    const d = Math.floor(e.t / DAY_MS);
    byDay.set(d, (byDay.get(d) ?? 0) + e.usd);
  }

  // One point per day (empty days carry the running sum) → time-linear x-axis.
  const series: { t: number; cum: number }[] = [];
  let cum = 0;
  for (let d = startDay; d <= endDay; d++) {
    cum += byDay.get(d) ?? 0;
    series.push({ t: d * DAY_MS, cum });
  }
  if (series.length === 1) series.unshift({ t: (startDay - 1) * DAY_MS, cum: 0 }); // a line needs 2 points
  return series;
}
