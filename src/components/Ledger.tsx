// ── Ledger primitives (Brief 2.3 · node 37:123) ─────────────────────────────
// TWO new house recipes introduced by the wallet ledger design; both propagate
// to later surfaces, so they live here as shared, inline-styled components (no
// Tailwind classes → no JIT-scan concerns).
//
//  1. <LedgerCard> — the ledger container. A separate blurred, ~33%-opacity ivory
//     border LAYER sits over a transparent (or gradient) fill so the stroke reads
//     as a soft hairline frame, never a hard 1px box.
//  2. <DottedLeader> — the flex-1 filler between a label and its value: repeated
//     periods in 65 Medium, wide-tracked, ~60% ink, clipped so it survives any
//     value width. Compose rows as: label · <DottedLeader/> · value.
"use client";

import React from "react";

type LedgerVariant = "border" | "gradient";

const GRADIENT_FILL =
  "linear-gradient(149deg, rgba(217,217,217,0.29) 12%, rgba(8,8,8,0.29) 81%)";
// Near-transparent fill for the plain border variant (lets the canvas read through).
const BORDER_FILL = "rgba(217,217,217,0.02)";

export function LedgerCard({
  variant = "border",
  radius = 10,
  borderOpacity = 0.33,
  style,
  children,
  ...rest
}: {
  variant?: LedgerVariant;
  radius?: number;
  borderOpacity?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: radius,
        background: variant === "gradient" ? GRADIENT_FILL : BORDER_FILL,
        ...style,
      }}
      {...rest}
    >
      {/* Border LAYER — blurred + held at ~33% so the 1px ivory stroke reads soft. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          border: "1px solid #E5E1DB",
          opacity: borderOpacity,
          filter: "blur(0.7px)",
          pointerEvents: "none",
        }}
      />
      {children}
    </div>
  );
}

// The row filler. Rendered as repeated periods (65 Medium, wide-tracked) inside a
// flex-1 clip, lifted to sit on the row's vertical centre (periods otherwise ride
// the baseline). Purely decorative → aria-hidden.
export function DottedLeader({
  color = "rgba(229,225,219,0.60)",
  size = 11.8,
  tracking = 2.6,
  style,
}: {
  color?: string;
  size?: number;
  tracking?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        flex: 1,
        minWidth: 8,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        alignSelf: "stretch",
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-medium)",
          fontWeight: 500,
          fontSize: size,
          letterSpacing: `${tracking}px`,
          color,
          whiteSpace: "nowrap",
          lineHeight: 1,
          transform: "translateY(-0.24em)", // lift baseline periods to the centre
        }}
      >
        {".".repeat(80)}
      </span>
    </span>
  );
}
