// ── POST /api/music/upload — service-role audio upload (the hero-upload pattern) ─
// Binary body (the audio file), ?userId=<composer users.id uuid>&trackId=<uuid>.
// Writes music/<userId>/<trackId>.<ext> (trackId-based, immutable, upsert → a
// re-submission overwrites the same object; never rediscovers the RLS wall).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AUDIO_MAX_BYTES, AUDIO_MIME_EXT } from '@/lib/musicTaxonomy';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const trackId = req.nextUrl.searchParams.get('trackId');
  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!userId || !trackId) return NextResponse.json({ error: 'userId, trackId required' }, { status: 400 });
  const ext = AUDIO_MIME_EXT[mime];
  if (!ext) return NextResponse.json({ error: `unsupported audio type ${mime}` }, { status: 415 });

  const body = await req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > AUDIO_MAX_BYTES) {
    return NextResponse.json({ error: `size ${body.byteLength} out of bounds (max ${AUDIO_MAX_BYTES})` }, { status: 413 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const safeUser = userId.replace(/[^a-zA-Z0-9-]/g, '_');
  const path = `${safeUser}/${trackId}.${ext}`;
  const { error } = await supabase.storage.from('music').upload(path, Buffer.from(body), {
    upsert: true, cacheControl: '31536000', contentType: mime,
  });
  if (error) {
    console.error('music upload error:', error);
    return NextResponse.json({ error: 'upload failed' }, { status: 500 });
  }
  const { data } = supabase.storage.from('music').getPublicUrl(path);
  return NextResponse.json({ file_url: data?.publicUrl ?? null });
}
