// ── /api/first-cut/check — in-flow First Cut awarding (Step 3, Part 1) ────────
//
// Called by the BUY flow right after a buy confirms on-chain. Determines whether
// THIS buy made the buyer one of the coin's first 10 external collectors, and if
// so writes the PERMANENT award (write-once) and tells the client to celebrate.
//
// Authoritative, never optimistic (the Step-2 lesson): the ranking comes from a
// COUNT-VERIFIED swap read, and the buy itself is confirmed against on-chain
// truth (the receipt). A truncated/degraded read DEFERS — it never false-awards.
// Server-side so it holds the Zora key + service-role writes and can't be spoofed.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeFirstCutRank, confirmBuyOnChain, FIRST_CUT_CONFIG } from '@/lib/economy/firstCut';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const lc = (s?: string | null) => (s ?? '').toLowerCase();

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ earned: false, error: 'bad request' }, { status: 400 });
  }
  const { postId, txHash, buyer, buyUsd } = body ?? {};
  if (!postId || !txHash || !buyer) {
    return NextResponse.json({ earned: false, error: 'postId, txHash, buyer required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Post → coin + creator. Must be a coin post (legacy 1155s have no market).
  const { data: post } = await supabase
    .from('posts')
    .select('coin_address, creator_address, token_standard')
    .eq('id', postId)
    .maybeSingle();
  if (!post?.coin_address || post.token_standard !== 'coin') {
    return NextResponse.json({ earned: false, error: 'not a coin post' });
  }

  // GROUND TRUTH: the receipt must show this coin transferred TO this buyer in
  // this tx. Blocks spoofed/replayed claims — no award without a real buy.
  const confirmed = await confirmBuyOnChain(txHash, post.coin_address, buyer);
  if (!confirmed) {
    return NextResponse.json({ earned: false, error: 'buy not confirmed on-chain' });
  }

  // Buyer wallet → Scope user. Anonymous buyers can't carry a badge.
  const { data: userRow } = await supabase
    .from('users')
    .select('id')
    .ilike('wallet_address', buyer)
    .maybeSingle();
  if (!userRow?.id) {
    return NextResponse.json({ earned: false, error: 'no Scope user for wallet' });
  }
  const userId = userRow.id as string;

  // Already a First Cut holder of this coin → earned, but NOT a new celebration.
  const { data: existing } = await supabase
    .from('first_cut_awards')
    .select('rank')
    .eq('user_id', userId)
    .eq('coin_address', post.coin_address)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ earned: true, firstTime: false, rank: existing.rank });
  }

  // The CURRENT buy must clear the $5 floor. Sub-$5 is a DEFINITIVE no-earn (not
  // a defer): it never qualifies and never consumes a slot.
  const min = FIRST_CUT_CONFIG.minQualifyingUsd;
  if (typeof buyUsd === 'number' && buyUsd < min) {
    return NextResponse.json({ earned: false, belowMin: true });
  }

  // Authoritative rank among QUALIFYING (≥$5) external founders. Unverified
  // (degraded/truncated) read → DEFER (no write, no celebration).
  const { rank, slotsFilled, verified } = await computeFirstCutRank(post.coin_address, post.creator_address ?? '', buyer);
  if (!verified) {
    return NextResponse.json({ earned: false, deferred: true });
  }
  if (rank == null) {
    // Not (yet) among the qualifying founders. If this buy clears $5 and a slot
    // is still open, the just-confirmed buy likely isn't indexed in the swap
    // feed yet → DEFER so a later VERIFIED pass awards the exact rank (never
    // guess a slot). A full window (slots filled) = a genuine 11th+ qualifying
    // buyer → silent no-earn.
    const qualifiesOnValue = typeof buyUsd !== 'number' || buyUsd >= min;
    if (qualifiesOnValue && slotsFilled < FIRST_CUT_CONFIG.slots) {
      return NextResponse.json({ earned: false, deferred: true });
    }
    return NextResponse.json({ earned: false }); // sub-$5, or 11th+ qualifying — no record
  }

  // WRITE-ONCE. ON CONFLICT (user_id, coin_address) DO NOTHING handles a race
  // between two concurrent confirmations of the same buyer/coin.
  const { error: insErr } = await supabase
    .from('first_cut_awards')
    .upsert(
      { user_id: userId, coin_address: post.coin_address, rank },
      { onConflict: 'user_id,coin_address', ignoreDuplicates: true },
    );
  if (insErr) {
    console.error('[first-cut] insert failed', insErr.message);
    return NextResponse.json({ earned: false, error: 'write failed' }, { status: 500 });
  }

  // firstTime is true unless the upsert collided with a row written a moment ago
  // (concurrent confirmation) — re-read to be exact, so Moment 1 fires once.
  const { data: after } = await supabase
    .from('first_cut_awards')
    .select('rank, awarded_at')
    .eq('user_id', userId)
    .eq('coin_address', post.coin_address)
    .maybeSingle();
  const firstTime = !!after && Date.now() - new Date(after.awarded_at as any).getTime() < 10_000;

  console.log(`[first-cut] AWARDED user=${userId} coin=${lc(post.coin_address)} rank=${rank} firstTime=${firstTime}`);
  return NextResponse.json({ earned: true, firstTime, rank: after?.rank ?? rank });
}
