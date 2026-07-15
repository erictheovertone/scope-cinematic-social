// ── Waveform — thin grey bars with a RED playback fill + pointer scrub ───────
// One component, every surface (discography/picker/admin rows = compact; clip
// selector/track sheet = large). Peaks render as thin vertical bars (grey at rest);
// the played portion is a second RED canvas clipped to the playhead % via CSS
// clip-path (GPU-cheap — progress never redraws the canvas). Tap/drag seeks.
"use client";

import { useEffect, useRef } from "react";

const LOGICAL_W = 600; // canvas logical width; CSS stretches to the container

export default function Waveform({
  peaks, progress = 0, onSeek, height = 40, rest = "#4a4a4a", played = "#FF0000",
}: {
  peaks?: number[] | null;
  progress?: number; // 0..1
  onSeek?: (pct: number) => void;
  height?: number;
  rest?: string;
  played?: string;
}) {
  const greyRef = useRef<HTMLCanvasElement>(null);
  const redRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const arr = peaks && peaks.length ? peaks : null;
    const bars = arr ? Math.min(arr.length, 200) : 120;
    const gap = 1;
    const bw = (LOGICAL_W - (bars - 1) * gap) / bars;
    const draw = (cv: HTMLCanvasElement | null, color: string) => {
      if (!cv) return;
      cv.width = LOGICAL_W * dpr;
      cv.height = height * dpr;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, LOGICAL_W, height);
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        const p = arr ? arr[Math.floor((i / bars) * arr.length)] : 0.12;
        const h = Math.max(1.5, p * (height - 2));
        const x = i * (bw + gap);
        ctx.fillRect(x, (height - h) / 2, Math.max(1, bw), h);
      }
    };
    draw(greyRef.current, rest);
    draw(redRef.current, played);
  }, [peaks, height, rest, played]);

  const seek = (clientX: number, el: HTMLElement) => {
    if (!onSeek) return;
    const r = el.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };

  const pct = Math.max(0, Math.min(1, progress));
  return (
    <div
      style={{ position: "relative", width: "100%", height, cursor: onSeek ? "pointer" : "default", touchAction: "none" }}
      onPointerDown={onSeek ? (e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); seek(e.clientX, e.currentTarget); } : undefined}
      onPointerMove={onSeek ? (e) => { if (e.buttons) seek(e.clientX, e.currentTarget); } : undefined}
    >
      <canvas ref={greyRef} style={{ position: "absolute", inset: 0, width: "100%", height }} />
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${(1 - pct) * 100}% 0 0)`, WebkitClipPath: `inset(0 ${(1 - pct) * 100}% 0 0)` }}>
        <canvas ref={redRef} style={{ position: "absolute", inset: 0, width: "100%", height }} />
      </div>
    </div>
  );
}
