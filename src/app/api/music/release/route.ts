// ── POST /api/music/release — one contribution, one call (Brief MUS-2 §2) ───────────────────────
// The contribution page submits a RELEASE: the album it lands in plus every track, positioned.
//   { target: 'album',    album: { title, year? }, tracks: [...] }  → creates the album, tracks 1..n
//   { target: 'singles',                          tracks: [...] }  → the composer's Singles, appended
//   { target: 'existing', albumId,                tracks: [...] }  → that album (must be the caller's), appended
// tracks[i] = { id, title, keywords[], durationSeconds, fileUrl, artworkUrl?, waveformPeaks? }; array
// order = album order. Caller VERIFIED (Privy token → users.id). Tracks land 'pending' exactly as
// /api/music/submit does (approval unchanged: /admin/music). The album row is created at once — the
// composer sees it immediately; public surfaces only show an album once it holds an approved track.
// Failure after creating a new album deletes that album again (no half-made releases).
import { NextResponse } from 'next/server';
import { callerOf, serviceClient } from '@/lib/serverAuth';
import { KEYWORDS_MIN, KEYWORDS_MAX, MUSIC_KEYWORDS_SET, TITLE_MAX, AUDIO_MAX_SECONDS } from '@/lib/musicTaxonomy';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const RELEASE_MAX = 24;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return bad('sign in required', 401);
  const me = caller.userId;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad('bad json'); }

  // ── tracks ──
  const raw = Array.isArray(b.tracks) ? b.tracks : [];
  if (raw.length < 1 || raw.length > RELEASE_MAX) return bad(`1–${RELEASE_MAX} tracks per release`);
  const ownPrefix = `/storage/v1/object/public/music/${me}/`;
  const rows: Record<string, unknown>[] = [];
  for (const t of raw as Record<string, unknown>[]) {
    const id = String(t.id ?? '');
    if (!UUID.test(id)) return bad('track id must be a uuid');
    const title = String(t.title ?? '').trim();
    if (title.length < 1 || title.length > TITLE_MAX) return bad('track title 1–80 chars');
    const kw = [...new Set((Array.isArray(t.keywords) ? t.keywords : []).filter((k): k is string => typeof k === 'string' && MUSIC_KEYWORDS_SET.has(k)))];
    if (kw.length < KEYWORDS_MIN || kw.length > KEYWORDS_MAX) return bad(`keywords ${KEYWORDS_MIN}–${KEYWORDS_MAX} per track`);
    const fileUrl = String(t.fileUrl ?? '');
    if (!fileUrl.includes(ownPrefix)) return bad('fileUrl must be your music-bucket upload');
    const d = Number(t.durationSeconds);
    const duration = Number.isFinite(d) ? Math.round(d) : null;
    if (duration !== null && (duration < 1 || duration > AUDIO_MAX_SECONDS + 5)) return bad('duration out of bounds');
    const art = typeof t.artworkUrl === 'string' && t.artworkUrl.includes(ownPrefix) ? t.artworkUrl : null;
    const peaks = Array.isArray(t.waveformPeaks) && t.waveformPeaks.length && t.waveformPeaks.length <= 2000
      && t.waveformPeaks.every((n) => typeof n === 'number' && n >= 0 && n <= 1) ? t.waveformPeaks : null;
    rows.push({ id, composer_user_id: me, title, keywords: kw, duration_seconds: duration, file_url: fileUrl, status: 'pending', approved_at: null, artwork_url: art, waveform_peaks: peaks });
  }
  const ids = rows.map((r) => r.id as string);
  if (new Set(ids).size !== ids.length) return bad('duplicate track id');
  const { data: clash } = await supabase.from('tracks').select('id').in('id', ids);
  if ((clash ?? []).length) return bad('track id already used', 409);

  // ── target album ──
  const target = String(b.target ?? '');
  let albumId: string;
  let createdAlbum = false;
  if (target === 'album') {
    const a = (b.album ?? {}) as Record<string, unknown>;
    const title = String(a.title ?? '').trim();
    if (title.length < 1 || title.length > TITLE_MAX) return bad('album title 1–80 chars');
    if (/^singles$/i.test(title)) return bad('"Singles" is reserved — pick another album title');
    const year = a.year == null || a.year === '' ? null : Number(a.year);
    if (year !== null && !(Number.isInteger(year) && year >= 1900 && year <= 2100)) return bad('bad year');
    const { data: last } = await supabase.from('albums').select('position').eq('composer_id', me).eq('is_singles', false).order('position', { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from('albums').insert({ composer_id: me, title, year, position: (last?.position ?? -1) + 1 }).select('id').single();
    if (error || !data) return bad(error?.message ?? 'album create failed', 500);
    albumId = data.id as string;
    createdAlbum = true;
  } else if (target === 'singles') {
    let { data: singles } = await supabase.from('albums').select('id').eq('composer_id', me).eq('is_singles', true).maybeSingle();
    if (!singles) ({ data: singles } = await supabase.from('albums').insert({ composer_id: me, title: 'Singles', is_singles: true, position: 1000 }).select('id').single());
    if (!singles) return bad('singles album unavailable', 500);
    albumId = singles.id as string;
  } else if (target === 'existing') {
    const { data: al } = await supabase.from('albums').select('id, composer_id').eq('id', String(b.albumId ?? '')).maybeSingle();
    if (!al || al.composer_id !== me) return bad('not your album', 403);
    albumId = al.id as string;
  } else {
    return bad('target must be album | singles | existing');
  }

  // Append after the album's last position (a new album starts at 1).
  const { data: tail } = await supabase.from('tracks').select('position').eq('album_id', albumId).order('position', { ascending: false }).limit(1).maybeSingle();
  const start = (tail?.position ?? 0) + 1;
  const insert: Record<string, unknown>[] = rows.map((r, i) => ({ ...r, album_id: albumId, position: start + i }));
  const { error } = await supabase.from('tracks').insert(insert);
  if (error) {
    if (createdAlbum) await supabase.from('albums').delete().eq('id', albumId);
    console.error('[release] insert failed', error);
    return bad('submit failed', 500);
  }
  console.log('[release] ok', { albumId, target, n: insert.length, start });
  return NextResponse.json({ ok: true, albumId, positions: insert.map((r) => ({ id: r.id as string, position: r.position })) });
}
