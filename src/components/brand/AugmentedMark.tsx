// ── AugmentedMark — the brass Augmented treatment, one place (Brief AUG-1 §5) ────────────────────
// Brass (#C8A86A, gradient E9D29A→C8A86A→8E7340 on the mark) is used ONLY for Augmented members:
//   <AugmentedMark>  the six-blade aperture in brass (hero sizes: upsell, Arrival)
//   <AugmentedTag>   the "◈ AUGMENTED" tag that replaces PRO beside a name
//   <BrassFrame>     the 2px brass frame around a square avatar
//   <AugmentedChip>  the mark-only chip beside a username on posts + comments
//   <BrassAperture>  the round badge-row aperture (profile badge row, bio-sheet Badges)
// Non-members render none of these — callers gate on tierOf()/useAugmented(), never here.
// The gradient is a per-instance <linearGradient> (unique id) so many marks on one page never
// collide and the mark still renders inside portals/shadow roots.
"use client";

import { useId } from "react";
import { MARK_BLADES } from "./markBlades";

const STOPS = ["#E9D29A", "#C8A86A", "#8E7340"] as const;

export function AugmentedMark({ width = 15, title }: { width?: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  const height = Math.round((width * 408) / 666);
  return (
    <svg viewBox="-333 -204 666 408" width={width} height={height} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ display: "inline-block", verticalAlign: "middle", flex: "none" }}>
      <defs>
        <linearGradient id={`brass${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={STOPS[0]} /><stop offset=".5" stopColor={STOPS[1]} /><stop offset="1" stopColor={STOPS[2]} />
        </linearGradient>
      </defs>
      <g fill={`url(#brass${id})`}>{MARK_BLADES.map((d, i) => <path key={i} d={d} />)}</g>
    </svg>
  );
}

const TAG: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, flex: "none",
  color: "var(--brass)", border: "1px solid var(--brass)", padding: "2px 5px", lineHeight: 1,
  fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase",
};

/** The tag beside a name (replaces PRO). `size` scales the type for the desktop header. */
export function AugmentedTag({ size = 8, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <span data-testid="augmented-tag" style={{ ...TAG, fontSize: size, gap: Math.round(size / 2), ...style }}>
      <AugmentedMark width={Math.round(size * 1.9)} />Augmented
    </span>
  );
}

/** Brass frame on a square avatar: wraps the existing avatar element, 2px of gradient. */
export function BrassFrame({ on, children, style }: { on: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  if (!on) return <>{children}</>;
  return <div data-testid="brass-frame" style={{ padding: 2, background: "var(--brass-grad)", lineHeight: 0, flex: "none", ...style }}>{children}</div>;
}

/** Mark-only chip beside a username on posts and comments. */
export function AugmentedChip({ size = 12 }: { size?: number }) {
  return (
    <span data-testid="augmented-chip" title="Augmented" style={{ display: "inline-flex", alignItems: "center", marginLeft: 4, verticalAlign: "middle", lineHeight: 0 }}>
      <AugmentedMark width={size} title="Augmented" />
    </span>
  );
}

/** Round badge-row aperture (profile badge row / bio sheet Badges). */
export function BrassAperture({ size = 22 }: { size?: number }) {
  return (
    <span data-testid="brass-aperture" title="Augmented" style={{ width: size, height: size, borderRadius: "50%", border: "1px solid var(--brass)", display: "inline-grid", placeItems: "center", flex: "none" }}>
      <AugmentedMark width={Math.round(size * 0.68)} />
    </span>
  );
}
