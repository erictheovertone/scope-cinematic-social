// ── POST /api/music/sign — signed direct-to-storage upload URL ───────────────
// THE BATCH-500 FIX. Audio files (up to 15MB) can't flow through a serverless
// function — Vercel caps the request body at ~4.5MB, so the old byte-carrying
// /api/music/upload POST 500'd on any real (>4.5MB) file (single "worked" only
// with a tiny test file). Here the function carries NO bytes: it mints a one-time
// signed upload token; the browser PUTs the file straight to Supabase Storage.
// { userId, trackId, ext } → { path, token, publicUrl }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AUDIO_MIME_EXT } from '@/lib/musicTaxonomy';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const ALLOWED_EXT = new Set(Object.values(AUDIO_MIME_EXT)); // mp3 · aac · wav

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const userId = String(body.userId ?? '');
  const trackId = String(body.trackId ?? '');
  const ext = String(body.ext ?? '').toLowerCase();
  if (!userId || !trackId || !ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: 'userId, trackId, valid ext required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const safeUser = userId.replace(/[^a-zA-Z0-9-]/g, '_');
  const path = `${safeUser}/${trackId}.${ext}`;
  // upsert so a retry of the same row (same trackId) re-signs the same path.
  const { data, error } = await supabase.storage.from('music').createSignedUploadUrl(path, { upsert: true });
  if (error || !data) {
    console.error('music sign error:', error);
    return NextResponse.json({ error: 'sign failed' }, { status: 500 });
  }
  const { data: pub } = supabase.storage.from('music').getPublicUrl(path);
  return NextResponse.json({ path: data.path, token: data.token, publicUrl: pub?.publicUrl ?? null });
}
