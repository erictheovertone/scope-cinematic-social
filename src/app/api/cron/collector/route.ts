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
import { getProfileBalances, getCoinSwaps } from '@zoralabs/coins-sdk';
import { ensureZoraApi } from '@/lib/zoraApi';
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
const MAX_RETRIES = 3;      // transient API failures (esp. 429s) retry before giving up
const THROTTLE_MS = 60;     // small gap between API calls — stay under Zora rate limits

const lc = (s?: string | null) => (s ?? '').toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resilient API call: retry transient failures (rate limits are transient) with
// exponential backoff, then throttle. CRITICAL — without this a single 429
// silently zeroes a user's signals, which would not just drop them from the
// ranking but CLEAR their badge (a flaky call must never strip an award).
async function apiCall<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const out = await fn();
      await sleep(THROTTLE_MS);
      return out;
    } catch (e) {
      lastErr = e;
      await sleep(300 * Math.pow(3, attempt)); // 300ms, 900ms, 2.7s
    }
  }
  throw lastErr;
}

export async function GET(req: NextRequest) {
  // CRON_SECRET gate (Vercel Cron sends `Authorization: Bearer <secret>`).
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  ensureZoraApi(); // Brief Z2 — keyed transport (reaches /quote too)
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
  let swapFailures = 0;               // coins whose swap fetch failed (volume incomplete)
  for (const coin of registry) {
    const coinCreator = creatorOf.get(coin);
    let after: string | undefined;
    for (let page = 0; page < SWAP_MAX_PAGES; page++) {
      let res: any;
      try {
        res = await apiCall(() => getCoinSwaps({ address: coin, chain: BASE_CHAIN, first: SWAP_PAGE, after }), `swaps ${coin}`);
        apiCalls++;
      } catch (e: any) {
        console.error('[collector] getCoinSwaps failed after retries', coin, e?.message);
        swapFailures++;
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
  //
  //    INTEGRITY: under load Zora can return a truncated-but-successful balance
  //    page — hasNextPage:false (or an empty body) with FEWER edges than the
  //    wallet actually holds, NO exception thrown. That silently zeroed OVERTONE
  //    and stripped its badge. So a read is trusted only when it's verified
  //    against the API's own holdings total (coinBalances.count): count present
  //    AND every edge gathered. A short/countless read is retried (the truncation
  //    is transient — clean reads are stable); only if it never verifies is the
  //    user left UNRESOLVED (excluded from ranking AND from clearing — their
  //    prior flag is untouched until a clean run re-evaluates them).
  const registrySet = new Set(registry);

  async function evalHoldings(wallet: string): Promise<
    { ok: true; distinctPosts: number; distinctCreators: number; holdingsValue: number } | { ok: false }
  > {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const coins = new Set<string>();
      const creators = new Set<string>();
      let value = 0;
      let after: string | undefined;
      let collected = 0;
      let expected = Infinity; // coinBalances.count, set from the first page
      let threw = false;
      for (let page = 0; page < BAL_MAX_PAGES; page++) {
        let res: any;
        try {
          res = await apiCall(() => getProfileBalances({ identifier: wallet, after }), `balances ${wallet}`);
          apiCalls++;
        } catch (e: any) {
          threw = true;
          break;
        }
        const cb = res?.data?.profile?.coinBalances;
        const edges = cb?.edges ?? [];
        if (page === 0 && typeof cb?.count === 'number') expected = cb.count;
        collected += edges.length;
        for (const edge of edges) {
          const node = edge?.node;
          const coin = lc(node?.coin?.address);
          if (!coin || !registrySet.has(coin)) continue;            // Scope registry only
          const creator = creatorOf.get(coin);
          if (!COLLECTOR_CONFIG.countSelfCreated && creator === wallet) continue; // exclude own posts
          const tokens = Number(BigInt(node.balance ?? '0')) / 1e18;
          if (tokens <= 0) continue;
          coins.add(coin);
          if (creator) creators.add(creator);
          const price = parseFloat(node?.coin?.tokenPrice?.priceInUsdc ?? '0');
          if (Number.isFinite(price) && price > 0) value += tokens * price;
        }
        if (cb?.pageInfo?.hasNextPage && cb?.pageInfo?.endCursor) {
          after = cb.pageInfo.endCursor;
          continue;
        }
        break;
      }
      // Trusted only if count was present (expected !== Infinity) and every
      // holding was gathered. A genuine empty wallet (count 0, 0 edges) passes.
      if (!threw && expected !== Infinity && collected >= expected) {
        return { ok: true, distinctPosts: coins.size, distinctCreators: creators.size, holdingsValue: value };
      }
      console.warn(`[collector] balances unverified for ${wallet} (attempt ${attempt + 1}): got ${collected}, count ${expected} — retrying`);
      await sleep(500 * (attempt + 1)); // settle, then re-read the whole wallet
    }
    return { ok: false };
  }

  const scored: { userId: string; wallet: string; signals: CollectorSignals }[] = [];
  const unresolved = new Set<string>(); // userIds whose balance read never verified — never score/clear
  for (const u of users) {
    const h = await evalHoldings(u.wallet);
    if (!h.ok) {
      unresolved.add(u.userId);
      continue;
    }
    scored.push({
      userId: u.userId,
      wallet: u.wallet,
      signals: {
        distinctPosts: h.distinctPosts,
        distinctCreators: h.distinctCreators,
        holdingsValue: h.holdingsValue,
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
  //    AWARDING is always safe. CLEARING is the only destructive action, so it is
  //    guarded: never strip a user we couldn't fully evaluate (unresolved), and
  //    if ANY swap fetch failed the volume signal is incomplete PLATFORM-WIDE
  //    (it could falsely zero a volume-only collector) → skip clearing entirely
  //    this run. A user only loses Collector on a CLEAN run that genuinely ranks
  //    them out — never because an API call hiccuped.
  const eligible = top.map((r) => r.userId);
  const eligibleSet = new Set(eligible);
  const { data: holders } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('is_top_collector', true);
  const clearSafe = swapFailures === 0;
  const toClear = clearSafe
    ? (holders ?? []).map((h) => h.user_id).filter((u) => !eligibleSet.has(u) && !unresolved.has(u))
    : [];

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
    unresolved: unresolved.size,   // users skipped (balance fetch failed) — flags untouched
    swapFailures,                  // coins with incomplete swap data this run
    clearSkipped: !clearSafe,      // true → clearing held off (volume incomplete platform-wide)
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
