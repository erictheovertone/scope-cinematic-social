// ── /api/fc-rewards/accrue — First Cut reward accrual (append-only ledger) ────
//
// Called fire-and-forget AFTER a receipt-true trade confirms (beside the
// market-notification writer) — a ledger failure never touches the trade path.
// Per trade of a coin with active FC holders: FC_REWARD_RATE (0.18%) of the
// trade's volume splits across the holders by linear rank weight.
//
// ELIGIBILITY = the badgeHoldings truth at accrual time: award expired_at IS
// NULL AND on-chain balance ≥ 1 whole fragment (fail-open per read — a flaky
// RPC keeps the holder in; consistent with the badge engine's discipline).
// Weights are computed over the ELIGIBLE set (dense re-rank by original award
// rank) so the pool always fully distributes.
//
// IDEMPOTENT: UNIQUE(trade_tx, holder_user_id) — re-processing a trade (the
// in-app hook AND the cron sweep may both see it) can never double-accrue.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FC_REWARD_RATE, fcRankWeight, TOKENS_PER_PIECE } from '@/lib/economy/tokenomics';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const RPC_URL = 'https://mainnet.base.org';
const MIN_HOLD_RAW = BigInt(TOKENS_PER_PIECE) * BigInt('1000000000000000000');
const ZORA_BASE = '0x1111111111166b7FE7bd91427724B487980aFc69';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

async function balanceOf(coin: string, wallet: string): Promise<bigint | null> {
  try {
    const data = '0x70a08231' + wallet.slice(2).toLowerCase().padStart(64, '0');
    const r = await fetch(RPC_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: coin, data }, 'latest'] }),
    });
    const j = await r.json();
    return j?.result ? BigInt(j.result) : null;
  } catch { return null; }
}

/** Spot USD per ZORA via the Zora router quote (1000 ZORA → USDC, scaled) —
 *  the same engine every swap quote uses. Null when unresolved (reward_zora
 *  stays null; USD is the ledger truth, ZORA the payout-time convenience). */
async function zoraSpotUsd(): Promise<number | null> {
  try {
    const { createTradeCall } = await import('@zoralabs/coins-sdk');
    const probe = BigInt(1000) * BigInt('1000000000000000000');
    const q = await createTradeCall({
      tradeType: 'sell' as never,
      sell: { type: 'erc20', address: ZORA_BASE as `0x${string}` },
      buy: { type: 'erc20', address: USDC_BASE as `0x${string}` },
      amountIn: probe,
      slippage: 0.05,
      sender: '0x0000000000000000000000000000000000000001',
    } as never) as { quote?: { amountOut?: string } };
    const out = q?.quote?.amountOut ? Number(q.quote.amountOut) / 1e6 : null;
    return out && out > 0 ? out / 1000 : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  let body: { postId?: string; txHash?: string; volumeUsd?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ accrued: 0, error: 'bad request' }, { status: 400 }); }
  const { postId, txHash, volumeUsd } = body ?? {};
  if (!postId || !txHash || !Number.isFinite(volumeUsd) || (volumeUsd as number) <= 0 || (volumeUsd as number) > 1_000_000) {
    return NextResponse.json({ accrued: 0, error: 'postId, txHash, volumeUsd required' }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: post } = await supabase.from('posts').select('coin_address, token_standard').eq('id', postId).maybeSingle();
  if (!post?.coin_address || post.token_standard !== 'coin') return NextResponse.json({ accrued: 0 });

  // Active awards for this coin, oldest rank first.
  const { data: awards } = await supabase
    .from('first_cut_awards')
    .select('user_id, rank')
    .eq('coin_address', post.coin_address)
    .is('expired_at', null)
    .order('rank', { ascending: true });
  if (!awards?.length) return NextResponse.json({ accrued: 0 });

  const { data: users } = await supabase.from('users').select('id, wallet_address').in('id', awards.map((a) => a.user_id));
  const walletOf = new Map((users ?? []).map((u) => [u.id, u.wallet_address as string]));

  // Balance-gate (≥1 fragment; unresolved read keeps the holder — fail-open).
  const gated = await Promise.all(awards.map(async (a) => {
    const w = walletOf.get(a.user_id);
    if (!w) return null;
    const bal = await balanceOf(post.coin_address as string, w);
    return bal === null || bal >= MIN_HOLD_RAW ? { ...a, wallet: w } : null;
  }));
  const eligible = gated.filter(Boolean) as { user_id: string; rank: number; wallet: string }[];
  if (!eligible.length) return NextResponse.json({ accrued: 0 });

  const spot = await zoraSpotUsd();
  const pool = (volumeUsd as number) * FC_REWARD_RATE;
  const n = eligible.length;
  const rows = eligible.map((h, i) => {
    const weight = fcRankWeight(i + 1, n); // dense re-rank over the eligible set
    const rewardUsd = pool * weight;
    return {
      coin_address: (post.coin_address as string).toLowerCase(),
      post_id: postId,
      holder_user_id: h.user_id,
      holder_wallet: h.wallet.toLowerCase(),
      trade_tx: txHash.toLowerCase(),
      trade_volume_usd: volumeUsd,
      reward_usd: rewardUsd,
      reward_zora: spot ? rewardUsd / spot : null,
      rank: h.rank,
      weight,
    };
  });

  // Append-only + idempotent: duplicate (trade_tx, holder) rows are ignored.
  const { error } = await supabase.from('fc_rewards').upsert(rows, { onConflict: 'trade_tx,holder_user_id', ignoreDuplicates: true });
  if (error) {
    console.error('[fc-rewards] accrue failed:', error.message);
    return NextResponse.json({ accrued: 0, error: error.message }, { status: 500 });
  }
  console.log(`[fc-rewards] accrued ${rows.length} rows · $${pool.toFixed(4)} pool · tx ${txHash.slice(0, 10)}…`);
  return NextResponse.json({ accrued: rows.length, poolUsd: pool });
}
