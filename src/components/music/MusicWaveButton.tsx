// ── MusicWaveButton — the sine-wave indicator + the playback engine ──────────
// Sits lower-left of the media (the free corner in every surface, clear of the FC
// insignia). MUTED: a static sine glyph with a slash. TAP → unmute: the slash drops
// and the wave undulates while the track plays. Tap = toggle. Only ONE post plays
// at a time (a module singleton). Playback honors the M2 flags:
//   image → the track from music_start_seconds, LOOPING the 20s window;
//   video → from music_start_seconds; bed = ducked (0.45), music_only = full;
//           loops the track if it's shorter than the video.
// ORIGINAL AUDIO IS NEVER TOUCHED — this is a parallel layer (see the report note
// on bed/music_only ↔ the video's own private mute).
// No music_track_id → renders NOTHING (the dash-rule cousin: zero music chrome).
"use client";

import { useEffect, useRef, useState } from "react";
import { useTrackForPost } from "@/lib/useTrack";

const DUCK = 0.45;
const IMAGE_WINDOW = 20;

// One-at-a-time across the whole app.
let stopActive: (() => void) | null = null;

export default function MusicWaveButton({
  post, size = 17,
}: {
  post: { music_track_id?: string | null; music_mode?: string | null; music_start_seconds?: number | null; media_type?: string | null };
  size?: number;
}) {
  const trackId = post.music_track_id ?? null;
  const track = useTrackForPost(trackId);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const isVideo = post.media_type === "video";
  const mode = post.music_mode ?? null;
  const start = Math.max(0, post.music_start_seconds ?? 0);

  const stop = () => { const a = audioRef.current; if (a) a.pause(); setPlaying(false); if (stopActive === stop) stopActive = null; };

  useEffect(() => () => stop(), []); // pause on leave (surface unmount)

  if (!trackId) return null;

  const onTime = () => {
    const a = audioRef.current;
    if (!a) return;
    const dur = track?.duration_seconds ?? 0;
    if (!isVideo) {
      // image → loop the exact 20s window (bounded by the track length)
      const end = dur > 0 ? Math.min(start + IMAGE_WINDOW, dur) : start + IMAGE_WINDOW;
      if (a.currentTime >= end) a.currentTime = start;
    } else if (dur > 0 && a.currentTime >= dur) {
      // video → track shorter than the clip: loop it under the video (honest default)
      a.currentTime = start;
    }
  };

  const play = () => {
    if (!track) return;
    if (stopActive && stopActive !== stop) stopActive();
    let a = audioRef.current;
    if (!a) { a = new Audio(); a.addEventListener("timeupdate", onTime); audioRef.current = a; }
    a.src = track.file_url;
    a.volume = isVideo && mode === "bed" ? DUCK : 1;
    const begin = () => { a!.currentTime = start; a!.play().then(() => { setPlaying(true); stopActive = stop; }).catch(() => {}); };
    if (a.readyState >= 1) begin();
    else a.addEventListener("loadedmetadata", begin, { once: true });
  };

  const toggle = (e: React.MouseEvent) => { e.stopPropagation(); if (playing) stop(); else play(); };

  const W = size, H = Math.round(size * 0.72);
  // sine path across 2× width so translateX(-50%) is seamless
  const buildWave = (w: number) => {
    const mid = H / 2, amp = H * 0.32;
    let d = `M0 ${mid}`;
    for (let x = 1; x <= w; x += 1) d += ` L${x} ${(mid + amp * Math.sin((x / (W / 2)) * Math.PI * 2)).toFixed(2)}`;
    return d;
  };

  return (
    <button
      onClick={toggle}
      aria-label={playing ? "Mute music" : "Play music"}
      className="tappable"
      style={{
        position: "absolute", left: 8, bottom: 8, zIndex: 8,
        minWidth: 44, minHeight: 44, display: "flex", alignItems: "flex-end", justifyContent: "flex-start",
        background: "none", border: "none", padding: 8, cursor: "pointer",
      }}
    >
      <span style={{ position: "relative", width: W, height: H, overflow: "hidden", display: "block", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))" }}>
        <svg
          width={W * 2} height={H} viewBox={`0 0 ${W * 2} ${H}`}
          className={playing && !reduce ? "music-undulate" : undefined}
          style={{ position: "absolute", left: 0, top: 0, ...(playing && !reduce ? { animation: "musicUndulate 1.5s linear infinite" } : null) }}
        >
          <path d={buildWave(W * 2)} fill="none" stroke="#E5E1DB" strokeWidth={1.4} strokeLinecap="round" opacity={playing ? 1 : 0.85} />
        </svg>
        {!playing && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
            <line x1={1} y1={H - 1} x2={W - 1} y2={1} stroke="#E5E1DB" strokeWidth={1.4} strokeLinecap="round" />
          </svg>
        )}
      </span>
    </button>
  );
}
