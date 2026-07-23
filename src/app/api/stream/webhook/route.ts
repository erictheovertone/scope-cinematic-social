// ── POST /api/stream/webhook — Cloudflare Stream "video ready/error" webhook ──
// Brief V2. Fires ONCE after encoding completes. Signature-verified, then the ONLY
// critical op is the status write; everything else is swallowed (fire-and-forget).
//
// Signature: header `Webhook-Signature: time=<unix>,sig1=<hex>`. Source string =
// `<time>` + `.` + <raw request body> (bytes unaltered). HMAC-SHA256 with
// STREAM_WEBHOOK_SECRET, hex, constant-time compared to sig1.
// Body carries: uid, readyToStream, status.state ('ready'|'error'), playback.hls, thumbnail.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const MAX_SKEW_SECONDS = 60 * 10; // reject stale/replayed signatures (10 min)

function verify(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => {
    const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
  }));
  const time = parts.time, sig1 = parts.sig1;
  if (!time || !sig1) return false;
  // Reject large clock skew (replay guard).
  const t = Number(time);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > MAX_SKEW_SECONDS) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${time}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8'), b = Buffer.from(sig1, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.STREAM_WEBHOOK_SECRET;
  if (!secret) { console.error('[stream/webhook] missing STREAM_WEBHOOK_SECRET'); return NextResponse.json({ error: 'not configured' }, { status: 500 }); }

  const raw = await req.text(); // MUST be the unaltered raw body for signature verification
  // Brief V2b — RECEIPT LOGGING: prove call vs no-call, and verified vs rejected+reason.
  // "never called" = these lines never appear in the Vercel logs → registration/delivery
  // problem (see the report's GET-webhook-config check). "called + rejected" = they do.
  const sigHeader = req.headers.get('webhook-signature');
  if (!verify(raw, sigHeader, secret)) {
    console.warn('[stream/webhook] REJECTED — bad signature', {
      hasHeader: !!sigHeader, bodyLen: raw.length,
    });
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { console.warn('[stream/webhook] verified but bad JSON'); return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const uid = String(body.uid ?? '');
  const state = (body.status as { state?: string } | undefined)?.state;
  const ready = body.readyToStream === true || state === 'ready';
  console.log('[stream/webhook] VERIFIED hit', { uid, state, ready });
  if (!uid) return NextResponse.json({ ok: true }); // nothing to map; ack so Stream stops retrying

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // The status write is the ONLY critical op. Match on stream_uid (service role → RLS bypass).
  const patch: Record<string, unknown> = ready
    ? {
        video_status: 'ready',
        stream_playback_url: (body.playback as { hls?: string } | undefined)?.hls ?? null,
        stream_poster_url: (typeof body.thumbnail === 'string' ? body.thumbnail : null),
      }
    : { video_status: 'failed' };

  // .select() so we can tell "unknown uid" (0 rows matched) from a real write.
  const { data: rows, error } = await supabase.from('posts').update(patch).eq('stream_uid', uid).select('id');
  if (error) {
    console.error('[stream/webhook] status write FAILED', uid, error);
    return NextResponse.json({ error: 'write failed' }, { status: 500 }); // 5xx → Stream retries
  }
  if (!rows?.length) {
    // Brief V3c/V2d — 5xx so Stream RETRIES: the post row may not be inserted yet (publish
    // in flight when a fast encode's webhook fires), so a retry lands once the row exists.
    // Cloudflare retries a bounded number of times then gives up (orphan/test uploads).
    console.warn('[stream/webhook] verified but NO POST matched stream_uid — 503 for retry', uid);
    return NextResponse.json({ error: 'no post matched — retry' }, { status: 503 });
  }
  console.log('[stream/webhook] wrote', ready ? 'ready' : 'failed', 'for post', rows[0].id);
  // 200 so Stream stops retrying a SUCCESSFUL write.
  return NextResponse.json({ ok: true });
}
