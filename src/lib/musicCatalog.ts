// ── musicCatalog — albums / tracks / composer reads for the music surfaces (Brief MUS-1) ─────────
// The ONE client read layer for the track view, composer page, bio-sheet MUSIC section and the
// EDIT & POST library sheet. Public data only (approved tracks; albums are public-select). Albums
// with no approved track are hidden everywhere except the owner's manage page.
"use client";

import { supabase } from "@/lib/supabase/client";

export interface CatalogTrack {
  id: string;
  title: string;
  album_id: string | null;
  position: number;
  duration_seconds: number | null;
  file_url: string;
  artwork_url: string | null;
  waveform_peaks: number[] | null;
  keywords: string[];
  composer_user_id: string;
  created_at: string;
}
export interface CatalogAlbum {
  id: string;
  composer_id: string;
  title: string;
  cover_url: string | null;
  year: number | null;
  position: number;
  is_singles: boolean;
  trackCount: number;
}
export interface Composer {
  user_id: string;
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
  composer_bio: string | null;
  composer_links: { label: string; url: string }[];
}

const TRACK_COLS = "id, title, album_id, position, duration_seconds, file_url, artwork_url, waveform_peaks, keywords, composer_user_id, created_at";

export function fmtDur(s: number | null | undefined): string {
  if (!s || !isFinite(s)) return "";
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

/** Album cover, falling back to its first track's artwork (Singles + pre-MUS-1 albums). */
export function albumCover(a: CatalogAlbum, tracks: CatalogTrack[]): string | null {
  return a.cover_url ?? tracks.find((t) => t.album_id === a.id && t.artwork_url)?.artwork_url ?? null;
}

/** Albums in page order: real albums by position, Singles last. */
const order = (a: CatalogAlbum, b: CatalogAlbum) => Number(a.is_singles) - Number(b.is_singles) || a.position - b.position;

/** A composer's public catalog: approved tracks + the albums that hold them. */
export async function composerCatalog(composerId: string): Promise<{ albums: CatalogAlbum[]; tracks: CatalogTrack[] }> {
  const [{ data: t }, { data: a }] = await Promise.all([
    supabase.from("tracks").select(TRACK_COLS).eq("composer_user_id", composerId).eq("status", "approved").order("position"),
    supabase.from("albums").select("id, composer_id, title, cover_url, year, position, is_singles").eq("composer_id", composerId),
  ]);
  const tracks = (t ?? []) as CatalogTrack[];
  const counts = new Map<string, number>();
  for (const tr of tracks) if (tr.album_id) counts.set(tr.album_id, (counts.get(tr.album_id) ?? 0) + 1);
  const albums = ((a ?? []) as Omit<CatalogAlbum, "trackCount">[])
    .map((al) => ({ ...al, trackCount: counts.get(al.id) ?? 0 }))
    .filter((al) => al.trackCount > 0)
    .sort(order);
  return { albums, tracks };
}

export async function composerByHandle(handle: string): Promise<Composer | null> {
  const { data } = await supabase
    .from("profiles").select("user_id, username, display_name, profile_image_url, composer_bio, composer_links")
    .ilike("username", handle.replace(/[%_]/g, (m) => `\\${m}`)).maybeSingle();
  if (!data) return null;
  return { ...(data as Composer), composer_links: Array.isArray(data.composer_links) ? data.composer_links : [] };
}

export async function composerById(userId: string): Promise<Composer | null> {
  const { data } = await supabase
    .from("profiles").select("user_id, username, display_name, profile_image_url, composer_bio, composer_links")
    .eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { ...(data as Composer), composer_links: Array.isArray(data.composer_links) ? data.composer_links : [] };
}

/** Everything the track view needs: the track, its composer, its album's tracks, the other albums. */
export async function trackView(trackId: string): Promise<{
  track: CatalogTrack; composer: Composer | null; album: CatalogAlbum | null; albumTracks: CatalogTrack[];
  otherAlbums: CatalogAlbum[]; allTracks: CatalogTrack[];
} | null> {
  const { data } = await supabase.from("tracks").select(TRACK_COLS).eq("id", trackId).eq("status", "approved").maybeSingle();
  if (!data) return null;
  const track = data as CatalogTrack;
  const [composer, cat] = await Promise.all([composerById(track.composer_user_id), composerCatalog(track.composer_user_id)]);
  const album = cat.albums.find((a) => a.id === track.album_id) ?? null;
  const albumTracks = album ? cat.tracks.filter((t) => t.album_id === album.id).sort((x, y) => x.position - y.position) : [track];
  return { track, composer, album, albumTracks, otherAlbums: cat.albums.filter((a) => a.id !== album?.id), allTracks: cat.tracks };
}

/** First track of an album (cover taps open the album at its first track). */
export async function firstTrackOf(albumId: string): Promise<string | null> {
  const { data } = await supabase.from("tracks").select("id").eq("album_id", albumId).eq("status", "approved").order("position").limit(1).maybeSingle();
  return (data?.id as string) ?? null;
}

/** How many posts use this composer's music (the "posts scored" stat). */
export async function postsScored(trackIds: string[]): Promise<number> {
  if (!trackIds.length) return 0;
  const { count } = await supabase.from("posts").select("id", { count: "exact", head: true }).in("music_track_id", trackIds).eq("is_deleted", false);
  return count ?? 0;
}
