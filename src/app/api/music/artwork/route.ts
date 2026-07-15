// ── POST /api/music/artwork — square track cover, baked server-side ──────────
// Binary image body, ?userId=<uuid>&trackId=<uuid>. sharp center-crops to a 600²
// WebP (fit:cover) — real WebP, unlike client canvas.toBlob which degrades to JPEG
// on iOS (the renditions lesson). Stored <userId>/<trackId>.art.webp (same folder
// as the audio → the upload-route DELETE cleanup guard already covers it). upsert →
// re-crop overwrites.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const trackId = req.nextUrl.searchParams.get('trackId');
  if (!userId || !trackId) return NextResponse.json({ error: 'userId, trackId required' }, { status: 400 });

  const body = await req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: `size ${body.byteLength} out of bounds (max ${MAX_BYTES})` }, { status: 413 });
  }

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(body))
      .rotate() // honour EXIF orientation before the square crop
      .resize({ width: 600, height: 600, fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.error('artwork bake error:', e);
    return NextResponse.json({ error: 'unreadable image' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const safeUser = userId.replace(/[^a-zA-Z0-9-]/g, '_');
  const path = `${safeUser}/${trackId}.art.webp`;
  const { error } = await supabase.storage.from('music').upload(path, webp, {
    upsert: true, cacheControl: '31536000', contentType: 'image/webp',
  });
  if (error) { console.error('artwork upload error:', error); return NextResponse.json({ error: 'upload failed' }, { status: 500 }); }
  const { data } = supabase.storage.from('music').getPublicUrl(path);
  return NextResponse.json({ artwork_url: data?.publicUrl ?? null });
}
