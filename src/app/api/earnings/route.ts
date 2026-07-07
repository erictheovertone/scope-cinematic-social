// ── /api/earnings — ALL-TIME creator earnings from ACTUAL rewards (server) ────
//
// v2 (rewards-indexed): earnings are no longer estimated (volumeUsd ×
// CREATOR_FEE_RATE, buys only) — they are DECODED from the actual ZORA reward
// transfers the distributor pays the creator inside every swap tx, BOTH
// directions, self-trades included (real ZORA arriving is real earnings).
// Ground truth: the fee-test decode ($0.2500 buy + $0.1334 sell) reproduces
// exactly. Per coin: page getCoinSwaps (full history) → one receipt per swap →
// decodeCreatorReward. USD is valued at RECEIPT TIME (swapUsd ÷ the tx's ZORA
// leg); fallback: last derived price in this request, then a spot quote.
// LIVE-READ v1: right at current scale (a dozen cheap calls, session-cached
// client-side). The heavy/truncated flags are the cron-table tripwire.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCoinSwaps, setApiKey, createTradeCall } from '@zoralabs/coins-sdk';
import { swapUsd } from '@/lib/economy/firstCut';
import { decodeCreatorReward, mapPoolRewards } from '@/lib/economy/rewardsIndex';
import { getScopePlatformReferrer } from '@/lib/zoraCoins';
import type { EarningEvent, EarningsData } from '@/lib/economy/earnings';

export const dynamic = 'force-dynamic';

const BASE_CHAIN = 8453;
const SWAP_PAGE = 100;
const EARNINGS_MAX_PAGES = 10;   // per-coin swap pagination bound
const HEAVY_PAGES = 4;           // cron-precompute signal
const RECEIPT_CAP = 300;         // per-request receipt bound (cap → truncated)
const COIN_CONCURRENCY = 6;
const RPC_URL = process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || 'https://mainnet.base.org';

let _keyed = false;
function ensureKey() {
  if (!_keyed && process.env.ZORA_API_KEY) { setApiKey(process.env.ZORA_API_KEY); _keyed = true; }
}

// Spot ZORA/USD (fallback pricing only) — one quote per request, best-effort.
async function spotZoraUsd(sender: string): Promise<number | null> {
  try {
    const q: any = await createTradeCall({
      sell: { type: 'erc20', address: '0x1111111111166b7FE7bd91427724B487980aFc69' },
      buy: { type: 'erc20', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
      amountIn: BigInt('1000000000000000000000'), // 1,000 ZORA
      slippage: 0.05,
      sender: sender as `0x${string}`,
      recipient: sender as `0x${string}`,
    });
    const out = Number(BigInt(q?.quote?.amountOut ?? 0)) / 1e6;
    return out > 0 ? out / 1000 : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId'); // posts.user_id = Supabase UUID
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: userRow } = await supabase
    .from('users').select('created_at').eq('id', userId).maybeSingle();
  const accountCreatedAt: string = userRow?.created_at ?? new Date().toISOString();

  const { data: posts } = await supabase
    .from('posts')
    .select('id, coin_address, creator_address, ticker, poster_url, thumbnail_url, media_urls, layout_id')
    .eq('user_id', userId)
    .eq('token_standard', 'coin')
    .not('coin_address', 'is', null);

  ensureKey();
  const referrer = getScopePlatformReferrer();

  let heavy = false;
  let truncated = false;
  let receiptsUsed = 0;
  let lastPrice: number | null = null; // request-scoped fallback (near-time at our scale)

  // Per coin: full swap history → decode each swap's ACTUAL creator reward.
  const processCoin = async (p: { id: string; coin_address: string | null; creator_address: string | null }): Promise<EarningEvent[]> => {
    const creator = p.creator_address;
    if (!creator) return [];
    // 1. Collect the coin's swaps (tx hash + timestamp + USD notional).
    const swaps: { t: number; tx: string; usd: number }[] = [];
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
        const n = e?.node as { blockTimestamp?: string; transactionHash?: string; txHash?: string } | undefined;
        if (!n) continue;
        const t = Date.parse(n.blockTimestamp ?? '');
        const tx = (n.transactionHash ?? n.txHash) as string | undefined;
        if (!Number.isFinite(t) || !tx) continue;
        swaps.push({ t, tx, usd: swapUsd(n) });
      }
      if (!(sa?.pageInfo?.hasNextPage && sa?.pageInfo?.endCursor)) { page++; break; }
      after = sa.pageInfo.endCursor;
    }
    if (page > HEAVY_PAGES) heavy = true;
    if (page >= EARNINGS_MAX_PAGES) truncated = true;

    // 2. Decode each swap's receipt → the exact reward legs.
    const bounded = swaps.filter(() => {
      if (receiptsUsed >= RECEIPT_CAP) { truncated = true; return false; }
      receiptsUsed++;
      return true;
    });
    const decoded = await mapPoolRewards(bounded, 6, async (s) => {
      const d = await decodeCreatorReward({ rpcUrl: RPC_URL, txHash: s.tx, creatorAddress: creator, referrerAddress: referrer, swapUsd: s.usd });
      return { s, d };
    });

    const events: EarningEvent[] = [];
    for (const { s, d } of decoded) {
      if (!d || !(d.rewardZora > 0)) continue;
      let price = d.priceUsdPerZora;
      if (price != null) lastPrice = price;
      if (price == null) price = lastPrice; // near-time neighbor fallback
      if (price == null) price = await spotZoraUsd(referrer); // final fallback
      events.push({ t: s.t, usd: d.rewardZora * (price ?? 0) });
    }
    return events;
  };

  const perCoin = await mapPoolRewards(posts ?? [], COIN_CONCURRENCY, processCoin);
  const events = perCoin.flat().sort((a, b) => a.t - b.t);

  // Per-post rollup for the wallet's PORTFOLIO detail — same decoded events,
  // grouped: the tab's total is sumAll(events) by construction (zero drift vs
  // the SCOPE EARNINGS stat).
  const byPost = (posts ?? []).map((p: Record<string, unknown>, i: number) => ({
    postId: p.id as string,
    coinAddress: (p.coin_address as string | null) ?? null,
    usd: (perCoin[i] ?? []).reduce((s, ev) => s + ev.usd, 0),
    ticker: (p.ticker as string | null) ?? null,
    thumb: (p.poster_url as string | null) || (p.thumbnail_url as string | null) || ((p.media_urls as string[] | null)?.[0] ?? null),
    layoutId: (p.layout_id as string | null) ?? null,
  })).filter((x) => x.usd > 0).sort((a, b) => b.usd - a.usd);

  if (heavy) console.warn(`[earnings] heavy history for user ${userId} (>${HEAVY_PAGES} pages on a coin) — cron-precompute signal`);

  const payload: EarningsData = { accountCreatedAt, events, heavy, truncated, byPost };
  return NextResponse.json(payload);
}
