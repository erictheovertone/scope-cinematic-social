// ── /api/coin-metadata — server-side write of a coin's tokenURI JSON ─────────
//
// WHY SERVER-SIDE (Brief SEC-0 §2c, finding SEC-F2): the 'coin-metadata' bucket
// carried an anon UPDATE policy open to all — ANYONE could rewrite ANY coin's
// on-chain metadata JSON (the name / image / description shown in wallets and on
// Zora), defacing a creator's live asset. Both the anon INSERT and UPDATE
// policies are dropped; the sole writer — the mint flow (lib/zoraCoins
// uploadCoinMetadata) — moves here. The service-role key bypasses storage RLS,
// and the STABLE, immutable `{postId}.json` path + upsert retry semantics are
// preserved EXACTLY (the tokenURI the coin points at is unchanged).
//
// GUARD: the claimed user must OWN the post being coined (the post row is created
// before mint — CreatePostFlow createPost precedes createScopeCoin). Full
// cryptographic identity lands with SEC-1; this is the Phase-0 claimed-owner guard.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const { userId, postId, metadata } = await req.json().catch(() => ({} as Record<string, unknown>));
  if (!userId || !postId || !metadata || typeof metadata !== 'object') {
    return NextResponse.json({ error: 'userId, postId, metadata required' }, { status: 400 });
  }
  // Mirror the client-side V2b guard: a coin must never point at metadata with no image.
  if (typeof (metadata as Record<string, unknown>).image !== 'string' || !(metadata as Record<string, unknown>).image) {
    return NextResponse.json({ error: 'metadata.image required (string)' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Ownership guard — the post must exist and belong to the claimed user.
  const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).maybeSingle();
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });
  if (post.user_id !== userId) return NextResponse.json({ error: 'not your post' }, { status: 403 });

  const blob = Buffer.from(JSON.stringify(metadata));
  const path = `${postId}.json`; // STABLE / immutable — unchanged from the pre-SEC-0 scheme
  const { error } = await supabase.storage
    .from('coin-metadata')
    .upload(path, blob, { cacheControl: '31536000', upsert: true, contentType: 'application/json' });
  if (error) {
    console.error('[coin-metadata] upload failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from('coin-metadata').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
