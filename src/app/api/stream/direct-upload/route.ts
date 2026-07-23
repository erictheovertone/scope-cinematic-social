// ── POST /api/stream/direct-upload — mint a one-time Cloudflare Stream upload URL ─
// Brief V2. House law: file bytes NEVER transit our API. This route carries the
// API token (server-only) and asks Stream for a one-time TUS upload URL; the browser
// then PUTs/PATCHes the video STRAIGHT to Stream (see src/lib/streamUpload.ts).
//
// Stream direct-creator TUS creation:
//   POST https://api.cloudflare.com/client/v4/accounts/{acct}/stream?direct_user=true
//   headers: Authorization: Bearer <token>, Tus-Resumable: 1.0.0,
//            Upload-Length: <bytes>, Upload-Metadata: <base64 kv pairs>
//   → 201 with the one-time upload URL in the `Location` header and the video UID in
//     the `stream-media-id` header.
// { uploadLength, maxDurationSeconds?, name? } → { uploadUrl, uid }.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Backstop cap (Stream requires maxDurationSeconds on direct-creator uploads). The
// create-flow UI enforces a tighter limit; this is only an abuse ceiling.
const MAX_DURATION_CAP = 300; // 5 min

// Upload-Metadata is comma-separated `key <base64(value)>` pairs (lowercase keys).
// `requiresignedurls` is intentionally OMITTED → posts are PUBLIC today (Brief V1).
function uploadMetadata(maxDurationSeconds: number, name?: string): string {
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
  const parts = [`maxdurationseconds ${b64(String(maxDurationSeconds))}`];
  if (name) parts.push(`name ${b64(name)}`);
  return parts.join(',');
}

export async function POST(req: NextRequest) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!accountId || !token) {
    console.error('[stream/direct-upload] missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_STREAM_TOKEN');
    return NextResponse.json({ error: 'stream not configured' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const uploadLength = Number(body.uploadLength ?? 0);
  if (!Number.isFinite(uploadLength) || uploadLength <= 0) {
    return NextResponse.json({ error: 'uploadLength (bytes) required' }, { status: 400 });
  }
  const maxDurationSeconds = Math.min(MAX_DURATION_CAP, Math.max(1, Number(body.maxDurationSeconds) || MAX_DURATION_CAP));
  const name = typeof body.name === 'string' ? body.name.slice(0, 120) : undefined;

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?direct_user=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(uploadLength),
      'Upload-Metadata': uploadMetadata(maxDurationSeconds, name),
    },
  });

  // Stream returns 201 with the upload URL in Location and the UID in stream-media-id.
  const uploadUrl = res.headers.get('Location');
  const uid = res.headers.get('stream-media-id');
  if (!res.ok || !uploadUrl || !uid) {
    const detail = await res.text().catch(() => '');
    console.error('[stream/direct-upload] create failed', res.status, detail.slice(0, 500));
    return NextResponse.json({ error: 'stream upload create failed' }, { status: 502 });
  }
  return NextResponse.json({ uploadUrl, uid });
}
