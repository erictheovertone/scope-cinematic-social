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
// width:
//   'max'    → var(--shell-max)  (grid/canvas: Home, Profile, Screening Room, Decks)
//   'narrow' → var(--shell-narrow) (reading/detail: bio sheet)
//   number   → a bespoke composition width (wallet 1160, viewing-modes 1120, grid-picker
//              900, home-lightbox 1369) — kept as-is pending Eric's R1 notes ruling.

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
  width?: "max" | "narrow" | number;
  padding?: CSSProperties["padding"];
  style?: CSSProperties;
  className?: string;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}) {
  const maxWidth =
    width === "max" ? "var(--shell-max)" : width === "narrow" ? "var(--shell-narrow)" : width;
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
