// ── POST /api/stream/reconcile — heal posts stuck in 'processing' ────────────
// Brief V2, minimal reconciliation. If a webhook is missed, a post can sit
// video_status='processing' forever. This admin-callable route finds posts stuck
// >15 min and asks Stream directly for each one's real status, then corrects it.
//
// Gate: `Authorization: Bearer <STREAM_WEBHOOK_SECRET>` (reuse the webhook secret so
// no new env). Call manually, or later wire to a cron (we already run crons).
// Shape: POST with the bearer header → { checked, updated: [{uid, status}] }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STUCK_MINUTES = 15;

export async function POST(req: NextRequest) {
  const secret = process.env.STREAM_WEBHOOK_SECRET;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!secret || !accountId || !token) return NextResponse.json({ error: 'not configured' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  const { data: stuck, error } = await supabase
    .from('posts')
    .select('id, stream_uid, created_at')
    .eq('video_status', 'processing')
    .lt('created_at', cutoff)
    .limit(100);
  if (error) return NextResponse.json({ error: 'query failed' }, { status: 500 });

  const updated: { uid: string; status: string }[] = [];
  for (const row of stuck ?? []) {
    const uid = row.stream_uid as string | null;
    if (!uid) continue;
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) continue;
      const j = await res.json();
      const v = j?.result;
      const state = v?.status?.state as string | undefined;
      const ready = v?.readyToStream === true || state === 'ready';
      if (ready) {
        await supabase.from('posts').update({
          video_status: 'ready',
          stream_playback_url: v?.playback?.hls ?? null,
          stream_poster_url: typeof v?.thumbnail === 'string' ? v.thumbnail : null,
        }).eq('stream_uid', uid);
        updated.push({ uid, status: 'ready' });
      } else if (state === 'error') {
        await supabase.from('posts').update({ video_status: 'failed' }).eq('stream_uid', uid);
        updated.push({ uid, status: 'failed' });
      }
      // else: genuinely still processing — leave it.
    } catch (e) {
      console.error('[stream/reconcile] check failed', uid, e);
    }
  }
  return NextResponse.json({ checked: stuck?.length ?? 0, updated });
}
