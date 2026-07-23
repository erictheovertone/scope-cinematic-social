// ── /api/stream/reconcile — heal posts stuck in 'processing' ─────────────────
// Brief V2 + V2d + V3c §0b. If a webhook is missed/lost, a post can sit
// video_status='processing' forever. This finds posts stuck >5 min and asks Stream
// directly for each one's real status, then corrects it (matched by stream_uid).
//
// TRIGGERS:
//   · GET  — the Vercel cron (vercel.json, every 5 min). Auth: Bearer <CRON_SECRET>
//            (Vercel sends it when CRON_SECRET is set) OR Bearer <STREAM_WEBHOOK_SECRET>.
//   · POST — manual/admin. Auth: Bearer <STREAM_WEBHOOK_SECRET>.
// Together with the webhook's 5xx-retry and the publish-side check, stuck-processing
// now requires THREE independent failures.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STUCK_MINUTES = 5; // Brief V2d — was 15

async function runReconcile(): Promise<{ checked: number; updated: { uid: string; status: string }[]; error?: string }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!accountId || !token) return { checked: 0, updated: [], error: 'not configured' };

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
  if (error) return { checked: 0, updated: [], error: 'query failed' };

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
  if (updated.length) console.log('[stream/reconcile] healed', updated.length, updated);
  return { checked: stuck?.length ?? 0, updated };
}

// GET — the scheduled cron.
export async function GET(req: NextRequest) {
  const cron = process.env.CRON_SECRET;
  const secret = process.env.STREAM_WEBHOOK_SECRET;
  const auth = req.headers.get('authorization');
  const ok = (cron && auth === `Bearer ${cron}`) || (secret && auth === `Bearer ${secret}`);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const r = await runReconcile();
  return NextResponse.json(r, { status: r.error ? 500 : 200 });
}

// POST — manual/admin (bearer = STREAM_WEBHOOK_SECRET).
export async function POST(req: NextRequest) {
  const secret = process.env.STREAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const r = await runReconcile();
  return NextResponse.json(r, { status: r.error ? 500 : 200 });
}
