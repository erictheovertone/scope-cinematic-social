// ── FilmstripIndicator (Brief 2.5 · node 38:88) ─────────────────────────────
// The active-tab motif: a short row of tiny hairline "film cells" sitting under
// the active label. Introduced on the desktop profile tab row; kept here as a
// shared house motif so other tab/segment rows can adopt it. Inline-styled (no
// Tailwind classes → no JIT-scan concern).
"use client";

import React from "react";

export default function FilmstripIndicator({
  cells = 3,
  cellW = 16,
  cellH = 8,
  gap = 3,
  opacity = 0.38,
  style,
}: {
  cells?: number;
  cellW?: number;
  cellH?: number;
  gap?: number;
  opacity?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span aria-hidden style={{ display: "inline-flex", gap, ...style }}>
      {Array.from({ length: cells }).map((_, i) => (
        <span key={i} style={{ width: cellW, height: cellH, border: "0.5px solid #E5E1DB", opacity, display: "block", boxSizing: "border-box" }} />
      ))}
    </span>
  );
}
