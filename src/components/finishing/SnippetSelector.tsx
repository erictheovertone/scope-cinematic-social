"use client";

/**
 * SnippetSelector — pick the 3–5s window of the video that becomes the autoplay
 * clip. Thin track + a draggable red window (the scrubber's visual language).
 * Optional creative control: if untouched, the publish step auto-chooses the
 * window (hero frame, else randomized) and bakes the clip regardless — every video
 * post gets a clip. Reports { start, length } in seconds via onChange.
 *
 * AUDITION THUMBNAIL — shows the EDITED look (not raw media) by reusing the editor's
 * live graded-display component (FinishingPreview → Pipeline), fed the SAME edit
 * params as the main preview. It's a small fixed thumbnail (not a full post). The
 * graded Surface is gated behind an IntersectionObserver so a 2nd WebGL context only
 * exists while the thumbnail is on-screen (the main preview owns the other). DISPLAY-
 * ONLY: no bake / captureAsBlob / preserveDrawingBuffer (that path is the iOS crash).
 */

import { useEffect, useRef, useState } from "react";
import FinishingPreview from "./FinishingPreview";
import { getAspectRatio } from "@/lib/aspectRatio";
import type { EditParams } from "@/lib/editor/params";
import type { EditGeometry } from "@/lib/editGeometry";

const RED = "#FF0000";
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const CLIP_LEN = 4; // seconds (3–5s band)

// Thumbnail width — the ONE tunable. Reads as a small inset, never a full post.
const SNIPPET_W = 132;

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  videoUrl: string;
  heroFrameTime?: number | null;
  onChange: (window: { start: number; length: number }) => void;
  /** SAME edit state the main editor preview reads (single source of truth). */
  params: EditParams;
  geometry: EditGeometry;
  layoutId: string;
}

export default function SnippetSelector({ videoUrl, heroFrameTime, onChange, params, geometry, layoutId }: Props) {
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Read duration; seed the window at the hero frame (clamped so the clip fits).
  useEffect(() => {
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.src = videoUrl;
    v.onloadedmetadata = () => {
      const d = isFinite(v.duration) ? v.duration : 0;
      setDuration(d);
      const maxStart = Math.max(0, d - CLIP_LEN);
      const seed = Math.min(Math.max(heroFrameTime ?? 0, 0), maxStart);
      setStart(seed);
    };
    return () => { v.src = ""; };
  }, [videoUrl, heroFrameTime]);

  const len = Math.min(CLIP_LEN, duration || CLIP_LEN);
  const maxStart = Math.max(0, duration - len);

  // Gate the graded Surface: only mount FinishingPreview (a 2nd WebGL context) while
  // the thumbnail is actually visible — the main editor preview owns the other context.
  const thumbRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = thumbRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { rootMargin: "80px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    // Centre the window on the pointer, clamped so the full clip stays in range.
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const next = Math.min(Math.max(frac * duration - len / 2, 0), maxStart);
    setStart(next);
    onChange({ start: next, length: len });
  };

  const onDown = (e: React.PointerEvent) => { draggingRef.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setFromClientX(e.clientX); };
  const onMove = (e: React.PointerEvent) => { if (draggingRef.current) setFromClientX(e.clientX); };
  const onUp = (e: React.PointerEvent) => { draggingRef.current = false; (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); };

  const leftPct = duration > 0 ? (start / duration) * 100 : 0;
  const widthPct = duration > 0 ? (len / duration) * 100 : 100;

  return (
    <div style={{ padding: "8px 2px 2px" }}>
      {/* Audition thumbnail — small, GRADED (reflects current edits), not full-post. */}
      <div
        ref={thumbRef}
        style={{ position: "relative", width: SNIPPET_W, aspectRatio: getAspectRatio(layoutId), background: "#000", overflow: "hidden", marginBottom: 8 }}
      >
        {visible && (
          <FinishingPreview
            mediaUrl={videoUrl}
            mediaType="video"
            params={params}
            geometry={geometry}
            layoutId={layoutId}
            clipWindow={{ start, length: len }}
          />
        )}
        <span style={{ position: "absolute", bottom: 4, left: 5, ...SKB, fontSize: 'var(--fs-6_5)', color: "rgba(255,255,255,0.75)", letterSpacing: "0.14em", textTransform: "uppercase", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>AUDITION</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>AUTOPLAY CLIP · {Math.round(len)}s</span>
        <span style={{ ...REG, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>{fmt(start)}–{fmt(start + len)}</span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{ position: "relative", height: 18, display: "flex", alignItems: "center", cursor: "pointer", touchAction: "none" }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, height: 1.5, background: "rgba(255,255,255,0.2)" }} />
        {/* Selected window — red span + two handles */}
        <div style={{ position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, height: 1.5, background: RED }} />
        <div style={{ position: "absolute", left: `${leftPct}%`, transform: "translateX(-50%)", width: 4, height: 12, background: RED }} />
        <div style={{ position: "absolute", left: `${leftPct + widthPct}%`, transform: "translateX(-50%)", width: 4, height: 12, background: RED }} />
      </div>
      <p style={{ ...REG, fontSize: 'var(--fs-7)', color: "rgba(255,255,255,0.3)", letterSpacing: "0.04em", margin: "4px 0 0" }}>
        DRAG TO CHOOSE THE LOOPING AUTOPLAY MOMENT · SKIP TO AUTO-PICK
      </p>
    </div>
  );
}
