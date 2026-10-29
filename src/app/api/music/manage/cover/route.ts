// ── POST /api/music/manage/cover?albumId= — replace an album cover (owner only, MUS-1 §4) ───────
// Binary image body. Same bake as /api/music/artwork (sharp, 600² WebP, EXIF-rotated, centre
// crop) but VERIFIED: the caller's token must resolve to the album's composer, else 403.
// Stored music/<userId>/album-<albumId>.webp; the saved cover_url carries ?v=<ts> so the new
// cover replaces the cached one everywhere at once.
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { callerOf, serviceClient } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const albumId = req.nextUrl.searchParams.get('albumId') ?? '';
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  const { data: album } = await supabase.from('albums').select('id, composer_id').eq('id', albumId).maybeSingle();
  if (!album || album.composer_id !== caller.userId) return NextResponse.json({ error: 'not your album' }, { status: 403 });

  const body = await req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return NextResponse.json({ error: 'image size out of bounds (max 10MB)' }, { status: 413 });
  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(body)).rotate().resize({ width: 600, height: 600, fit: 'cover', position: 'centre' }).webp({ quality: 82 }).toBuffer();
  } catch { return NextResponse.json({ error: 'unreadable image' }, { status: 400 }); }

  const path = `${caller.userId}/album-${albumId}.webp`;
  const { error } = await supabase.storage.from('music').upload(path, webp, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const url = `${supabase.storage.from('music').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error: e2 } = await supabase.from('albums').update({ cover_url: url }).eq('id', albumId);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, cover_url: url });
}
