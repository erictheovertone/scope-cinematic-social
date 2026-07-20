// ── BadgeCluster — mobile profile badges (Brief 1a · node 1:9) ───────────────
// Retires the PFP-side BannerBadgeStrip + its backdrop. A compact cluster of the
// new landscape assets at small scale (two short rows via wrap), ivory opacities in
// the 57–75% band. The WHOLE cluster is one ≥44px tap target (invisible expanded
// hit area — the hit-geometry rule) that opens the badges sheet; per-badge routing
// (e.g. the composer → discography) happens from inside the sheet.
"use client";

export interface ClusterBadge { key: string; src: string; title?: string }

export default function BadgeCluster({
  badges, onOpen,
}: {
  badges: ClusterBadge[];
  onOpen: () => void;
}) {
  if (!badges.length) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      aria-label="Badges"
      className="tappable"
      style={{ background: "none", border: "none", padding: 10, margin: -10, cursor: "pointer", display: "block" }} // padding→≥44px hit, margin cancels layout push
    >
      <span style={{ display: "flex", flexWrap: "wrap", gap: 3, maxWidth: 68, justifyContent: "flex-end", rowGap: 3 }}>
        {badges.slice(0, 10).map((b, i) => (
          <img
            key={b.key}
            src={b.src}
            alt={b.title ?? b.key}
            style={{ height: 9, width: "auto", objectFit: "contain", display: "block", opacity: 0.57 + (i % 4) * 0.06 }}
          />
        ))}
      </span>
    </button>
  );
}
