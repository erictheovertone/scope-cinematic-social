"use client";

// ── DesktopShell — the ONE centered content wrapper for every desktop surface ──
// (Brief R1). No desktop surface computes its own centering: it renders its content
// inside <DesktopShell> and the primitive applies `max-width: var(--shell-max);
// margin: 0 auto`. The rail clearance itself is the OUTER fixed scroller's
// `left: var(--rail-w)` (unchanged positioning context → the 1440 anchor is preserved);
// this primitive owns the cap + centering only. Content centers within (viewport −
// rail-w), so the empty-canvas gutters read symmetric with the rail pinned in the left
// margin.
//
// width (Brief R1a — the growth policy is expressed here):
//   'fluid'  → var(--shell-fluid)  MEDIA surfaces that fill the window (Home, Profile,
//              Screening Room, Decks, Home Lightbox). The bound is a safety cap only.
//   'max'    → var(--shell-max)   capped UI/reading surfaces (DM line-length, etc.)
//   'narrow' → var(--shell-narrow) tighter reading surfaces (bio sheet)
//   number   → a bespoke composition width (viewing-modes 1120, grid-picker 900).

import type { CSSProperties, ReactNode, Ref } from "react";

export default function DesktopShell({
  children,
  width = "max",
  padding,
  style,
  className,
  scrollRef,
  onScroll,
}: {
  children: ReactNode;
  width?: "fluid" | "max" | "narrow" | number;
  padding?: CSSProperties["padding"];
  style?: CSSProperties;
  className?: string;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}) {
  const maxWidth =
    width === "fluid" ? "var(--shell-fluid)"
    : width === "max" ? "var(--shell-max)"
    : width === "narrow" ? "var(--shell-narrow)"
    : width;
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={className}
      style={{ maxWidth, margin: "0 auto", padding, ...style }}
    >
      {children}
    </div>
  );
}
