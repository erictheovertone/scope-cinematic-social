// ── Waveform — thin bars on the ink ladder, a played fill + pointer scrub ─────
// One component, every surface (discography/picker/admin rows = compact; clip
// selector/track sheet = large). Peaks are drawn ONCE, in a literal colour, into a
// canvas that becomes a PNG mask; the colour lives on two DOM layers wearing that
// mask (rest = ink/0.38, played = ink clipped to the playhead %), so tokens resolve
// and themes switch for free — a canvas can't read var() (CLAUDE.md, M18). Progress
// comes from `progress`, or straight from `audio` via rAF (no React render per frame).
// Tap/drag seeks.
"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const LOGICAL_W = 600; // mask logical width; CSS stretches it to the container

function peaksMask(peaks: number[] | null | undefined, height: number): string | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const arr = peaks && peaks.length ? peaks : null;
  const bars = arr ? Math.min(arr.length, 200) : 120;
  const gap = 1;
  const bw = (LOGICAL_W - (bars - 1) * gap) / bars;
  const cv = document.createElement("canvas");
  cv.width = LOGICAL_W * dpr;
  cv.height = height * dpr;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000"; // mask alpha only — the visible colour comes from the layers
  for (let i = 0; i < bars; i++) {
    const p = arr ? arr[Math.floor((i / bars) * arr.length)] : 0.12;
    const h = Math.max(1.5, p * (height - 2));
    const x = i * (bw + gap);
    ctx.fillRect(x, (height - h) / 2, Math.max(1, bw), h);
  }
  return `url(${cv.toDataURL("image/png")})`;
}

export default function Waveform({
  peaks, progress = 0, audio, onSeek, height = 40,
}: {
  peaks?: number[] | null;
  progress?: number; // 0..1
  audio?: RefObject<HTMLAudioElement | null>; // when set, the fill follows this element (rAF)
  onSeek?: (pct: number) => void;
  height?: number;
}) {
  const [mask, setMask] = useState<string | null>(null);
  const playedRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMask(peaksMask(peaks, height)); }, [peaks, height]);

  // Write the fill + playhead straight to the DOM; React never re-renders for progress.
  const paint = (p: number) => {
    const pct = Math.max(0, Math.min(1, p || 0));
    const clip = `inset(0 ${(1 - pct) * 100}% 0 0)`;
    const el = playedRef.current, hd = headRef.current;
    if (el && el.style.clipPath !== clip) { el.style.clipPath = clip; el.style.setProperty("-webkit-clip-path", clip); }
    if (hd) { hd.style.left = `${pct * 100}%`; hd.style.opacity = pct > 0 && pct < 1 ? "1" : "0"; }
  };

  useEffect(() => { if (!audio) paint(progress); }, [progress, audio]);

  useEffect(() => {
    if (!audio) return;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (a && a.duration && isFinite(a.duration)) paint(a.currentTime / a.duration);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); paint(0); };
  }, [audio]);

  const seek = (clientX: number, el: HTMLElement) => {
    if (!onSeek) return;
    const r = el.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };

  const masked: React.CSSProperties = mask
    ? { position: "absolute", inset: 0, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }
    : { display: "none" };
  return (
    <div
      className="wf"
      style={{ position: "relative", width: "100%", height, cursor: onSeek ? "pointer" : "default", touchAction: "none" }}
      onPointerDown={onSeek ? (e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); seek(e.clientX, e.currentTarget); } : undefined}
      onPointerMove={onSeek ? (e) => { if (e.buttons) seek(e.clientX, e.currentTarget); } : undefined}
    >
      <div className="wf-rest" style={masked} />
      <div ref={playedRef} style={{ ...masked, background: "var(--ink)", clipPath: "inset(0 100% 0 0)", WebkitClipPath: "inset(0 100% 0 0)" }} />
      <div ref={headRef} aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 1, marginLeft: -0.5, background: "var(--ink)", opacity: 0, pointerEvents: "none" }} />
    </div>
  );
}
