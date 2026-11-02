// ── POST /api/music/manage/track-cover?trackId= — replace a TRACK's artwork (owner only, MUS-3 §2) ─
// Sibling of /api/music/manage/cover (album covers). Binary image body, same sharp bake (600² WebP,
// EXIF-rotated, centre crop), VERIFIED: the caller's token must resolve to the track's composer, else
// 403. Stored music/<userId>/track-<trackId>.webp; the saved artwork_url carries ?v=<ts> so the new
// art replaces the cached one everywhere at once. A track with its own art stops falling back to the
// album cover (the trackCover() resolution, Brief MUS-3 §1).
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { callerOf, serviceClient } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const trackId = req.nextUrl.searchParams.get('trackId') ?? '';
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  const { data: track } = await supabase.from('tracks').select('id, composer_user_id').eq('id', trackId).maybeSingle();
  if (!track || track.composer_user_id !== caller.userId) return NextResponse.json({ error: 'not your track' }, { status: 403 });

  const body = await req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return NextResponse.json({ error: 'image size out of bounds (max 10MB)' }, { status: 413 });
  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(body)).rotate().resize({ width: 600, height: 600, fit: 'cover', position: 'centre' }).webp({ quality: 82 }).toBuffer();
  } catch { return NextResponse.json({ error: 'unreadable image' }, { status: 400 }); }

  const path = `${caller.userId}/track-${trackId}.webp`;
  const { error } = await supabase.storage.from('music').upload(path, webp, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const url = `${supabase.storage.from('music').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error: e2 } = await supabase.from('tracks').update({ artwork_url: url }).eq('id', trackId);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, artwork_url: url });
}
