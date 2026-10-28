"use client";

/**
 * SnippetScrubber — Brief V3 §3. The EDIT & POST autoplay-window picker, on ONE player.
 *
 * SnippetSelector (still used by the post "Edit autoplay" overlays) stands up its own duration probe
 * <video> plus a graded audition FinishingPreview — a second full-res decode and a second WebGL
 * context on the screen that already runs the main preview. On a 4K clip that pair is what took the
 * device down. This picker owns NO media: it scrubs the SAME <video> the main preview draws from
 * (handed up by FinishingPreview), over a thumbnail strip captured ONCE from that element —
 * ≤12 frames into one ≤320px-wide canvas, sequential seeks, canvas released after. The main preview
 * IS the audition: dragging seeks it, releasing loops the chosen window there.
 *
 * While it drives the element it sets data-scope-ctl ('strip' | 'scrub'): the preview's clip-window
 * loop stands down, and during the strip capture the Pipeline holds its last frame (no flicker).
 */

import { useEffect, useRef, useState } from "react";
import { CLIP_LEN } from "./SnippetSelector";

const RED = "var(--ink-100)";
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const STRIP_FRAMES = 12;
const STRIP_W = 320; // px — the whole strip, all frames
const STRIP_H = 36;  // px — matches the track height
const TRACK_H = 36;

// One strip per source (object URLs are unique per pick) — leaving and re-entering EDIT & POST
// never re-captures.
const stripCache = new Map<string, string>();

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function seekTo(v: HTMLVideoElement, t: number, ms = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(to); v.removeEventListener("seeked", done); resolve(); };
    const to = setTimeout(() => { v.removeEventListener("seeked", done); reject(new Error("seek timeout")); }, ms);
    v.addEventListener("seeked", done);
    try { v.currentTime = t; } catch (e) { clearTimeout(to); v.removeEventListener("seeked", done); reject(e as Error); }
  });
}

/** Capture the strip from the live element, then hand it back exactly as it was (time + play state). */
async function captureStrip(v: HTMLVideoElement, isCancelled: () => boolean): Promise<string | null> {
  const d = v.duration;
  if (!isFinite(d) || d <= 0 || !v.videoWidth || !v.videoHeight) return null;
  const n = STRIP_FRAMES;
  const cw = Math.floor(STRIP_W / n);
  const canvas = document.createElement("canvas");
  canvas.width = cw * n; canvas.height = STRIP_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // cover-crop each frame into its cell
  const ar = v.videoWidth / v.videoHeight, cellAr = cw / STRIP_H;
  const sw = ar > cellAr ? v.videoHeight * cellAr : v.videoWidth;
  const sh = ar > cellAr ? v.videoHeight : v.videoWidth / cellAr;
  const sx = (v.videoWidth - sw) / 2, sy = (v.videoHeight - sh) / 2;
  const was = { t: v.currentTime, playing: !v.paused };
  v.dataset.scopeCtl = "strip";
  v.pause();
  let ok = true;
  try {
    for (let i = 0; i < n && !isCancelled(); i++) {
      await seekTo(v, ((i + 0.5) / n) * d);
      ctx.drawImage(v, sx, sy, sw, sh, i * cw, 0, cw, STRIP_H);
    }
  } catch { ok = false; }
  const url = ok && !isCancelled() ? canvas.toDataURL("image/jpeg", 0.7) : null;
  canvas.width = 0; canvas.height = 0; // release the backing store now, not at GC
  if (v.getAttribute("src")) { // still the live preview (not released mid-capture)
    try { await seekTo(v, was.t); } catch { /* best-effort */ }
    delete v.dataset.scopeCtl;
    if (was.playing) v.play().catch(() => {});
  }
  return url;
}

interface Props {
  /** The main preview's <video> (FinishingPreview onVideo) — null until it has loaded. */
  video: HTMLVideoElement | null;
  heroFrameTime?: number | null;
  /** The current window (null = untouched → Mirage plays from 0). Seeds the handles on re-entry. */
  value: { start: number; length: number } | null;
  onChange: (window: { start: number; length: number }) => void;
}

export default function SnippetScrubber({ video, heroFrameTime, value, onChange }: Props) {
  const duration = video && isFinite(video.duration) ? video.duration : 0;
  const len = Math.min(CLIP_LEN, duration || CLIP_LEN);
  const maxStart = Math.max(0, duration - len);
  const [start, setStartState] = useState(0);
  const startRef = useRef(0);
  const setStart = (t: number) => { startRef.current = t; setStartState(t); };
  const [strip, setStrip] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const seekingRef = useRef(false);
  const pendingRef = useRef<number | null>(null);

  // Seed the handles: the saved window, else the hero frame (clamped so the clip fits).
  useEffect(() => {
    if (!duration) return;
    setStart(Math.min(Math.max(value?.start ?? heroFrameTime ?? 0, 0), maxStart));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  // Capture the strip once per source, after the viewer has had a beat to draw its first frame.
  useEffect(() => {
    if (!video) return;
    const key = video.currentSrc || video.getAttribute("src") || "";
    const hit = stripCache.get(key);
    if (hit) { setStrip(hit); return; }
    let cancelled = false;
    const t = window.setTimeout(() => {
      captureStrip(video, () => cancelled).then((url) => {
        if (url) stripCache.set(key, url);
        if (!cancelled) setStrip(url);
      });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [video]);

  // Seek coalescing: at most ONE seek in flight; the latest drag position wins when it lands.
  const pumpSeek = () => {
    const v = video;
    if (!v || seekingRef.current || pendingRef.current == null) return;
    const t = pendingRef.current;
    pendingRef.current = null;
    seekingRef.current = true;
    const landed = () => { v.removeEventListener("seeked", landed); seekingRef.current = false; pumpSeek(); };
    v.addEventListener("seeked", landed);
    try { v.currentTime = t; } catch { landed(); }
  };

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    // Centre the window on the pointer, clamped so the full clip stays in range.
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const next = Math.min(Math.max(frac * duration - len / 2, 0), maxStart);
    setStart(next);
    pendingRef.current = next;
    pumpSeek(); // scrub the main preview to the window start
  };

  const onDown = (e: React.PointerEvent) => {
    if (!video || !duration || video.dataset.scopeCtl === "strip") return;
    draggingRef.current = true;
    video.dataset.scopeCtl = "scrub";
    video.pause();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onMove = (e: React.PointerEvent) => { if (draggingRef.current) setFromClientX(e.clientX); };
  const onUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (video) {
      delete video.dataset.scopeCtl;
      // Hand the element back: the preview loops the chosen window (FinishingPreview clipWindow).
      try { video.currentTime = startRef.current; } catch { /* ignore */ }
      video.play().catch(() => {});
    }
    onChange({ start: startRef.current, length: len }); // ONE parent update per gesture, not per pointermove
  };

  const leftPct = duration > 0 ? (start / duration) * 100 : 0;
  const widthPct = duration > 0 ? (len / duration) * 100 : 100;

  return (
    <div style={{ padding: "8px 2px 2px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgb(var(--ink-rgb) / 0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>AUTOPLAY CLIP · {Math.round(len)}s</span>
        <span style={{ ...REG, fontSize: 'var(--fs-8)', color: "rgb(var(--ink-rgb) / 0.5)", letterSpacing: "0.04em" }}>{fmt(start)}–{fmt(start + len)}</span>
      </div>
      <div
        ref={trackRef}
        data-testid="snippet-track"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ position: "relative", height: TRACK_H, cursor: video ? "pointer" : "default", touchAction: "none", background: "rgb(var(--ink-rgb) / 0.06)", overflow: "hidden" }}
      >
        {strip && (
          <img src={strip} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", display: "block", pointerEvents: "none" }} />
        )}
        {/* Dim outside the window; the window itself is the red-bracketed span. */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${leftPct}%`, background: "rgb(var(--black-rgb) / 0.55)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${leftPct + widthPct}%`, right: 0, background: "rgb(var(--black-rgb) / 0.55)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${leftPct}%`, width: `${widthPct}%`, boxShadow: `inset 0 0 0 1.5px ${RED}`, pointerEvents: "none" }} />
      </div>
      <p style={{ ...REG, fontSize: 'var(--fs-7)', color: "rgb(var(--ink-rgb) / 0.3)", letterSpacing: "0.04em", margin: "4px 0 0" }}>
        DRAG TO CHOOSE THE LOOPING AUTOPLAY MOMENT · SKIP TO AUTO-PICK
      </p>
    </div>
  );
}
