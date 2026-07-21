// ── MusicTitleChip — "♪ TITLE" post byline chip ──────────────────────────────
// Resolves the track (module-cached — no per-card fetch), opens the TrackSheet on
// tap, renders NOTHING when the post has no music (the dash-rule cousin).
//
// Brief W7 — the marquee mechanism is now the shared <SongMarquee> primitive. This
// component is the thin wrapper: track resolve + tap-to-open + TrackSheet. When
// `marquee` is set it renders SongMarquee (fixed-window overflow marquee, automatic);
// otherwise it renders the plain static-ellipsis chip (unchanged — used by the
// report-only static surfaces like PostModal). `windowPx` sizes the marquee window to
// each surface's byline/caption column.
"use client";

import { useState } from "react";
import { useTrackForPost } from "@/lib/useTrack";
import TrackSheet from "@/components/music/TrackSheet";
import SongMarquee from "@/components/music/SongMarquee";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function MusicTitleChip({
  post, color = "rgba(229,225,219,0.6)",
  uppercase = true, fontSize = "var(--fs-7)", weight = 700, glyphW = 13, glyphH = 10,
  marquee = false, windowPx = 175,
}: {
  post: { music_track_id?: string | null };
  color?: string;
  /** Brief F3 song row: false → render the title AS STORED (sentence case). */
  uppercase?: boolean;
  fontSize?: string | number;
  weight?: number;
  glyphW?: number;
  glyphH?: number;
  /** Brief W3/W6/W7 — overflow-only marquee within a fixed window (via <SongMarquee>). */
  marquee?: boolean;
  /** Marquee window width (px) = this surface's byline column. Only used when marquee. */
  windowPx?: number;
}) {
  const trackId = post.music_track_id ?? null;
  const track = useTrackForPost(trackId);
  const [open, setOpen] = useState(false);

  if (!trackId) return null;
  const title = track?.title ?? "MUSIC";

  const titleStyle: React.CSSProperties = {
    fontFamily: weight >= 700 ? SKB.fontFamily : "var(--font-body)",
    fontWeight: weight, fontSize, color,
    textTransform: uppercase ? "uppercase" : "none",
    letterSpacing: uppercase ? "0.06em" : "var(--track-body)",
    whiteSpace: "nowrap",
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="tappable"
        style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", minWidth: 0, background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        {marquee ? (
          <SongMarquee title={title} uppercase={uppercase} fontSize={fontSize} weight={weight} color={color} glyphW={glyphW} glyphH={glyphH} windowPx={windowPx} />
        ) : (
          <>
            {/* static chip (unchanged): glyph + CSS-ellipsis title */}
            <svg width={glyphW} height={glyphH} viewBox="0 0 13 10" style={{ flexShrink: 0 }}>
              <path d="M1 5 Q2.25 1 3.5 5 T6.5 5 T9.5 5 T12.5 5" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span style={{ ...titleStyle, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          </>
        )}
      </button>
      {open && trackId && <TrackSheet trackId={trackId} onClose={() => setOpen(false)} />}
    </>
  );
}
