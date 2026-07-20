// ── GrainLayer (Brief 1b · nodes 36:3 etc.) ─────────────────────────────────
// The app-wide filmic grain. Law: grain sits ABOVE chrome/text/menus and BELOW
// user media. This layer paints the grain; media is lifted above it by giving the
// media wrapper `z-index: var(--z-media)` (see the z-token scale in globals.css).
//
// Mount pattern:
//  - CLEAN ancestor chain  → one instance at the surface root; promote media wrappers.
//  - DIRTY / load-bearing context (fixed scroller, Framer layoutId, rotate stage,
//    portaled sheet) → mount an instance INSIDE that context and promote media within
//    it (a body-level layer can't interleave a trapped child's z-index).
//
// pointer-events:none lets every press pass straight through. Static (no animation).
// Kill switch: html.no-grain hides all instances (globals.css), like no-soften.
"use client";

import { useIsDesktop } from "@/lib/useIsDesktop";

export default function GrainLayer({
  position = "fixed",
  z = "var(--z-grain)",
}: {
  /** 'fixed' pins to the viewport (default); 'absolute' fills the nearest
      positioned ancestor — use inside a bounded surface (a sheet/stage). */
  position?: "fixed" | "absolute";
  /** z-index override for surface-local mounts that need a different local slot. */
  z?: string;
}) {
  const isDesktop = useIsDesktop();
  const asset = isDesktop
    ? "/design-updates-071526/global-grain-overlay-desktop.png"
    : "/design-updates-071526/global-grain-overlay-mobile.png";
  return (
    <div
      aria-hidden
      className="grain-layer"
      style={{
        position,
        inset: 0,
        backgroundImage: `url(${asset})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        mixBlendMode: "overlay",
        opacity: 0.8,
        pointerEvents: "none",
        zIndex: z,
      }}
    />
  );
}
