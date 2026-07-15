// ── POST /api/music/submit — create the pending track row (service role) ─────
// JSON { id, userId, title, keywords[], durationSeconds, fileUrl }. `userId` is the
// composer's users.id UUID (the UUID discipline — matches posts.user_id). Upserts
// on id so a re-submission is an UPDATE back to 'pending' (never hits the RLS wall).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KEYWORDS_MIN, KEYWORDS_MAX, MUSIC_KEYWORDS_SET, TITLE_MAX, AUDIO_MAX_SECONDS } from '@/lib/musicTaxonomy';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const id = String(body.id ?? '');
  const userId = String(body.userId ?? '');
  const fileUrl = String(body.fileUrl ?? '');
  if (!id || !userId || !fileUrl) return NextResponse.json({ error: 'id, userId, fileUrl required' }, { status: 400 });

  const title = String(body.title ?? '').trim();
  if (title.length === 0 || title.length > TITLE_MAX) return NextResponse.json({ error: 'title 1–80 chars' }, { status: 400 });

  const rawKw = Array.isArray(body.keywords) ? body.keywords : [];
  const keywords = [...new Set(rawKw.filter((k): k is string => typeof k === 'string' && MUSIC_KEYWORDS_SET.has(k)))];
  if (keywords.length < KEYWORDS_MIN || keywords.length > KEYWORDS_MAX) {
    return NextResponse.json({ error: `keywords ${KEYWORDS_MIN}–${KEYWORDS_MAX} from the taxonomy` }, { status: 400 });
  }

  const durNum = Number(body.durationSeconds);
  const duration = Number.isFinite(durNum) ? Math.round(durNum) : null;
  if (duration !== null && (duration < 1 || duration > AUDIO_MAX_SECONDS + 5)) {
    return NextResponse.json({ error: 'duration out of bounds' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // The composer UUID must be a real user (the flow is behind auth; this is a
  // sanity guard, matching the app's client-passes-identity posture).
  const { data: composer } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
  if (!composer) return NextResponse.json({ error: 'unknown user' }, { status: 403 });

  const artworkUrl = typeof body.artworkUrl === 'string' && body.artworkUrl ? body.artworkUrl : null;
  const waveformPeaks = Array.isArray(body.waveformPeaks) && body.waveformPeaks.length && body.waveformPeaks.length <= 2000
    && body.waveformPeaks.every((n) => typeof n === 'number' && n >= 0 && n <= 1)
    ? body.waveformPeaks : null;

  const { data, error } = await supabase.from('tracks').upsert({
    id,
    composer_user_id: userId,
    title,
    keywords,
    duration_seconds: duration,
    file_url: fileUrl,
    artwork_url: artworkUrl,
    waveform_peaks: waveformPeaks,
    status: 'pending',
    approved_at: null,
  }, { onConflict: 'id' }).select('id, status').single();

  if (error) {
    console.error('track submit error:', error);
    return NextResponse.json({ error: 'submit failed' }, { status: 500 });
  }
  return NextResponse.json({ track: data });
}
