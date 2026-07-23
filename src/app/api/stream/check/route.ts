// ── POST /api/stream/check — publish-side ready check (Brief V2d) ────────────
// Heals ONE post's status by asking Stream directly. Fired fire-and-forget right after
// publish (and safe to call on-view for a processing post): if a fast encode's webhook
// already fired-and-missed while the row was still being inserted, this lands the status
// without waiting for Stream's retry backoff. Idempotent; only acts on a 'processing' row,
// so it can't be abused beyond triggering a Stream GET for a real post's own uid.
// { postId } → { status }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!accountId || !token) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const postId = String(body.postId ?? '');
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: post } = await supabase.from('posts').select('id, stream_uid, video_status').eq('id', postId).single();
  if (!post || post.video_status !== 'processing' || !post.stream_uid) {
    return NextResponse.json({ status: post?.video_status ?? 'unknown' }); // nothing to heal
  }

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${post.stream_uid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return NextResponse.json({ status: 'processing' });
    const v = (await res.json())?.result;
    const state = v?.status?.state as string | undefined;
    const ready = v?.readyToStream === true || state === 'ready';
    if (ready) {
      await supabase.from('posts').update({
        video_status: 'ready',
        stream_playback_url: v?.playback?.hls ?? null,
        stream_poster_url: typeof v?.thumbnail === 'string' ? v.thumbnail : null,
      }).eq('stream_uid', post.stream_uid);
      return NextResponse.json({ status: 'ready' });
    }
    if (state === 'error') {
      await supabase.from('posts').update({ video_status: 'failed' }).eq('stream_uid', post.stream_uid);
      return NextResponse.json({ status: 'failed' });
    }
  } catch (e) {
    console.error('[stream/check] failed', postId, e);
  }
  return NextResponse.json({ status: 'processing' });
}
