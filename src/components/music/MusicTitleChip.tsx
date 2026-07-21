// ── MusicTitleChip — "♪ TITLE" under the handle / above content ──────────────
// Tapping opens the TrackSheet. Renders NOTHING when the post has no music (the
// dash-rule cousin — zero music chrome on music-less posts).
"use client";

import { useState } from "react";
import { useTrackForPost } from "@/lib/useTrack";
import TrackSheet from "@/components/music/TrackSheet";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function MusicTitleChip({
  post, color = "rgba(229,225,219,0.6)",
  uppercase = true, fontSize = "var(--fs-7)", weight = 700, glyphW = 13, glyphH = 10, maxChars,
}: {
  post: { music_track_id?: string | null };
  color?: string;
  /** Brief F3 song row: false → render the title AS STORED (sentence case). */
  uppercase?: boolean;
  fontSize?: string | number;
  weight?: number;
  glyphW?: number;
  glyphH?: number;
  /** Hard char cap (title-length truncation) — ellipsis appended. */
  maxChars?: number;
}) {
  const trackId = post.music_track_id ?? null;
  const track = useTrackForPost(trackId);
  const [open, setOpen] = useState(false);

  if (!trackId) return null;

  const title = track?.title ?? "MUSIC";
  const display = maxChars && title.length > maxChars ? title.slice(0, maxChars - 1).trimEnd() + "…" : title;

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
        <span style={{ fontFamily: weight >= 700 ? SKB.fontFamily : "var(--font-body)", fontWeight: weight, fontSize, color, textTransform: uppercase ? "uppercase" : "none", letterSpacing: uppercase ? "0.06em" : "var(--track-body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {display}
        </span>
      </button>
      {open && trackId && <TrackSheet trackId={trackId} onClose={() => setOpen(false)} />}
    </>
  );
}
