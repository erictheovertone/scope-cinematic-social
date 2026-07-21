// ── MusicTitleChip — "♪ TITLE" under the handle / above content ──────────────
// Tapping opens the TrackSheet. Renders NOTHING when the post has no music (the
// dash-rule cousin — zero music chrome on music-less posts).
//
// Brief W6 — the char cap and the marquee are now ONE system: WIDTH is the cap.
// The full title always renders; the clip is a FIXED-WIDTH window (overflow:hidden
// + edge-fade mask). If the full title is wider than the window it marquees (W3
// duplicate-span loop, automatic, after a ~1s settle); if it fits it sits static
// with no fade. The overflow check re-runs after document.fonts.ready + on resize
// so a font-load race can't false-negative. Reduced-motion → static + CSS ellipsis
// (clamped by the window, NOT a sliced string). Desktop card (no `marquee`) is
// unchanged. Previously (W3) the clip was flex:1 in a content-sized button → it grew
// to the full title, so scrollWidth never exceeded clientWidth and it never marqueed.
"use client";

import { useState, useRef, useLayoutEffect } from "react";
import { useTrackForPost } from "@/lib/useTrack";
import TrackSheet from "@/components/music/TrackSheet";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

// Soft fade at the clip edges so marquee entry/exit reads soft, not chopped.
const EDGE_FADE =
  "linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)";
const MARQUEE_GAP = 28;         // px between the two title copies (the seamless-wrap gap)
const MARQUEE_PXPS = 20;        // ~20px/s scroll speed
const MARQUEE_WINDOW_PX = 175;  // fixed visible window (≈ the old F3 28-char width); the cap
const MARQUEE_DELAY_S = 1;      // settle before the scroll starts

export default function MusicTitleChip({
  post, color = "rgba(229,225,219,0.6)",
  uppercase = true, fontSize = "var(--fs-7)", weight = 700, glyphW = 13, glyphH = 10,
  marquee = false,
}: {
  post: { music_track_id?: string | null };
  color?: string;
  /** Brief F3 song row: false → render the title AS STORED (sentence case). */
  uppercase?: boolean;
  fontSize?: string | number;
  weight?: number;
  glyphW?: number;
  glyphH?: number;
  /** Brief W3/W6 — overflow-only horizontal marquee within a fixed window (mobile song row). */
  marquee?: boolean;
}) {
  const trackId = post.music_track_id ?? null;
  const track = useTrackForPost(trackId);
  const [open, setOpen] = useState(false);

  // Overflow measurement: an always-present hidden measurer holds the single title's
  // natural width; cyclePx>0 → title wider than the fixed window → animate. Re-runs on
  // fonts.ready + resize + a ResizeObserver so no font-load / layout race false-negatives.
  const clipRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [cyclePx, setCyclePx] = useState(0);
  const reducedRef = useRef(false);

  const title = track?.title ?? "MUSIC";

  const titleStyle: React.CSSProperties = {
    fontFamily: weight >= 700 ? SKB.fontFamily : "var(--font-body)",
    fontWeight: weight,
    fontSize,
    color,
    textTransform: uppercase ? "uppercase" : "none",
    letterSpacing: uppercase ? "0.06em" : "var(--track-body)",
    whiteSpace: "nowrap",
  };

  useLayoutEffect(() => {
    if (!marquee) return;
    const check = () => {
      const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      reducedRef.current = reduced;
      const clip = clipRef.current, meas = measureRef.current;
      if (!clip || !meas) return;
      // full-title width vs the fixed window (clip clientWidth). +1px sub-pixel tolerance.
      const overflows = meas.offsetWidth > clip.clientWidth + 1;
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
  }, [marquee, title, fontSize, weight, uppercase]);

  if (!trackId) return null;

  const marqueeActive = marquee && cyclePx > 0;
  const durationS = marqueeActive ? cyclePx / MARQUEE_PXPS : 0;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="tappable"
        style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", minWidth: 0, background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        {/* small wave glyph */}
        <svg width={glyphW} height={glyphH} viewBox="0 0 13 10" style={{ flexShrink: 0 }}>
          <path d="M1 5 Q2.25 1 3.5 5 T6.5 5 T9.5 5 T12.5 5" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </svg>

        {marquee ? (
          <span
            ref={clipRef}
            // FIXED-WIDTH WINDOW: flex 0 1 auto + maxWidth → width = min(title, window).
            // A title wider than the window is clipped here and overflows → marquee.
            style={{ display: "block", flex: "0 1 auto", maxWidth: MARQUEE_WINDOW_PX, minWidth: 0, overflow: "hidden", position: "relative", ...(marqueeActive ? { maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE } : {}) }}
          >
            {/* always-present hidden measurer (single title, natural width) */}
            <span ref={measureRef} aria-hidden style={{ ...titleStyle, position: "absolute", left: 0, top: 0, visibility: "hidden", pointerEvents: "none" }}>{title}</span>
            {marqueeActive ? (
              <span style={{ display: "inline-flex", willChange: "transform", animation: `songMarquee ${durationS}s linear ${MARQUEE_DELAY_S}s infinite` }}>
                <span style={{ ...titleStyle, paddingRight: MARQUEE_GAP }}>{title}</span>
                <span aria-hidden style={{ ...titleStyle, paddingRight: MARQUEE_GAP }}>{title}</span>
              </span>
            ) : (
              // Static / reduced-motion: FULL title, CSS-clamped by the window (ellipsis only
              // shows when it can't fit — i.e. the reduced-motion overflow case). No slice.
              <span style={{ ...titleStyle, display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
            )}
          </span>
        ) : (
          <span style={{ ...titleStyle, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        )}
      </button>
      {open && trackId && <TrackSheet trackId={trackId} onClose={() => setOpen(false)} />}
    </>
  );
}
