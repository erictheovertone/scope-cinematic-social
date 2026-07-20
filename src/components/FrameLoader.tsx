"use client";

import { useEffect, useState } from "react";

/**
 * FrameLoader — the viewfinder corner-bracket loader that replaces the old red
 * bouncing ball everywhere. Four red `#E5E1DB` L-shaped corner brackets form an
 * aperture frame (sides not drawn). Two tiers:
 *
 *   • SWIFT (default): the four brackets snap in from just outside their corners
 *     (translate inward + scale 0.6→1 with a tiny overshoot + fade), staggered
 *     40ms corner-to-corner, ~0.5s, easing cubic-bezier(0.16,0.84,0.3,1). The
 *     camera-locking-focus motion — gone almost before noticed on fast loads.
 *   • PULSE (escalation): if the load is still mounted past `pulseAfter` (~350ms),
 *     the assembled frame breathes (opacity 0.45→1 + scale 0.97→1) on a calm
 *     1.1s loop. Only genuinely slow loads reach this; fast loads only flash.
 *
 * Keyframes `frameSnap` / `framePulse` live in globals.css. CSS-only motion.
 */
interface FrameLoaderProps {
  /** 'page' = larger frame for full-screen contexts; 'inline' = small spinner. */
  variant?: "page" | "inline";
  /** Optional explicit frame WIDTH in px (defaults: page 120, inline 43). Height
   *  is derived from the 2.39:1 SCOPE ratio. */
  size?: number;
  /** ms before escalating from the swift snap-in to the breathing pulse. */
  pulseAfter?: number;
}

const RED = "#E5E1DB";
const SCOPE_AR = 2.39; // the namesake cinematic ratio — the frame is wide, not square

export default function FrameLoader({ variant = "inline", size, pulseAfter = 350 }: FrameLoaderProps) {
  // Two-tier: start on the swift snap-in; escalate to the breathing pulse only
  // if this loader survives past the threshold (i.e. the load is genuinely slow).
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPulsing(true), pulseAfter);
    return () => clearTimeout(t);
  }, [pulseAfter]);

  const W = size ?? (variant === "page" ? 120 : 43); // frame width
  const H = Math.round(W / SCOPE_AR);                // 2.39:1 SCOPE frame height
  const arm = Math.max(4, Math.round(H * 0.42));     // bracket arm length (off the short side)
  const t = variant === "page" ? 2 : 1.5;            // bracket line thickness
  const off = variant === "page" ? 8 : 5;            // snap-in outward offset

  const corners = [
    { k: "tl", pos: { top: 0, left: 0 },     bd: { borderTop: `${t}px solid ${RED}`, borderLeft: `${t}px solid ${RED}` },     dx: -off, dy: -off, d: 0 },
    { k: "tr", pos: { top: 0, right: 0 },    bd: { borderTop: `${t}px solid ${RED}`, borderRight: `${t}px solid ${RED}` },    dx:  off, dy: -off, d: 40 },
    { k: "bl", pos: { bottom: 0, left: 0 },  bd: { borderBottom: `${t}px solid ${RED}`, borderLeft: `${t}px solid ${RED}` },  dx: -off, dy:  off, d: 80 },
    { k: "br", pos: { bottom: 0, right: 0 }, bd: { borderBottom: `${t}px solid ${RED}`, borderRight: `${t}px solid ${RED}` }, dx:  off, dy:  off, d: 120 },
  ];

  return (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: W,
          height: H,
          // Pulse the whole assembled frame once escalated; brackets rest at full.
          animation: pulsing ? "framePulse 1.1s ease-in-out infinite" : "none",
        }}
      >
        {corners.map((c) => {
          const style: React.CSSProperties = {
            position: "absolute",
            width: arm,
            height: arm,
            ...c.pos,
            ...c.bd,
          };
          if (!pulsing) {
            // CSS custom props carry each bracket's outward start offset into the
            // shared frameSnap keyframe (cast: React.CSSProperties has no var typing).
            (style as Record<string, string | number>)["--fdx"] = `${c.dx}px`;
            (style as Record<string, string | number>)["--fdy"] = `${c.dy}px`;
            style.animation = `frameSnap 0.5s cubic-bezier(0.16,0.84,0.3,1) ${c.d}ms both`;
          }
          return <div key={c.k} style={style} />;
        })}
      </div>
    </div>
  );
}
