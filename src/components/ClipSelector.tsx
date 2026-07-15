// ── ClipSelector — choose the featured section of a track (post flow) ────────
// The LARGE waveform + a draggable SELECTION WINDOW. Image posts: a fixed 20s
// window (position draggable). Video posts: window width = the video's length
// (position draggable). PLAY auditions EXACTLY the windowed section — starts at the
// window, loops back at its end — with the red progress inside. Emits the start
// offset (seconds) → posts.music_start_seconds.
"use client";

import { useRef, useState } from "react";
import Waveform from "@/components/Waveform";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function ClipSelector({
  fileUrl, peaks, trackDuration, windowSeconds, startSeconds, onChange,
}: {
  fileUrl: string;
  peaks?: number[] | null;
  trackDuration: number;
  windowSeconds: number;
  startSeconds: number;
  onChange: (start: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const dur = trackDuration > 0 ? trackDuration : 1;
  const winSec = Math.min(windowSeconds, dur);          // window can't exceed the track (video>track → whole track, loops)
  const winFrac = winSec / dur;
  const maxStart = Math.max(0, dur - winSec);
  const start = Math.max(0, Math.min(maxStart, startSeconds));
  const startFrac = start / dur;

  const moveTo = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const centerFrac = (clientX - r.left) / r.width;
    let s = (centerFrac - winFrac / 2) * dur; // center the window on the pointer
    s = Math.max(0, Math.min(maxStart, s));
    onChange(+s.toFixed(2));
    if (audioRef.current && playing) audioRef.current.currentTime = s;
  };

  const play = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (a.src !== fileUrl) a.src = fileUrl;
    const begin = () => { a.currentTime = start; a.play().then(() => setPlaying(true)).catch(() => {}); };
    if (a.readyState >= 1) begin();
    else a.addEventListener("loadedmetadata", begin, { once: true });
  };

  const onTime = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.currentTime >= start + winSec) { a.currentTime = start; } // loop the window
    setProgress(a.currentTime / dur);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <audio ref={audioRef} onEnded={() => setPlaying(false)} onTimeUpdate={onTime} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={play} aria-label={playing ? "Pause" : "Play"} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
          {playing
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFF"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFF"><path d="M7 5v14l12-7z" /></svg>}
        </button>
        <div
          ref={wrapRef}
          onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); moveTo(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons) moveTo(e.clientX); }}
          style={{ position: "relative", flex: 1, height: 64, touchAction: "none", cursor: "grab" }}
        >
          <Waveform peaks={peaks} progress={playing ? progress : 0} height={64} />
          {/* selection window — translucent red, red border, draggable */}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${startFrac * 100}%`, width: `${winFrac * 100}%`, background: "rgba(255,0,0,0.14)", borderLeft: "2px solid #FF0000", borderRight: "2px solid #FF0000", pointerEvents: "none" }} />
        </div>
      </div>
      <p style={{ ...SKR, fontSize: "var(--fs-7)", color: "rgba(255,255,255,0.4)", margin: "6px 0 0" }}>
        <span style={{ ...SKB, color: "rgba(255,255,255,0.6)" }}>{fmt(start)}</span> – {fmt(start + winSec)} · drag to choose the section
      </p>
    </div>
  );
}
