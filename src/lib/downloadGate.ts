// ── downloadGate — Augmented-only file delivery (Brief AUG-1 §3) ─────────────────────────────────
// Both download routes run through here: verify the caller (Privy token), require an ACTIVE
// Augmented tier (read server-side — never trust the client's idea of its tier), log the download
// (user, asset, ts), and return a storage URL signed for 60 seconds.
//
// Honest limit: the buckets are public (playback needs it), so the gate controls the download
// ACTION and its one-minute link — not the object's public read URL.
import 'server-only';
import { NextResponse } from 'next/server';
import { callerOf, serviceClient } from '@/lib/serverAuth';

export const SIGNED_TTL_S = 60;
const PUBLIC_MARKER = '/storage/v1/object/public/';

/** A Supabase public object URL → { bucket, path }, or null for anything else (Stream, external). */
export function storageObject(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url) return null;
  const i = url.indexOf(PUBLIC_MARKER);
  if (i === -1) return null;
  const rest = url.slice(i + PUBLIC_MARKER.length).split('?')[0];
  const slash = rest.indexOf('/');
  return slash === -1 ? null : { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) };
}

const safeName = (s: string) => s.replace(/[^\w .-]+/g, '').trim().slice(0, 80) || 'scope';

type Resolve = (supabase: ReturnType<typeof serviceClient>, id: string) => Promise<{ fileUrl: string | null; filename: string } | null>;

export async function gatedDownload(req: Request, assetType: 'post' | 'track', id: string | null, resolve: Resolve) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return NextResponse.json({ error: 'sign in required' }, { status: 401 });

  const { data: prof } = await supabase
    .from('profiles').select('membership_tier, paid_member_until').eq('user_id', caller.userId).maybeSingle();
  const active = !!prof?.paid_member_until && new Date(prof.paid_member_until as string) > new Date();
  if (!(active && prof?.membership_tier === 'augmented')) {
    return NextResponse.json({ error: 'augmented_required' }, { status: 403 });
  }

  const asset = await resolve(supabase, id);
  if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const obj = storageObject(asset.fileUrl);
  if (!obj) return NextResponse.json({ error: 'no downloadable master for this asset' }, { status: 404 });

  const { data: signed, error } = await supabase.storage.from(obj.bucket)
    .createSignedUrl(obj.path, SIGNED_TTL_S, { download: safeName(asset.filename) + (obj.path.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '') });
  if (error || !signed?.signedUrl) return NextResponse.json({ error: 'could not sign' }, { status: 500 });

  const { error: logErr } = await supabase.from('downloads').insert({ user_id: caller.userId, asset_type: assetType, asset_id: id });
  if (logErr) console.error('[download] log write failed (run mus1_aug1.sql?):', logErr.message);

  return NextResponse.json({ url: signed.signedUrl, expiresIn: SIGNED_TTL_S }, { headers: { 'Cache-Control': 'no-store' } });
}
