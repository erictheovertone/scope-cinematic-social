"use client";

/**
 * VideoScrubber — thin transport bar for VIDEO sources in FINISHING. Play/pause +
 * a draggable timeline. Scrubbing seeks the (paused) video; the Pipeline redraws
 * the GRADED frame on each `seeked`, so you're scrubbing the looked video. The
 * paused timestamp is reported as the "hero frame" (onHeroFrame) to persist in
 * params. Same minimal/sharp visual language as the slider tracks.
 */

import { useEffect, useRef, useState } from "react";

const RED = "#E5E1DB";
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  video: HTMLVideoElement;
  /** The paused position the creator is grading from — persist as heroFrameTime. */
  onHeroFrame: (t: number) => void;
  compact?: boolean;
}

export default function VideoScrubber({ video, onHeroFrame, compact = false }: Props) {
  const [playing, setPlaying] = useState(!video.paused);
  const [current, setCurrent] = useState(video.currentTime || 0);
  const [duration, setDuration] = useState(isFinite(video.duration) ? video.duration : 0);
  // Audio control — the source enters muted (platform autoplay rule); unmuting is
  // a user gesture so it's audible. Creators finish with sound here.
  const [muted, setMuted] = useState(video.muted);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onPlay = () => setPlaying(true);
    const onPause = () => { setPlaying(false); onHeroFrame(video.currentTime); };
    const onTime = () => { if (!draggingRef.current) setCurrent(video.currentTime); };
    const onDur = () => setDuration(isFinite(video.duration) ? video.duration : 0);
    const onSeeked = () => { setCurrent(video.currentTime); if (video.paused) onHeroFrame(video.currentTime); };
    const onVolume = () => setMuted(video.muted);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("loadedmetadata", onDur);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("volumechange", onVolume);
    onDur();
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("loadedmetadata", onDur);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("volumechange", onVolume);
    };
  }, [video, onHeroFrame]);

  const togglePlay = () => { if (video.paused) video.play().catch(() => {}); else video.pause(); };
  const toggleMute = () => { video.muted = !video.muted; setMuted(video.muted); };

  const seekToClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const t = frac * duration;
    setCurrent(t);            // optimistic handle position
    video.currentTime = t;    // → fires `seeked` → Pipeline redraws the graded frame
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekToClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => { if (draggingRef.current) seekToClientX(e.clientX); };
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? "6px 14px" : "8px 18px", background: "#000" }}>
      {/* Play / pause */}
      <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, flexShrink: 0 }}>
        {playing ? (
          <svg width="15.5" height="15.5" viewBox="0 0 12 12" fill="none"><rect x="2" y="1.5" width="2.6" height="9" fill="#E5E1DB" /><rect x="7.4" y="1.5" width="2.6" height="9" fill="#E5E1DB" /></svg>
        ) : (
          <svg width="15.5" height="15.5" viewBox="0 0 12 12" fill="none"><path d="M2.5 1.5l8 4.5-8 4.5z" fill="#E5E1DB" /></svg>
        )}
      </button>

      {/* Track — thin line, red fill + red handle. Hit area padded for touch. */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ position: "relative", flex: 1, height: 18, display: "flex", alignItems: "center", cursor: "pointer", touchAction: "none" }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, height: 1.5, background: "rgba(229,225,219,0.2)" }} />
        <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: 1.5, background: RED }} />
        <div style={{ position: "absolute", left: `${pct}%`, transform: "translateX(-50%)", width: 4, height: 12, background: RED }} />
      </div>

      {/* Timecode */}
      <span style={{ ...REG, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.55)", letterSpacing: "0.04em", flexShrink: 0, minWidth: 56, textAlign: "right" }}>
        {fmt(current)} / {fmt(duration)}
      </span>

      {/* Mute / unmute — austere speaker; red when audible so it reads as active */}
      <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, flexShrink: 0 }}>
        {muted ? (
          <svg width="16.5" height="16.5" viewBox="0 0 24 24" fill="rgba(229,225,219,0.7)">
            <path d="M3.5 9v6h4l5 5V4l-5 5h-4z" />
            <path d="M15.5 8.5l5 7M20.5 8.5l-5 7" stroke="rgba(229,225,219,0.7)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="16.5" height="16.5" viewBox="0 0 24 24" fill={RED}>
            <path d="M3.5 9v6h4l5 5V4l-5 5h-4z" />
            <path d="M16.5 8.2a5 5 0 010 7.6M18.8 6a8 8 0 010 12" fill="none" stroke={RED} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
