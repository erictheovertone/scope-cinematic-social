// ── coinMarketData — batched, cached coin market caps (Brief Q2) ─────────────
//
// A sibling to the screening-room cache that keeps MC for EVERY minted coin (not just
// the top-50), so ambient surfaces (profile grid hover, headers) can show MC WITHOUT a
// per-cell live Zora call. Populated by /api/cron/coin-market on a 5-min cadence.
//
// BOUNDARY (hard rule): this cache is for AMBIENT display only. Collect/trade sheets NEVER
// read it — they keep LIVE pricing (getPostMarket / /api/market) because money is committed.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCoins } from '@zoralabs/coins-sdk';
import { supabase } from '@/lib/supabase/client';

const BASE_CHAIN = 8453;   // Base
const BATCH = 20;          // getCoins hard cap = 20 ids/call
const MAX_RETRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ambient staleness: a reader shows cached MC only if fresher than this, else NOTHING
 *  (degrade gracefully — never a stale-looking number). 5-min cron + 15-min tolerance. */
export const MARKET_STALE_MS = 15 * 60 * 1000;

/**
 * SERVER (service-role) — fetch MC for ALL minted coins via batched getCoins and UPSERT
 * coin_market_data. Cron-run. Best-effort per batch: a batch that fails after retries is
 * skipped (its rows keep their last-good cached value); never throws. Reuses the exact
 * hardened getCoins read pattern from recomputeScreeningRoom.
 */
export async function refreshCoinMarketData(admin: SupabaseClient): Promise<{ ok: boolean; coins: number; upserted: number; apiCalls: number; failedBatches: number }> {
  const { data: rows } = await admin.from('posts').select('coin_address').not('coin_address', 'is', null);
  const addrs = [...new Set((rows ?? []).map((r) => (r.coin_address as string | null)?.toLowerCase()).filter(Boolean) as string[])];

  const now = new Date().toISOString();
  let upserted = 0, apiCalls = 0, failedBatches = 0;

  for (let i = 0; i < addrs.length; i += BATCH) {
    const batch = addrs.slice(i, i + BATCH);
    let ok = false;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res: { data?: { zora20Tokens?: Record<string, unknown>[] } } = await getCoins({ coins: batch.map((a) => ({ chainId: BASE_CHAIN, collectionAddress: a })) });
        apiCalls++;
        const upserts = (res?.data?.zora20Tokens ?? [])
          .filter((t) => t && (t as { address?: string }).address)
          .map((t) => {
            const z = t as { address: string; marketCap?: string; tokenPrice?: { priceInUsdc?: string | null }; uniqueHolders?: number; symbol?: string | null };
            return {
              coin_address: z.address.toLowerCase(),
              market_cap: parseFloat(z.marketCap ?? '0') || 0,
              price_usd: z.tokenPrice?.priceInUsdc != null ? (parseFloat(z.tokenPrice.priceInUsdc) || null) : null,
              unique_holders: Number(z.uniqueHolders) || 0,
              symbol: z.symbol ?? null,
              updated_at: now,
            };
          });
        if (upserts.length) {
          const { error } = await admin.from('coin_market_data').upsert(upserts, { onConflict: 'coin_address' });
          if (!error) upserted += upserts.length;
        }
        ok = true;
        break;
      } catch (e) {
        if (attempt < MAX_RETRIES - 1) { await sleep(500 * Math.pow(2, attempt)); continue; }
        console.error('[coin-market] getCoins batch failed after retries:', (e as Error)?.message);
      }
    }
    if (!ok) failedBatches++;
  }
  return { ok: true, coins: addrs.length, upserted, apiCalls, failedBatches };
}

/**
 * CLIENT — batched read of cached MC for a set of coin addresses, staleness-filtered.
 * Returns address(lowercased) → market cap (USD). Rows older than MARKET_STALE_MS are
 * excluded (a missing entry → the caller renders nothing, the dash rule). ONE query, never
 * per-cell. Never throws (a failed read → empty map → dashes, never a block).
 */
export async function getCachedMarketCaps(coinAddresses: (string | null | undefined)[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const addrs = [...new Set(coinAddresses.map((a) => (a ?? '').toLowerCase()).filter(Boolean))];
  if (!addrs.length) return out;
  try {
    const cutoff = new Date(Date.now() - MARKET_STALE_MS).toISOString();
    const { data } = await supabase
      .from('coin_market_data')
      .select('coin_address, market_cap, updated_at')
      .in('coin_address', addrs)
      .gte('updated_at', cutoff);
    for (const r of data ?? []) {
      if (r.market_cap != null) out.set(String(r.coin_address).toLowerCase(), Number(r.market_cap));
    }
  } catch { /* empty map → dashes */ }
  return out;
}
