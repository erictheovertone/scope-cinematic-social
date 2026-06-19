// ── /api/first-cut/expire — in-app sell hook (lifecycle Change 3a) ───────────
//
// Called after a sell confirms in-app. Expires the seller's First Cut slot on
// that coin IFF: (1) a real sell happened on-chain (coin left the seller's
// wallet — the balance-DECREASE signal, so a pure price drop never triggers it),
// AND (2) the remaining holding is worth < the $4.50 keep-floor
// (FIRST_CUT_CONFIG.minQualifyingUsd — the SAME constant as the earn floor).
//
// NEVER expires on an unverified read (a flaky/empty price or balance read
// defers). A false expiry is a false revocation — as bad as a false award.
// Only flips active → expired; expiry is permanent (a later re-buy never clears
// it — the row's expired_at stays set, and ON CONFLICT DO NOTHING blocks re-award).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { confirmSellOnChain, remainingHoldingUsd, FIRST_CUT_CONFIG } from '@/lib/economy/firstCut';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ expired: false, error: 'bad request' }, { status: 400 }); }
  const { postId, txHash, seller } = body ?? {};
  if (!postId || !txHash || !seller) {
    return NextResponse.json({ expired: false, error: 'postId, txHash, seller required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: post } = await supabase
    .from('posts')
    .select('coin_address, token_standard')
    .eq('id', postId)
    .maybeSingle();
  if (!post?.coin_address || post.token_standard !== 'coin') {
    return NextResponse.json({ expired: false, error: 'not a coin post' });
  }

  // Seller → users.id → an ACTIVE slot on this coin? (Cheap checks first.)
  const { data: userRow } = await supabase
    .from('users').select('id').ilike('wallet_address', seller).maybeSingle();
  if (!userRow?.id) return NextResponse.json({ expired: false });
  const { data: slot } = await supabase
    .from('first_cut_awards')
    .select('id, rank')
    .eq('user_id', userRow.id)
    .eq('coin_address', post.coin_address)
    .is('expired_at', null)
    .maybeSingle();
  if (!slot) return NextResponse.json({ expired: false }); // no active slot (none, or already expired)

  // (1) Confirm a REAL sell by this seller on-chain (the balance-decrease signal).
  const sold = await confirmSellOnChain(txHash, post.coin_address, seller);
  if (!sold) return NextResponse.json({ expired: false, error: 'sell not confirmed on-chain' });

  // (2) Remaining value — NEVER expire on an unresolved read.
  const { usd, resolved } = await remainingHoldingUsd(post.coin_address, seller);
  if (!resolved) return NextResponse.json({ expired: false, deferred: true });

  const keep = FIRST_CUT_CONFIG.minQualifyingUsd;
  if (usd >= keep) return NextResponse.json({ expired: false, remainingUsd: usd }); // still ≥ keep-floor

  // Confirmed sell + remaining below the keep-floor → expire (permanent).
  await supabase
    .from('first_cut_awards')
    .update({ expired_at: new Date().toISOString() })
    .eq('id', slot.id)
    .is('expired_at', null);

  console.log(`[first-cut] EXPIRED slot rank=${slot.rank} user=${userRow.id} coin=${post.coin_address.toLowerCase()} remaining=$${usd.toFixed(2)}`);
  return NextResponse.json({ expired: true, rank: slot.rank, remainingUsd: usd });
}
