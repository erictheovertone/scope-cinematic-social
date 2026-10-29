// ── /api/music/manage — composer self-service (Brief MUS-1 §4) ───────────────────────────────────
// Owner-only. The caller is VERIFIED (Privy access token → users.id); every album/track id in the
// request must belong to that caller, else 403. Metadata writes publish immediately (no review):
// display name, bio, links, album title/year, track titles, track order + album placement.
// Audio replacement does NOT write the track: it files a pending track_versions row for the
// existing admin approval queue.
//
// GET                      → the caller's catalog: albums (+ every track, any status) + page fields
// POST { action, ... }     → profile | album_create | album_update | track_rename | reorder | replace_audio
import { NextResponse } from 'next/server';
import { callerOf, serviceClient } from '@/lib/serverAuth';
import { TITLE_MAX } from '@/lib/musicTaxonomy';

export const dynamic = 'force-dynamic';

const BIO_MAX = 600;
const LINKS_MAX = 6;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function cleanLinks(v: unknown): { label: string; url: string }[] | null {
  if (!Array.isArray(v) || v.length > LINKS_MAX) return null;
  const out: { label: string; url: string }[] = [];
  for (const l of v) {
    const url = String((l as { url?: unknown })?.url ?? '').trim();
    const label = String((l as { label?: unknown })?.label ?? '').trim().slice(0, 40);
    if (!url) continue;
    try { const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); if (!/^https?:$/.test(u.protocol)) return null; out.push({ label: label || u.hostname.replace(/^www\./, ''), url: u.toString() }); }
    catch { return null; }
  }
  return out;
}

export async function GET(req: Request) {
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return bad('sign in required', 401);
  const [{ data: prof }, { data: albums }, { data: tracks }, { data: versions }] = await Promise.all([
    supabase.from('profiles').select('display_name, username, composer_bio, composer_links, profile_image_url').eq('user_id', caller.userId).maybeSingle(),
    supabase.from('albums').select('id, title, cover_url, year, position, is_singles').eq('composer_id', caller.userId).order('position'),
    supabase.from('tracks').select('id, title, album_id, position, duration_seconds, status, artwork_url, file_url').eq('composer_user_id', caller.userId).order('position'),
    supabase.from('track_versions').select('track_id, status, created_at').eq('composer_id', caller.userId).eq('status', 'pending'),
  ]);
  return NextResponse.json({ profile: prof, albums: albums ?? [], tracks: tracks ?? [], pendingVersions: versions ?? [] });
}

export async function POST(req: Request) {
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return bad('sign in required', 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad('bad json'); }
  const me = caller.userId;

  // Ownership checks — every id must be the caller's, else 403 (never a silent no-op).
  const ownAlbum = async (id: unknown) => {
    const { data } = await supabase.from('albums').select('id, composer_id').eq('id', String(id ?? '')).maybeSingle();
    return data?.composer_id === me;
  };
  const ownTracks = async (ids: string[]) => {
    if (!ids.length) return false;
    const { data } = await supabase.from('tracks').select('id, composer_user_id').in('id', ids);
    return (data ?? []).length === ids.length && (data ?? []).every((t) => t.composer_user_id === me);
  };

  switch (String(b.action ?? '')) {
    case 'profile': {
      const patch: Record<string, unknown> = {};
      if (b.display_name !== undefined) {
        const n = String(b.display_name).trim();
        if (n.length < 1 || n.length > 50) return bad('display name 1–50 chars');
        patch.display_name = n;
      }
      if (b.composer_bio !== undefined) {
        const bio = String(b.composer_bio ?? '').trim();
        if (bio.length > BIO_MAX) return bad(`bio ≤ ${BIO_MAX} chars`);
        patch.composer_bio = bio || null;
      }
      if (b.composer_links !== undefined) {
        const links = cleanLinks(b.composer_links);
        if (!links) return bad('links: up to 6 http(s) URLs');
        patch.composer_links = links;
      }
      if (!Object.keys(patch).length) return bad('nothing to update');
      const { error } = await supabase.from('profiles').update(patch).eq('user_id', me);
      return error ? bad(error.message, 500) : NextResponse.json({ ok: true });
    }

    case 'album_create': {
      const title = String(b.title ?? '').trim();
      if (title.length < 1 || title.length > TITLE_MAX) return bad('album title 1–80 chars');
      const year = b.year == null || b.year === '' ? null : Number(b.year);
      if (year !== null && !(Number.isInteger(year) && year >= 1900 && year <= 2100)) return bad('bad year');
      const { data: last } = await supabase.from('albums').select('position').eq('composer_id', me).eq('is_singles', false).order('position', { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await supabase.from('albums').insert({ composer_id: me, title, year, position: (last?.position ?? -1) + 1 }).select('id').single();
      return error ? bad(error.message, 500) : NextResponse.json({ ok: true, id: data.id });
    }

    case 'album_update': {
      if (!(await ownAlbum(b.albumId))) return bad('not your album', 403);
      const patch: Record<string, unknown> = {};
      if (b.title !== undefined) {
        const t = String(b.title).trim();
        if (t.length < 1 || t.length > TITLE_MAX) return bad('album title 1–80 chars');
        patch.title = t;
      }
      if (b.year !== undefined) {
        const y = b.year == null || b.year === '' ? null : Number(b.year);
        if (y !== null && !(Number.isInteger(y) && y >= 1900 && y <= 2100)) return bad('bad year');
        patch.year = y;
      }
      if (!Object.keys(patch).length) return bad('nothing to update');
      const { error } = await supabase.from('albums').update(patch).eq('id', String(b.albumId));
      return error ? bad(error.message, 500) : NextResponse.json({ ok: true });
    }

    case 'track_rename': {
      const id = String(b.trackId ?? '');
      if (!(await ownTracks([id]))) return bad('not your track', 403);
      const t = String(b.title ?? '').trim();
      if (t.length < 1 || t.length > TITLE_MAX) return bad('title 1–80 chars');
      const { error } = await supabase.from('tracks').update({ title: t }).eq('id', id);
      return error ? bad(error.message, 500) : NextResponse.json({ ok: true });
    }

    // The album's full track order (and placement: listing a track here MOVES it into the album).
    case 'reorder': {
      const ids = Array.isArray(b.trackIds) ? b.trackIds.map(String) : [];
      if (!(await ownAlbum(b.albumId))) return bad('not your album', 403);
      if (!(await ownTracks(ids))) return bad('not your tracks', 403);
      const results = await Promise.all(ids.map((id, i) => supabase.from('tracks').update({ album_id: String(b.albumId), position: i + 1 }).eq('id', id)));
      const err = results.find((r) => r.error)?.error;
      return err ? bad(err.message, 500) : NextResponse.json({ ok: true });
    }

    // Album order on the composer page.
    case 'album_order': {
      const ids = Array.isArray(b.albumIds) ? b.albumIds.map(String) : [];
      const { data } = await supabase.from('albums').select('id, composer_id').in('id', ids);
      if (!ids.length || (data ?? []).length !== ids.length || !(data ?? []).every((a) => a.composer_id === me)) return bad('not your albums', 403);
      await Promise.all(ids.map((id, i) => supabase.from('albums').update({ position: i }).eq('id', id)));
      return NextResponse.json({ ok: true });
    }

    // New audio for an approved track → a PENDING version; the live track keeps its approved audio.
    case 'replace_audio': {
      const id = String(b.trackId ?? '');
      if (!(await ownTracks([id]))) return bad('not your track', 403);
      const fileUrl = String(b.fileUrl ?? '');
      if (!fileUrl.includes('/storage/v1/object/public/music/')) return bad('fileUrl must be a music-bucket upload');
      const dur = Number(b.durationSeconds);
      const peaks = Array.isArray(b.waveformPeaks) && b.waveformPeaks.length <= 2000 && b.waveformPeaks.every((n) => typeof n === 'number' && n >= 0 && n <= 1) ? b.waveformPeaks : null;
      // One pending version per track: a newer submission replaces the older pending one.
      await supabase.from('track_versions').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('track_id', id).eq('status', 'pending');
      const { error } = await supabase.from('track_versions').insert({ track_id: id, composer_id: me, file_url: fileUrl, duration_seconds: Number.isFinite(dur) ? Math.round(dur) : null, waveform_peaks: peaks });
      return error ? bad(error.message, 500) : NextResponse.json({ ok: true, status: 'pending' });
    }

    default:
      return bad('unknown action');
  }
}
