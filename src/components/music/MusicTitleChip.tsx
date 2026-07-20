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
}: {
  post: { music_track_id?: string | null };
  color?: string;
}) {
  const trackId = post.music_track_id ?? null;
  const track = useTrackForPost(trackId);
  const [open, setOpen] = useState(false);

  if (!trackId) return null;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="tappable"
        style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        {/* small wave glyph */}
        <svg width="13" height="10" viewBox="0 0 13 10" style={{ flexShrink: 0 }}>
          <path d="M1 5 Q2.25 1 3.5 5 T6.5 5 T9.5 5 T12.5 5" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span style={{ ...SKB, fontSize: "var(--fs-7)", color, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {track?.title ?? "MUSIC"}
        </span>
      </button>
      {open && trackId && <TrackSheet trackId={trackId} onClose={() => setOpen(false)} />}
    </>
  );
}
