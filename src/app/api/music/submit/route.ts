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
  console.log('[contrib] submit received', { id, titleLen: title.length, kw: keywords.length, hasArt: !!artworkUrl, peaks: waveformPeaks?.length ?? 0 });

  // ── CORE INSERT — M1 columns ONLY (guaranteed to exist) ──────────────────────
  // The critical path. artwork_url / waveform_peaks are DELIBERATELY excluded here:
  // if the M2/M3 migration hasn't been run, including them makes the whole insert
  // error → a 500 that sinks EVERY row of the batch. They land as a best-effort
  // follow-up below instead, so a missing optional column can never sink a submit.
  const { data, error } = await supabase.from('tracks').upsert({
    id,
    composer_user_id: userId,
    title,
    keywords,
    duration_seconds: duration,
    file_url: fileUrl,
    status: 'pending',
    approved_at: null,
  }, { onConflict: 'id' }).select('id, status').single();

  if (error) {
    console.error('[contrib] core insert FAILED', id, error);
    return NextResponse.json({ error: 'submit failed', detail: error.message }, { status: 500 });
  }
  console.log('[contrib] core insert ok', id);

  // ── OPTIONAL COLUMNS — best-effort, NEVER blocks the submission ──────────────
  // A missing column (un-run artwork/waveform migration) or any error here is
  // swallowed: the track already landed pending. Peaks also self-heal on first
  // view (/api/music/waveform); art fills in once the migration runs + re-submit.
  if (artworkUrl || waveformPeaks) {
    const patch: Record<string, unknown> = {};
    if (artworkUrl) patch.artwork_url = artworkUrl;
    if (waveformPeaks) patch.waveform_peaks = waveformPeaks;
    const { error: optErr } = await supabase.from('tracks').update(patch).eq('id', id);
    if (optErr) console.warn('[contrib] optional cols skipped (run the art/waveform migration):', optErr.message);
    else console.log('[contrib] optional cols ok', id);
  }

  // MUS-1 — every track has a home: a new submission lands at the end of the composer's
  // "Singles" album (created on first use). Best-effort like the optional columns above, and
  // a re-submission keeps whatever album the composer has since moved it to.
  try {
    const { data: cur } = await supabase.from('tracks').select('album_id').eq('id', id).maybeSingle();
    if (cur && !cur.album_id) {
      let { data: singles } = await supabase.from('albums').select('id').eq('composer_id', userId).eq('is_singles', true).maybeSingle();
      if (!singles) ({ data: singles } = await supabase.from('albums').insert({ composer_id: userId, title: 'Singles', is_singles: true, position: 1000 }).select('id').single());
      if (singles) {
        const { count } = await supabase.from('tracks').select('id', { count: 'exact', head: true }).eq('album_id', singles.id);
        await supabase.from('tracks').update({ album_id: singles.id, position: (count ?? 0) + 1 }).eq('id', id);
      }
    }
  } catch (e) { console.warn('[contrib] singles placement skipped (run mus1_aug1.sql?):', (e as Error).message); }

  console.log('[contrib] submit done', id);
  return NextResponse.json({ track: data });
}
