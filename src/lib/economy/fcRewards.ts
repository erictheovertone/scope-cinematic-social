// ── First Cut rewards — shared accrual core ───────────────────────────────────
// Used by /api/fc-rewards/accrue (in-app trades, fire-and-forget) AND the
// fc-payouts cron's sweep (third-party trades). Idempotent by construction:
// UNIQUE(trade_tx, holder_user_id) — both callers can see the same trade.

import type { SupabaseClient } from '@supabase/supabase-js';
import { FC_REWARD_RATE, fcRankWeight, TOKENS_PER_PIECE } from '@/lib/economy/tokenomics';
import { ensureZoraApi } from '@/lib/zoraApi';

const RPC_URL = 'https://mainnet.base.org';
const MIN_HOLD_RAW = BigInt(TOKENS_PER_PIECE) * BigInt('1000000000000000000');
export const ZORA_BASE = '0x1111111111166b7FE7bd91427724B487980aFc69';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export async function erc20BalanceOf(token: string, wallet: string): Promise<bigint | null> {
  try {
    const data = '0x70a08231' + wallet.slice(2).toLowerCase().padStart(64, '0');
    const r = await fetch(RPC_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: token, data }, 'latest'] }),
    });
    const j = await r.json();
    return j?.result ? BigInt(j.result) : null;
  } catch { return null; }
}

/** Spot USD per ZORA via the router quote (1000 ZORA → USDC, scaled). Null =
 *  unresolved (reward_zora stays null; USD is the ledger truth). */
export async function zoraSpotUsd(): Promise<number | null> {
  try {
    const { createTradeCall } = await import('@zoralabs/coins-sdk');
    ensureZoraApi(); // Brief Z2 — /quote is never keyed by the SDK itself
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

export interface AccrueResult { accrued: number; poolUsd: number; }

/** Accrue one trade: 0.18% of volume → the coin's ELIGIBLE FC holders
 *  (active award + balance ≥ 1 fragment, fail-open), split by rank weight
 *  over the eligible set. Append-only; duplicates ignored. */
export async function accrueFcTrade(
  supabase: SupabaseClient,
  args: { postId: string; coinAddress: string; txHash: string; volumeUsd: number; spotUsdPerZora?: number | null },
): Promise<AccrueResult> {
  const { postId, coinAddress, txHash, volumeUsd } = args;
  const { data: awards } = await supabase
    .from('first_cut_awards')
    .select('user_id, rank')
    .eq('coin_address', coinAddress)
    .is('expired_at', null)
    .order('rank', { ascending: true });
  if (!awards?.length) return { accrued: 0, poolUsd: 0 };

  const { data: users } = await supabase.from('users').select('id, wallet_address').in('id', awards.map((a) => a.user_id));
  const walletOf = new Map((users ?? []).map((u) => [u.id, u.wallet_address as string]));

  const gated = await Promise.all(awards.map(async (a) => {
    const w = walletOf.get(a.user_id);
    if (!w) return null;
    const bal = await erc20BalanceOf(coinAddress, w);
    return bal === null || bal >= MIN_HOLD_RAW ? { ...a, wallet: w } : null;
  }));
  const eligible = gated.filter(Boolean) as { user_id: string; rank: number; wallet: string }[];
  if (!eligible.length) return { accrued: 0, poolUsd: 0 };

  const spot = args.spotUsdPerZora !== undefined ? args.spotUsdPerZora : await zoraSpotUsd();
  const pool = volumeUsd * FC_REWARD_RATE;
  const n = eligible.length;
  const rows = eligible.map((h, i) => {
    const weight = fcRankWeight(i + 1, n);
    const rewardUsd = pool * weight;
    return {
      coin_address: coinAddress.toLowerCase(),
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
  // .select() so `accrued` counts ACTUAL inserts — a re-seen trade (idempotent
  // ignore) reports 0, keeping sweep/run reports truthful.
  const { data, error } = await supabase.from('fc_rewards').upsert(rows, { onConflict: 'trade_tx,holder_user_id', ignoreDuplicates: true }).select('id');
  if (error) throw new Error(error.message);
  return { accrued: data?.length ?? 0, poolUsd: pool };
}
