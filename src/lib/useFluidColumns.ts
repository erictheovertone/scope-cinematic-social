"use client";

// ── useFluidColumns (Brief R1a) — the media-grid column policy ───────────────
// Media grids GROW with the viewport by ADDING columns, never by inflating cards
// past a sane maximum. The column count is the smallest N such that the card width
// (container ÷ N) stays ≤ maxCard, floored at `base`:
//
//     cols = max(base, ceil(containerWidth / maxCard))
//
// `base` is the surface's floor — Home's fixed 3, or the user/owner count setting on
// Profile/Decks (so a denser choice is honoured, and columns are only ADDED beyond it).
// The container's own clientWidth is measured (already minus rail + padding), so no
// viewport/rail math is needed. SSR-safe: renders `base` until the observer fires.

import { useEffect, useRef, useState } from "react";

// maxCols (Brief R1b) — an optional HARD ceiling on the column count. Default Infinity
// (unbounded growth, R1a behavior — Home/SR/Decks unaffected). The profile grid passes 5
// (the system's desktop_count ceiling): beyond the width where 5 columns reach maxCard,
// columns stop being added and the cards simply widen.
export function useFluidColumns(base: number, maxCard: number, maxCols = Infinity) {
  const ref = useRef<HTMLDivElement>(null);
  const clampBase = Math.min(base, maxCols);
  const [cols, setCols] = useState(clampBase);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") { setCols(clampBase); return; }
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setCols(Math.min(maxCols, Math.max(base, Math.ceil(w / maxCard))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [base, maxCard, maxCols, clampBase]);
  return [ref, cols] as const;
}
