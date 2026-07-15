// ── src/lib/useTrack.ts — resolve a post's featured track (cached) ───────────
// The first RENDER reader of the music fields. Fetches the approved track by id +
// the composer handle, cached module-wide so a feed full of the same track hits the
// network once. Returns null until resolved / for peakless-or-missing tracks.
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export interface TrackRow {
  id: string;
  title: string;
  file_url: string;
  duration_seconds: number | null;
  artwork_url: string | null;
  waveform_peaks: number[] | null;
  keywords: string[];
  composer_user_id: string;
  composer_handle: string | null;
  composer_avatar: string | null;
}

const cache = new Map<string, TrackRow | null>();
const inflight = new Map<string, Promise<TrackRow | null>>();

async function fetchTrack(trackId: string): Promise<TrackRow | null> {
  if (cache.has(trackId)) return cache.get(trackId) ?? null;
  if (inflight.has(trackId)) return inflight.get(trackId)!;
  const p = (async () => {
    const { data } = await supabase
      .from("tracks")
      .select("id, title, file_url, duration_seconds, artwork_url, waveform_peaks, keywords, composer_user_id")
      .eq("id", trackId).eq("status", "approved").maybeSingle();
    let row: TrackRow | null = null;
    if (data) {
      const { data: prof } = await supabase.from("profiles").select("username, profile_image_url").eq("user_id", data.composer_user_id).maybeSingle();
      row = { ...(data as Omit<TrackRow, "composer_handle" | "composer_avatar">), composer_handle: prof?.username ?? null, composer_avatar: prof?.profile_image_url ?? null };
    }
    cache.set(trackId, row);
    inflight.delete(trackId);
    return row;
  })();
  inflight.set(trackId, p);
  return p;
}

export function useTrackForPost(trackId: string | null | undefined): TrackRow | null {
  const [track, setTrack] = useState<TrackRow | null>(() => (trackId ? cache.get(trackId) ?? null : null));
  useEffect(() => {
    if (!trackId) { setTrack(null); return; }
    let dead = false;
    fetchTrack(trackId).then((r) => { if (!dead) setTrack(r); });
    return () => { dead = true; };
  }, [trackId]);
  return track;
}
