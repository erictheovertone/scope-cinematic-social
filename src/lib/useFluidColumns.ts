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

export function useFluidColumns(base: number, maxCard: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(base);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") { setCols(base); return; }
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setCols(Math.max(base, Math.ceil(w / maxCard)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [base, maxCard]);
  return [ref, cols] as const;
}
