// ── MusicTitleChip — "♪ TITLE" under the handle / above content ──────────────
// Tapping opens the TrackSheet. Renders NOTHING when the post has no music (the
// dash-rule cousin — zero music chrome on music-less posts).
//
// Brief W3 §3 — OVERFLOW-ONLY MARQUEE (opt-in via `marquee`, mobile song row only):
// when the full title is wider than the row it scrolls horizontally (IG-style,
// duplicate-span translateX loop, seamless, ~20px/s, linear); short titles sit
// static exactly as F3 shipped. prefers-reduced-motion → static + ellipsis (the F3
// reduced state). Desktop card usage (no `marquee`) is unchanged.
"use client";

import { useState, useRef, useLayoutEffect } from "react";
import { useTrackForPost } from "@/lib/useTrack";
import TrackSheet from "@/components/music/TrackSheet";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

// Soft fade at the clip edges so marquee entry/exit reads soft, not chopped.
const EDGE_FADE =
  "linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)";
const MARQUEE_GAP = 28; // px between the two title copies (the seamless-wrap gap)
const MARQUEE_PXPS = 20; // ~20px/s scroll speed

export default function MusicTitleChip({
  post, color = "rgba(229,225,219,0.6)",
  uppercase = true, fontSize = "var(--fs-7)", weight = 700, glyphW = 13, glyphH = 10, maxChars,
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
  /** Hard char cap (title-length truncation) — ellipsis appended. Used static and as
   *  the reduced-motion fallback when marquee is on. */
  maxChars?: number;
  /** Brief W3 §3 — enable the overflow-only horizontal marquee (mobile song row). */
  marquee?: boolean;
}) {
  const trackId = post.music_track_id ?? null;
  const track = useTrackForPost(trackId);
  const [open, setOpen] = useState(false);

  // Marquee measurement: an always-present hidden measurer holds the single title's
  // natural width; cyclePx>0 → the title overflows the clip → animate. (offsetWidth
  // of a nowrap span vs the clip's clientWidth — the scrollWidth>clientWidth check.)
  const clipRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [cyclePx, setCyclePx] = useState(0);
  const reducedRef = useRef(false);

  const title = track?.title ?? "MUSIC";
  const display = maxChars && title.length > maxChars ? title.slice(0, maxChars - 1).trimEnd() + "…" : title;

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
    const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = reduced;
    const clip = clipRef.current, meas = measureRef.current;
    if (!clip || !meas) { setCyclePx(0); return; }
    // +1px tolerance for sub-pixel rounding; reduced-motion never marquees.
    const overflows = meas.offsetWidth > clip.clientWidth + 1;
    setCyclePx(overflows && !reduced ? meas.offsetWidth + MARQUEE_GAP : 0);
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
            style={{ display: "block", flex: "1 1 auto", minWidth: 0, overflow: "hidden", position: "relative", ...(marqueeActive ? { maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE } : {}) }}
          >
            {/* always-present hidden measurer (single title, natural width) */}
            <span ref={measureRef} aria-hidden style={{ ...titleStyle, position: "absolute", left: 0, top: 0, visibility: "hidden", pointerEvents: "none" }}>{title}</span>
            {marqueeActive ? (
              <span style={{ display: "inline-flex", willChange: "transform", animation: `songMarquee ${durationS}s linear infinite` }}>
                <span style={{ ...titleStyle, paddingRight: MARQUEE_GAP }}>{title}</span>
                <span aria-hidden style={{ ...titleStyle, paddingRight: MARQUEE_GAP }}>{title}</span>
              </span>
            ) : (
              <span style={{ ...titleStyle, display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{reducedRef.current ? display : title}</span>
            )}
          </span>
        ) : (
          <span style={{ ...titleStyle, overflow: "hidden", textOverflow: "ellipsis" }}>{display}</span>
        )}
      </button>
      {open && trackId && <TrackSheet trackId={trackId} onClose={() => setOpen(false)} />}
    </>
  );
}
