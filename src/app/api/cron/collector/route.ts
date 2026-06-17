// ── Cron · Collector ranking (weighted composite) + Top-1k awarding (Step 2) ──
//
// Plan: docs/economy/Indexer_Decisions.md §Collector. Same cron-and-cache shape
// as Step 1 (screening-room): read Zora's API for Scope's users, score each by
// a weighted blend of collecting/conviction/activity, rank, cache the top 1000
// in Supabase, and award/clear the Collector badge (is_top_collector). Nightly.
// Idempotent & pure CURRENT standing — re-running yields the same awards.
//
// NO self-hosted indexer. Two reads compose the score:
//   • getProfileBalances(wallet) → distinct posts, distinct creators, $ value
//   • getCoinSwaps(coin) aggregated by trader → per-user trade volume
// Weights + the self-dealing rule live in src/lib/economy/collectorScore.ts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getProfileBalances, getCoinSwaps, setApiKey } from '@zoralabs/coins-sdk';
import {
  COLLECTOR_CONFIG,
  COLLECTOR_WEIGHTS,
  rankCollectors,
  type CollectorSignals,
} from '@/lib/economy/collectorScore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_CHAIN = 8453;
const BAL_MAX_PAGES = 10;   // bound per-user balance pagination (registry ≤ 41 coins)
const SWAP_PAGE = 100;      // getCoinSwaps page size
const SWAP_MAX_PAGES = 25;  // bound per-coin swap pagination

const lc = (s?: string | null) => (s ?? '').toLowerCase();

export async function GET(req: NextRequest) {
  // CRON_SECRET gate (Vercel Cron sends `Authorization: Bearer <secret>`).
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  if (process.env.ZORA_API_KEY) setApiKey(process.env.ZORA_API_KEY);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let apiCalls = 0;

  // ── 1. Registry — coin → creator (denormalized on the post row). ────────────
  const { data: rows, error: regErr } = await supabase
    .from('posts')
    .select('coin_address, creator_address')
    .not('coin_address', 'is', null);
  if (regErr) {
    return NextResponse.json({ error: 'registry read failed', detail: regErr.message }, { status: 500 });
  }
  const creatorOf = new Map<string, string>(); // coin(lower) → creator(lower)
  for (const r of rows ?? []) {
    if (r.coin_address) creatorOf.set(lc(r.coin_address), lc(r.creator_address));
  }
  const registry = [...creatorOf.keys()];

  // ── 2. Canonical collector population — users with a wallet. ────────────────
  const { data: userRows, error: userErr } = await supabase
    .from('users')
    .select('id, wallet_address')
    .not('wallet_address', 'is', null);
  if (userErr) {
    return NextResponse.json({ error: 'users read failed', detail: userErr.message }, { status: 500 });
  }
  const users = (userRows ?? [])
    .filter((u) => u.wallet_address)
    .map((u) => ({ userId: u.id as string, wallet: lc(u.wallet_address as string) }));
  const walletToUser = new Map(users.map((u) => [u.wallet, u.userId]));

  // ── 3. Trade volume — aggregate getCoinSwaps across the registry, keyed by
  //    trader (senderAddress). Self-trades (sender == that coin's creator) are
  //    the creator backing their own post: EXCLUDED as the wash-trade guard
  //    (unless config.countSelfCreated). AMM swaps have no human counterparty
  //    (the pool is the other side), so "distinct-counterparty" isn't derivable
  //    cleanly here — excluding creator self-trades + the 15% cap is the guard.
  const volumeByWallet = new Map<string, number>();
  const seenSwap = new Set<string>(); // de-dup across pages
  for (const coin of registry) {
    const coinCreator = creatorOf.get(coin);
    let after: string | undefined;
    for (let page = 0; page < SWAP_MAX_PAGES; page++) {
      let res: any;
      try {
        res = await getCoinSwaps({ address: coin, chain: BASE_CHAIN, first: SWAP_PAGE, after });
        apiCalls++;
      } catch (e: any) {
        console.error('[collector] getCoinSwaps failed', coin, e?.message);
        break;
      }
      const sa = res?.data?.zora20Token?.swapActivities;
      for (const edge of sa?.edges ?? []) {
        const n = edge?.node;
        if (!n || seenSwap.has(n.id)) continue;
        seenSwap.add(n.id);
        const trader = lc(n.senderAddress);
        if (!walletToUser.has(trader)) continue;               // only score Scope users
        if (!COLLECTOR_CONFIG.countSelfCreated && trader === coinCreator) continue; // wash guard
        const price = parseFloat(n.currencyAmountWithPrice?.priceUsdc ?? '0');
        const amt = n.currencyAmountWithPrice?.currencyAmount?.amountDecimal ?? 0;
        const usd = (Number.isFinite(price) ? price : 0) * (Number.isFinite(amt) ? amt : 0);
        if (usd > 0) volumeByWallet.set(trader, (volumeByWallet.get(trader) ?? 0) + usd);
      }
      if (!sa?.pageInfo?.hasNextPage || !sa?.pageInfo?.endCursor) break;
      after = sa.pageInfo.endCursor;
    }
  }

  // ── 4. Per-user holdings — distinct posts, distinct creators, $ value. ───────
  //    Holdings value = balance(tokens) × tokenPrice.priceInUsdc (valuation is
  //    null from the API, but each coin carries a live USDC price). Self-created
  //    coins excluded (same rule as volume) unless config.countSelfCreated.
  const registrySet = new Set(registry);
  const scored: { userId: string; wallet: string; signals: CollectorSignals }[] = [];
  for (const u of users) {
    const heldCoins = new Set<string>();
    const heldCreators = new Set<string>();
    let value = 0;
    let after: string | undefined;
    for (let page = 0; page < BAL_MAX_PAGES; page++) {
      let res: any;
      try {
        res = await getProfileBalances({ identifier: u.wallet, after });
        apiCalls++;
      } catch (e: any) {
        console.error('[collector] getProfileBalances failed', u.wallet, e?.message);
        break;
      }
      const cb = res?.data?.profile?.coinBalances;
      for (const edge of cb?.edges ?? []) {
        const node = edge?.node;
        const coin = lc(node?.coin?.address);
        if (!coin || !registrySet.has(coin)) continue;            // Scope registry only
        const creator = creatorOf.get(coin);
        if (!COLLECTOR_CONFIG.countSelfCreated && creator === u.wallet) continue; // exclude own posts
        const tokens = Number(BigInt(node.balance ?? '0')) / 1e18;
        if (tokens <= 0) continue;
        heldCoins.add(coin);
        if (creator) heldCreators.add(creator);
        const price = parseFloat(node?.coin?.tokenPrice?.priceInUsdc ?? '0');
        if (Number.isFinite(price) && price > 0) value += tokens * price;
      }
      if (!cb?.pageInfo?.hasNextPage || !cb?.pageInfo?.endCursor) break;
      after = cb.pageInfo.endCursor;
    }
    scored.push({
      userId: u.userId,
      wallet: u.wallet,
      signals: {
        distinctPosts: heldCoins.size,
        distinctCreators: heldCreators.size,
        holdingsValue: value,
        tradeVolume: volumeByWallet.get(u.wallet) ?? 0,
      },
    });
  }

  // ── 5. Percentile-normalize each signal across all users → weighted composite
  //    → rank desc, then take the top-N.
  //    QUALIFYING is tested on RAW signals, NOT composite score: at small N the
  //    percentile floor maps the lowest ACTIVE user to 0 on every signal
  //    (composite 0) even though they clearly collect — filtering on score > 0
  //    would wrongly drop them and contradict "fewer than 1k → everyone with
  //    activity gets Collector". Only true zero-activity users (no holdings, no
  //    trades) are excluded, cleanly.
  const hasActivity = (s: CollectorSignals) =>
    s.distinctPosts > 0 || s.holdingsValue > 0 || s.tradeVolume > 0;
  const ranked = rankCollectors(scored).filter((r) => hasActivity(r.signals));
  const top = ranked.slice(0, COLLECTOR_CONFIG.topN);

  // ── 6. Cache table — overwrite (live snapshot of current standing). ─────────
  await supabase.from('top_collectors').delete().gte('rank', 0);
  if (top.length) {
    const now = new Date().toISOString();
    await supabase.from('top_collectors').insert(
      top.map((r, i) => ({
        rank: i + 1,
        user_id: r.userId,
        score: r.score,
        distinct_posts: r.signals.distinctPosts,
        distinct_creators: r.signals.distinctCreators,
        holdings_value: r.signals.holdingsValue,
        trade_volume: r.signals.tradeVolume,
        computed_at: now,
      })),
    );
  }

  // ── 7. Award is_top_collector to the top-N; clear it from anyone who fell out.
  const eligible = top.map((r) => r.userId);
  const eligibleSet = new Set(eligible);
  const { data: holders } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('is_top_collector', true);
  const toClear = (holders ?? []).map((h) => h.user_id).filter((u) => !eligibleSet.has(u));

  if (eligible.length) await supabase.from('profiles').update({ is_top_collector: true }).in('user_id', eligible);
  if (toClear.length) await supabase.from('profiles').update({ is_top_collector: false }).in('user_id', toClear);

  const summary = {
    ok: true,
    ms: Date.now() - t0,
    apiCalls,
    weights: COLLECTOR_WEIGHTS,
    countSelfCreated: COLLECTOR_CONFIG.countSelfCreated,
    registryCoins: registry.length,
    users: users.length,
    qualifying: ranked.length,
    awarded: eligible.length,
    cleared: toClear.length,
    top5: top.slice(0, 5).map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      score: Number(r.score.toFixed(4)),
      ...r.signals,
    })),
  };
  console.log('[collector] done', JSON.stringify(summary));
  return NextResponse.json(summary);
}
