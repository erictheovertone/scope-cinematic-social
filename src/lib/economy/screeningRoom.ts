// ── Screening Room recompute — the shared, callable ranking pass ─────────────
//
// Extracted VERBATIM from the cron route so BOTH the daily cron (backstop) and the
// on-demand refresh route reuse the SAME hardened reads — never two copies that can
// drift. Reads Zora's API for Scope's coins, caches the top-50-by-MARKET-CAP ranking
// in `screening_room`, and awards/clears SRH on those creators.
//
// HARDENED READ (do not rewrite): coins are read in BATCH=20 (getCoins' hard cap),
// each batch retried MAX_RETRIES times with exponential backoff on 429. If ANY batch
// still fails → incompleteRead → the run ABORTS WITHOUT WRITING, keeping the last
// good cache (a partial read must never zero/drop a coin). Untraded coins (marketCap
// 0 = Zora's real value, not a gap) are correctly excluded.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCoins } from '@zoralabs/coins-sdk';
import { ensureZoraApi } from '@/lib/zoraApi';
import { reconcileCoinFromTx } from '@/lib/zoraCoins';

const BASE_CHAIN = 8453;
const TOP_N = 50;
const BATCH = 20;          // getCoins hard cap = 20 ids/call; page above this
const RECONCILE_CAP = 25;  // bound the per-run reconcile of incomplete mints
const MAX_RETRIES = 4;     // retry a 429'd batch before treating the run as incomplete

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RecomputeResult {
  ok: boolean;
  ms: number;
  apiCalls: number;
  skipped?: string;
  registryCoins?: number;
  ranked?: number;
  srhAwarded?: number;
  srhCleared?: number;
  reconciled?: number;
  reconcileUnresolved?: string[];
}

/** The full Screening Room recompute (stages A–E). Pure of HTTP concerns so the cron
 *  and the refresh route can both call it. Caller supplies a service-role client. */
export async function recomputeScreeningRoom(supabase: SupabaseClient): Promise<RecomputeResult> {
  const t0 = Date.now();
  ensureZoraApi(); // Brief Z2 — keyed transport
  let apiCalls = 0;

  // ── Step A reconcile: posts with a coin tx but no coin_address (DB write lost
  //    after an on-chain mint). Recover the address from the receipt. Bounded.
  let reconciled = 0;
  const reconcileFails: string[] = [];
  try {
    const { data: orphans } = await supabase
      .from('posts')
      .select('id, coin_tx_hash')
      .is('coin_address', null)
      .not('coin_tx_hash', 'is', null)
      .limit(RECONCILE_CAP);
    for (const o of orphans ?? []) {
      const addr = await reconcileCoinFromTx(o.coin_tx_hash as string);
      if (addr) {
        await supabase.from('posts').update({ coin_address: addr }).eq('id', o.id);
        reconciled++;
      } else {
        reconcileFails.push(o.id as string);
      }
    }
  } catch (e: any) {
    console.error('[screening-room] reconcile error:', e?.message);
  }

  // ── 1. Registry — every minted Scope coin (denormalized creator on the row).
  const { data: rows, error: regErr } = await supabase
    .from('posts')
    .select('coin_address, creator_address, user_id, ticker')
    .not('coin_address', 'is', null);
  if (regErr) {
    return { ok: false, ms: Date.now() - t0, apiCalls, skipped: 'registry-read-failed' };
  }
  const coins = (rows ?? []).filter((r: any) => r.coin_address);

  // ── 2. Batched getCoins → marketCap (+ volume). Each batch RETRIES 429s; if a
  //    batch still fails after retries the read is INCOMPLETE → abort below.
  const stats = new Map<string, { marketCap: number; volume: number; symbol?: string }>();
  let incompleteRead = false;
  for (let i = 0; i < coins.length; i += BATCH) {
    const batch = coins.slice(i, i + BATCH);
    let ok = false;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res: any = await getCoins({ coins: batch.map((c: any) => ({ chainId: BASE_CHAIN, collectionAddress: c.coin_address! })) });
        apiCalls++;
        for (const z of res?.data?.zora20Tokens ?? []) {
          if (z?.address) stats.set(z.address.toLowerCase(), {
            marketCap: parseFloat(z.marketCap ?? '0') || 0,
            volume: parseFloat(z.totalVolume ?? '0') || 0,
            symbol: z.symbol,
          });
        }
        ok = true;
        break;
      } catch (e: any) {
        if (attempt < MAX_RETRIES - 1) { await sleep(500 * Math.pow(2, attempt)); continue; }
        console.error('[screening-room] getCoins batch failed after retries:', e?.message);
      }
    }
    if (!ok) incompleteRead = true;
  }

  // ABORT on an incomplete read — keep the existing valid cache (keep-last-good).
  if (incompleteRead) {
    console.warn('[screening-room] incomplete read — keeping existing cache, skipping write.');
    return { ok: false, ms: Date.now() - t0, apiCalls, skipped: 'incomplete-read', reconciled };
  }

  // ── 3. Rank by MARKET CAP desc, top 50. marketCap > 0 only (an untraded coin's
  //    real value is 0, not a gap — it has no market to showcase).
  const ranked = coins
    .map((c: any) => ({ ...c, m: stats.get(c.coin_address!.toLowerCase()) }))
    .filter((c: any) => c.m && c.m.marketCap > 0)
    .sort((a: any, b: any) => b.m!.marketCap - a.m!.marketCap)
    .slice(0, TOP_N);

  // ── 4. Cache table — overwrite (last-write-wins live snapshot). computed_at is
  //    the freshness stamp the on-demand staleness check reads.
  await supabase.from('screening_room').delete().gte('rank', 0);
  if (ranked.length) {
    const now = new Date().toISOString();
    await supabase.from('screening_room').insert(
      ranked.map((c: any, i: number) => ({
        rank: i + 1,
        coin_address: c.coin_address,
        creator_address: c.creator_address ?? null,
        user_id: c.user_id ?? null,
        symbol: c.m!.symbol ?? c.ticker ?? null,
        market_cap: c.m!.marketCap,
        volume: c.m!.volume,
        computed_at: now,
      })),
    );
  }

  // ── 5. Award SRH to the CREATORS of the top-50; clear from those who fell out.
  const eligible = [...new Set(ranked.map((c: any) => c.user_id).filter(Boolean))] as string[];
  const { data: holders } = await supabase.from('profiles').select('user_id').eq('is_screening_room_holder', true);
  const eligibleSet = new Set(eligible);
  const toClear = (holders ?? []).map((h: any) => h.user_id).filter((u: any) => !eligibleSet.has(u));

  if (eligible.length) await supabase.from('profiles').update({ is_screening_room_holder: true }).in('user_id', eligible);
  if (toClear.length) await supabase.from('profiles').update({ is_screening_room_holder: false }).in('user_id', toClear);

  // srh_count — how many of the user's posts are in the room (the bio sheet's
  // count pill). Best-effort: tolerate the column not existing yet.
  try {
    const counts = new Map<string, number>();
    for (const c of ranked) if (c.user_id) counts.set(c.user_id, (counts.get(c.user_id) ?? 0) + 1);
    for (const [uid, n] of counts) await supabase.from('profiles').update({ srh_count: n }).eq('user_id', uid);
    for (const uid of toClear) await supabase.from('profiles').update({ srh_count: 0 }).eq('user_id', uid);
  } catch (e) { console.warn('[screening-room] srh_count write skipped:', (e as Error)?.message); }

  const result: RecomputeResult = {
    ok: true,
    ms: Date.now() - t0,
    apiCalls,
    registryCoins: coins.length,
    ranked: ranked.length,
    srhAwarded: eligible.length,
    srhCleared: toClear.length,
    reconciled,
    reconcileUnresolved: reconcileFails,
  };
  console.log('[screening-room] recompute done', JSON.stringify(result));
  return result;
}
