// ── WHILE YOU WERE AWAY — recap shape + the ONE fee constant ─────────────────
//
// Earnings = real, read-only: per owned coin we read the coin's swap activity
// (getCoinSwaps, server-side) since last_seen, sum the BUY volume in USD, and the
// creator's cut is CREATOR_FEE_RATE of that volume. No instrumentation of the
// trade/collect flow. The data layer lives in /api/recap (server — getCoinSwaps
// needs the Zora API key). This module is the shared type + constant so the sheet
// UI and the route agree on one shape.

/**
 * Creator's share of each trade = 0.5% of trade value (500 bps). Source: Zora
 * Coins V4 (v2.2.0+) fee schedule — total trade fee 1%, creator = 50% of it →
 * 0.5%. (The code comment's extra "1%" is the one-time MINT allocation, not a
 * per-trade fee, so it is NOT part of trade-earnings.) Single source of truth —
 * never inline this number.
 */
export const CREATOR_FEE_RATE = 0.005;

export interface RecapBreakdownRow {
  postId: string;
  ticker: string | null;        // shown later as red [ TICKER ]; never a bare numeric id
  thumbnailUrl: string | null;  // real post media
  collectCount: number;         // BUYs by OTHERS since last_seen
  volumeUsd: number;            // Σ swap USD of those BUYs
  proceeds: number;             // volumeUsd × CREATOR_FEE_RATE
}

export interface Recap {
  sinceDays: number;
  hero: { earned: number; postCount: number };  // earned = Σ row.proceeds; postCount = rows with collects
  breakdown: RecapBreakdownRow[];                // sorted desc by proceeds (top earners first)
  social: { follows: number; comments: number; likes: number };
  /** False when nothing meaningful happened since last_seen → the sheet can skip showing. */
  hasActivity: boolean;
}
