// ── BioMusicSection — the bio sheet's MUSIC section (Brief MUS-1 §4; mock §4) ────────────────────
// Album covers live in ONE place on a user's pages: here, in the bio sheet — never the profile
// grid/header. Loads the user's public catalog (composerCatalog) and renders NOTHING when they have
// no album with an approved track (users without an album have no Music section).
//   variant "sheet"   — the mobile ProfileDataSheet section recipe: big "Music" title left (168px
//                       column), covers right-aligned at 112px like the Links tiles, name +
//                       "year · N tracks" beneath each.
//   variant "desktop" — DesktopBioSheet's band recipe (250px uppercase title + accent rule, hairline
//                       top, 44px rhythm), covers left-flowing at 112px.
//   omitted           — picks by useIsDesktop(), so one `<BioMusicSection userId=… />` fits both hosts.
// `renderFrame` wraps the bare cover row in a host's own frame instead (only called when there is
// music). Tap a cover → onNavigate() (host closes the sheet) → /track/<album's first track>.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { composerCatalog, albumCover, type CatalogAlbum, type CatalogTrack } from "@/lib/musicCatalog";
import { CoverPlaceholder, albumMeta } from "@/components/music/musicUi";

export interface BioMusicSectionProps {
  /** profiles.user_id / users.id of the profile being viewed. */
  userId: string | null | undefined;
  variant?: "sheet" | "desktop";
  /** Called before navigating (e.g. close the sheet). */
  onNavigate?: () => void;
  /** Wrap the bare cover row in the host's own section frame (only called when there is music). */
  renderFrame?: (content: React.ReactNode) => React.ReactNode;
  /** Merged onto the section root. */
  style?: React.CSSProperties;
}

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function BioMusicSection({ userId, variant, onNavigate, renderFrame, style }: BioMusicSectionProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [data, setData] = useState<{ albums: CatalogAlbum[]; tracks: CatalogTrack[] } | null>(null);

  useEffect(() => {
    if (!userId) { setData(null); return; }
    let dead = false;
    composerCatalog(String(userId)).then((d) => { if (!dead) setData(d); }).catch(() => { if (!dead) setData(null); });
    return () => { dead = true; };
  }, [userId]);

  if (!data || data.albums.length === 0) return null;

  const open = (al: CatalogAlbum) => {
    const first = data.tracks.filter((t) => t.album_id === al.id).sort((x, y) => x.position - y.position)[0];
    if (!first) return;
    onNavigate?.();
    router.push(`/track/${first.id}`);
  };

  const sheet = (variant ?? (isDesktop ? "desktop" : "sheet")) === "sheet" && !renderFrame;
  const tiles = (
    <div style={sheet
      ? { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16 }
      : { display: "flex", flexWrap: "wrap", gap: 16 }}>
      {data.albums.map((al) => {
        const cover = albumCover(al, data.tracks);
        return (
          <button key={al.id} type="button" onClick={(e) => { e.stopPropagation(); open(al); }} aria-label={`${al.title} — open album`}
            data-testid={`bio-music-album-${al.id}`}
            style={{ width: 112, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: sheet ? "right" : "left" }}>
            <div style={{ width: 112, height: 112, overflow: "hidden", background: "var(--surface-2)" }}>
              {cover ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <CoverPlaceholder title={al.title} />}
            </div>
            <div style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: sheet ? 10 : 12, color: "rgb(var(--ink-rgb) / 0.79)", letterSpacing: "var(--track-body)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{al.title}</div>
            <div style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: sheet ? 9 : 11, color: "rgb(var(--ink-rgb) / 0.4)", letterSpacing: "var(--track-body)", marginTop: 2 }}>{albumMeta(al.year, al.trackCount)}</div>
          </button>
        );
      })}
    </div>
  );

  if (renderFrame) return <div data-testid="bio-music" style={style}>{renderFrame(tiles)}</div>;

  if (!sheet) return (
    <div data-testid="bio-music" style={{ display: "flex", gap: 44, padding: "44px 0", borderTop: "1px solid rgb(var(--ink-rgb) / 0.12)", ...style }}>
      <div style={{ width: 250, flexShrink: 0 }}>
        <p style={{ ...SKB, fontSize: "calc(32px * var(--type-scale))", lineHeight: 1, color: "var(--ink-100)", textTransform: "uppercase", letterSpacing: "-0.01em", margin: 0 }}>Music</p>
        <div style={{ width: 32, height: 2, background: "var(--ink-100)", margin: "13px 0 0" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>{tiles}</div>
    </div>
  );

  return (
    <div data-testid="bio-music" style={{ display: "flex", boxSizing: "border-box", padding: "16px 8px 18px", ...style }}>
      <div style={{
        width: 168, flexShrink: 0, paddingLeft: 6, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24,
        letterSpacing: "var(--track-display)", color: "var(--ink-100)", lineHeight: 1.05,
      }}>Music</div>
      {tiles}
    </div>
  );
}
