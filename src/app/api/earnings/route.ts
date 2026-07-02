// ── /api/earnings — ALL-TIME creator earnings (server-only, READ-ONLY) ────────
//
// The recap engine's math over the FULL history: per owned coin we page
// getCoinSwaps (newest-first) back to the coin's beginning (no last_seen cutoff),
// keep every BUY by OTHERS as an earning event { t, usd × CREATOR_FEE_RATE }.
// Sibling of /api/recap rather than a mode on it: different cutoff semantics
// (all-time vs since-last-seen) and a different payload (event array for the
// chart, not a breakdown). Same single sources: swapUsd + CREATOR_FEE_RATE.
// getCoinSwaps needs the Zora API key → must stay server-side.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCoinSwaps, setApiKey } from '@zoralabs/coins-sdk';
import { swapUsd } from '@/lib/economy/firstCut';
import { CREATOR_FEE_RATE } from '@/lib/economy/recap';
import type { EarningEvent, EarningsData } from '@/lib/economy/earnings';

export const dynamic = 'force-dynamic';

const BASE_CHAIN = 8453;
const SWAP_PAGE = 100;
// Full-history bound: 10 pages = 1,000 swaps per coin. HEAVY_PAGES is the
// cron-precompute signal — any coin needing >4 pages flags the response so the
// client can log it (prioritize the queued precompute, don't build it now).
const EARNINGS_MAX_PAGES = 10;
const HEAVY_PAGES = 4;
const COIN_CONCURRENCY = 8;

const lc = (s?: string | null) => (s ?? '').toLowerCase();

// Bounded-concurrency map (the /api/recap pattern): at most `limit` in flight.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

let _keyed = false;
function ensureKey() {
  if (!_keyed && process.env.ZORA_API_KEY) { setApiKey(process.env.ZORA_API_KEY); _keyed = true; }
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId'); // posts.user_id = Supabase UUID
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Account creation anchors the chart's x-axis start.
  const { data: userRow } = await supabase
    .from('users').select('created_at').eq('id', userId).maybeSingle();
  const accountCreatedAt: string = userRow?.created_at ?? new Date().toISOString();

  const { data: posts } = await supabase
    .from('posts')
    .select('id, coin_address, creator_address')
    .eq('user_id', userId)
    .eq('token_standard', 'coin')
    .not('coin_address', 'is', null);

  ensureKey();

  let heavy = false;
  let truncated = false;

  // Per coin: full-history swap walk. One coin's failure never sinks the total
  // (returns its events so far). Newest-first pages, no cutoff.
  const processCoin = async (p: { id: string; coin_address: string | null; creator_address: string | null }): Promise<EarningEvent[]> => {
    const creator = lc(p.creator_address);
    const events: EarningEvent[] = [];
    let after: string | undefined;
    let page = 0;
    for (; page < EARNINGS_MAX_PAGES; page++) {
      let res: { data?: { zora20Token?: { swapActivities?: { edges?: { node?: Record<string, unknown> }[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } } } };
      try {
        res = await getCoinSwaps({ address: p.coin_address as `0x${string}`, chain: BASE_CHAIN, first: SWAP_PAGE, after }) as typeof res;
      } catch { break; }
      const sa = res?.data?.zora20Token?.swapActivities;
      const edges = sa?.edges ?? [];
      for (const e of edges) {
        const n = e?.node as { blockTimestamp?: string; activityType?: string; senderAddress?: string } | undefined;
        if (!n || n.activityType !== 'BUY') continue;
        if (lc(n.senderAddress) === creator) continue; // earned from OTHERS only (recap rule)
        const t = Date.parse(n.blockTimestamp ?? '');
        if (!Number.isFinite(t)) continue;
        events.push({ t, usd: swapUsd(n) * CREATOR_FEE_RATE });
      }
      if (!(sa?.pageInfo?.hasNextPage && sa?.pageInfo?.endCursor)) { page++; break; }
      after = sa.pageInfo.endCursor;
    }
    if (page > HEAVY_PAGES) heavy = true;
    if (page >= EARNINGS_MAX_PAGES) truncated = true;
    return events;
  };

  const perCoin = await mapPool(posts ?? [], COIN_CONCURRENCY, processCoin);
  const events = perCoin.flat().sort((a, b) => a.t - b.t);

  if (heavy) console.warn(`[earnings] heavy history for user ${userId} (>${HEAVY_PAGES} pages on a coin) — cron-precompute signal`);

  const payload: EarningsData = { accountCreatedAt, events, heavy, truncated };
  return NextResponse.json(payload);
}
