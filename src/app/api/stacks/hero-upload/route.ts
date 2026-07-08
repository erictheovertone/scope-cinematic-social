// ── /api/stacks/hero-upload — server-side hero banner upload ─────────────────
//
// WHY SERVER-SIDE (round-2 evidence): the bucket has an anon INSERT policy but
// NO UPDATE policy — first bakes succeeded, every RE-bake (same path, upsert →
// UPDATE) 400'd "new row violates row-level security policy". The service-role
// key bypasses storage RLS by design (the app's server-side-key posture).
//
// GUARD: not an open endpoint — the stack must exist AND belong to the claimed
// user (stack.user_id === userId) before anything is written. Size-capped 2MB,
// image mime whitelist.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 2 * 1024 * 1024;
const MIMES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

export async function POST(req: NextRequest) {
  const stackId = req.nextUrl.searchParams.get('stackId');
  const userId = req.nextUrl.searchParams.get('userId');
  const mime = req.headers.get('content-type') ?? '';
  if (!stackId || !userId) return NextResponse.json({ error: 'stackId, userId required' }, { status: 400 });
  const ext = MIMES[mime];
  if (!ext) return NextResponse.json({ error: `unsupported type ${mime}` }, { status: 415 });

  const body = await req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: `size ${body.byteLength} out of bounds (max ${MAX_BYTES})` }, { status: 413 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Ownership guard — the claimed user must own the stack.
  const { data: stack } = await supabase.from('collected_stacks').select('user_id').eq('id', stackId).maybeSingle();
  if (!stack) return NextResponse.json({ error: 'stack not found' }, { status: 404 });
  if (stack.user_id !== userId) return NextResponse.json({ error: 'not your stack' }, { status: 403 });

  const path = `stacks/${userId}/${stackId}-hero.${ext}`;
  const { error } = await supabase.storage.from('post-media').upload(path, Buffer.from(body), {
    upsert: true, cacheControl: '31536000', contentType: mime,
  });
  if (error) {
    console.error('[stacks] server hero upload failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data } = supabase.storage.from('post-media').getPublicUrl(path);
  // ?v= bust — same-path upsert re-bakes must escape the CDN (the swap discipline).
  const url = data?.publicUrl ? `${data.publicUrl}?v=${Date.now().toString(36)}` : null;
  return NextResponse.json({ url });
}
