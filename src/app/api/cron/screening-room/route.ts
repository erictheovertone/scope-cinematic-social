// ── Cron · Screening Room ranking + SRH awarding (Awarding layer · Step 1) ────
//
// Plan: docs/economy/Indexer_Decisions.md. NO self-hosted indexer — this reads
// Zora's API for Scope's own coins, caches the top-50-by-volume ranking in
// Supabase, and awards/clears the SRH badge on the creators of those posts.
// Runs every 6h (vercel.json crons). Idempotent: re-running yields the same
// state; SRH is pure CURRENT standing (in top-50 → flagged; out → cleared).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCoins, setApiKey } from '@zoralabs/coins-sdk';
import { reconcileCoinFromTx } from '@/lib/zoraCoins';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_CHAIN = 8453;
const TOP_N = 50;
const BATCH = 50;          // getCoins batch size; page the registry above this
const RECONCILE_CAP = 25;  // bound the per-run reconcile of incomplete mints

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
  // set. Require it if configured (recommended in prod); otherwise run open.
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

  // ── Step A reconcile: posts with a coin tx but no coin_address (DB write lost
  //    after an on-chain mint). Recover the address from the receipt so the
  //    registry is complete. Bounded per run; unresolved ones are logged.
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
    return NextResponse.json({ error: 'registry read failed', detail: regErr.message }, { status: 500 });
  }
  const coins = (rows ?? []).filter((r) => r.coin_address);

  // ── 2. Batched getCoins → totalVolume per coin (cumulative volume window).
  const vol = new Map<string, { volume: number; symbol?: string }>();
  for (let i = 0; i < coins.length; i += BATCH) {
    const batch = coins.slice(i, i + BATCH);
    try {
      const res: any = await getCoins({ coins: batch.map((c) => ({ chainId: BASE_CHAIN, collectionAddress: c.coin_address! })) });
      apiCalls++;
      for (const z of res?.data?.zora20Tokens ?? []) {
        if (z?.address) vol.set(z.address.toLowerCase(), { volume: parseFloat(z.totalVolume ?? '0') || 0, symbol: z.symbol });
      }
    } catch (e: any) {
      console.error('[screening-room] getCoins batch failed:', e?.message);
    }
  }

  // ── 3. Rank by volume desc, take top 50 (only coins Zora returned).
  const ranked = coins
    .map((c) => ({ ...c, m: vol.get(c.coin_address!.toLowerCase()) }))
    .filter((c) => c.m)
    .sort((a, b) => b.m!.volume - a.m!.volume)
    .slice(0, TOP_N);

  // ── 4. Cache table — overwrite (last-write-wins live snapshot).
  await supabase.from('screening_room').delete().gte('rank', 0);
  if (ranked.length) {
    const now = new Date().toISOString();
    await supabase.from('screening_room').insert(
      ranked.map((c, i) => ({
        rank: i + 1,
        coin_address: c.coin_address,
        creator_address: c.creator_address ?? null,
        user_id: c.user_id ?? null,
        symbol: c.m!.symbol ?? c.ticker ?? null,
        volume: c.m!.volume,
        computed_at: now,
      })),
    );
  }

  // ── 5. Award SRH to the CREATORS of the top-50; clear from those who fell out.
  //    Reconcile against current holders so it reflects pure standing.
  const eligible = [...new Set(ranked.map((c) => c.user_id).filter(Boolean))] as string[];
  const { data: holders } = await supabase.from('profiles').select('user_id').eq('is_screening_room_holder', true);
  const eligibleSet = new Set(eligible);
  const toClear = (holders ?? []).map((h) => h.user_id).filter((u) => !eligibleSet.has(u));

  if (eligible.length) await supabase.from('profiles').update({ is_screening_room_holder: true }).in('user_id', eligible);
  if (toClear.length) await supabase.from('profiles').update({ is_screening_room_holder: false }).in('user_id', toClear);

  const summary = {
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
  console.log('[screening-room] done', JSON.stringify(summary));
  return NextResponse.json(summary);
}
