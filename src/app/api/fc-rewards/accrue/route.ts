// ── /api/fc-rewards/accrue — First Cut reward accrual (append-only ledger) ────
//
// Called fire-and-forget AFTER a receipt-true trade confirms (beside the
// market-notification writer) — a ledger failure never touches the trade path.
// The core lives in lib/economy/fcRewards (shared with the cron's third-party
// sweep); idempotent by UNIQUE(trade_tx, holder_user_id).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { accrueFcTrade } from '@/lib/economy/fcRewards';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
  try {
    const r = await accrueFcTrade(supabase, { postId, coinAddress: post.coin_address, txHash, volumeUsd: volumeUsd as number });
    if (r.accrued) console.log(`[fc-rewards] accrued ${r.accrued} rows · $${r.poolUsd.toFixed(4)} pool · tx ${txHash.slice(0, 10)}…`);
    return NextResponse.json(r);
  } catch (e) {
    console.error('[fc-rewards] accrue failed:', (e as Error).message);
    return NextResponse.json({ accrued: 0, error: (e as Error).message }, { status: 500 });
  }
}
