// ── SongMarquee — shared overflow-only song-title marquee (Brief W7) ──────────
// Extracted from the W6 mobile-feed song row so every surface shares ONE corrected
// mechanism. WIDTH is the cap: the full title always renders inside a FIXED-WIDTH
// window (windowPx) with overflow:hidden + edge-fade mask. Wider than the window →
// automatic marquee (duplicate-span loop, ~20px/s, after a ~1s settle). Fits →
// static, no fade. The overflow check re-runs on document.fonts.ready + resize +
// a ResizeObserver so a font-load / layout race can't false-negative. Reduced-motion
// → static + CSS ellipsis (window-clamped, never a sliced string). Automatic
// everywhere — no user prompt. Presentation only: track resolution + tap-to-open
// live in the consumer (MusicTitleChip).
"use client";

import { useState, useRef, useLayoutEffect } from "react";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const EDGE_FADE =
  "linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)";
const MARQUEE_GAP = 28;    // px between the two title copies (the seamless-wrap gap)
const MARQUEE_PXPS = 20;   // ~20px/s scroll speed
const MARQUEE_DELAY_S = 1; // settle before the scroll starts

export default function SongMarquee({
  title,
  uppercase = false,
  fontSize = 11,
  weight = 400,
  color = "rgba(229,225,219,0.55)",
  glyphW = 12, glyphH = 9,
  showGlyph = true,
  windowPx = 175,
}: {
  title: string;
  uppercase?: boolean;
  fontSize?: string | number;
  weight?: number;
  color?: string;
  glyphW?: number;
  glyphH?: number;
  /** trackIndicator — the leading wave glyph (on/off). */
  showGlyph?: boolean;
  /** Fixed visible window width (px) = this surface's byline/caption column. The
   *  title marquees when wider than this; fits → static. */
  windowPx?: number;
}) {
  const clipRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [cyclePx, setCyclePx] = useState(0);
  const reducedRef = useRef(false);

  const titleStyle: React.CSSProperties = {
    fontFamily: weight >= 700 ? SKB.fontFamily : "var(--font-body)",
    fontWeight: weight, fontSize, color,
    textTransform: uppercase ? "uppercase" : "none",
    letterSpacing: uppercase ? "0.06em" : "var(--track-body)",
    whiteSpace: "nowrap",
  };

  useLayoutEffect(() => {
    const check = () => {
      const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      reducedRef.current = reduced;
      const clip = clipRef.current, meas = measureRef.current;
      if (!clip || !meas) return;
      const overflows = meas.offsetWidth > clip.clientWidth + 1; // full-title vs window
      setCyclePx(overflows && !reduced ? meas.offsetWidth + MARQUEE_GAP : 0);
    };
    check();
    const ro = new ResizeObserver(check);
    if (clipRef.current) ro.observe(clipRef.current);
    window.addEventListener("resize", check);
    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => { if (!cancelled) check(); }).catch(() => {});
    }
    return () => { cancelled = true; ro.disconnect(); window.removeEventListener("resize", check); };
  }, [title, fontSize, weight, uppercase, windowPx]);

  const marqueeActive = cyclePx > 0;
  const durationS = marqueeActive ? cyclePx / MARQUEE_PXPS : 0;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", minWidth: 0 }}>
      {showGlyph && (
        <svg width={glyphW} height={glyphH} viewBox="0 0 13 10" style={{ flexShrink: 0 }}>
          <path d="M1 5 Q2.25 1 3.5 5 T6.5 5 T9.5 5 T12.5 5" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
      <span
        ref={clipRef}
        // FIXED-WIDTH WINDOW: flex 0 1 auto + maxWidth → width = min(title, window).
        style={{ display: "block", flex: "0 1 auto", maxWidth: windowPx, minWidth: 0, overflow: "hidden", position: "relative", ...(marqueeActive ? { maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE } : {}) }}
      >
        <span ref={measureRef} aria-hidden style={{ ...titleStyle, position: "absolute", left: 0, top: 0, visibility: "hidden", pointerEvents: "none" }}>{title}</span>
        {marqueeActive ? (
          <span style={{ display: "inline-flex", willChange: "transform", animation: `songMarquee ${durationS}s linear ${MARQUEE_DELAY_S}s infinite` }}>
            <span style={{ ...titleStyle, paddingRight: MARQUEE_GAP }}>{title}</span>
            <span aria-hidden style={{ ...titleStyle, paddingRight: MARQUEE_GAP }}>{title}</span>
          </span>
        ) : (
          <span style={{ ...titleStyle, display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        )}
      </span>
    </span>
  );
}
