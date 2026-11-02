"use client";
// ── BadgeArt — monochrome badge art that follows the theme (Brief LT-2 §2) ──────────────────────
// The badge PNGs are WHITE line-art (the registry `color` only drives glow/rim, never the art), so
// on the ivory light canvas they vanish. This renders the PNG as a CSS MASK filled with var(--ink):
// the alpha becomes an ink silhouette that flips with the theme — dark-on-ivory in light,
// ivory-on-dark in dark — with NO per-asset light variant, and it works on EITHER badge asset
// family (/design-updates-071526/new-badges or /badges) because the mask uses only the alpha.
// Under a [data-force-dark] ancestor var(--ink) resolves to the dark set (ivory), so celebration
// grounds stay correct automatically. Same mask technique as ScopeLoader / the splash mark.
//
// NOT for: the brass Augmented mark (use <BrassAperture> — a hard-coded gradient that must stay
// brass in both themes) or the red free-tier aperture (a deliberately-coloured asset → plain <img>).
import type { CSSProperties } from "react";

export default function BadgeArt({
  src,
  size,
  alt = "",
  title,
  className,
  style,
}: {
  src: string;
  /** Square box side in px; the mask is center/contain, so non-square art letterboxes cleanly. */
  size: number;
  alt?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const mask = `url("${src}") center / contain no-repeat`;
  return (
    <span
      role="img"
      aria-label={alt || title || undefined}
      title={title}
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flex: "none",
        background: "var(--ink)",
        // -webkit- first for Safari; standard `mask` for everyone else (the ScopeLoader pattern).
        ...({ WebkitMask: mask, mask } as CSSProperties),
        ...style,
      }}
    />
  );
}
