"use client";

/**
 * LookSavedOverlay — the "Added to Palette" confirmation. Plays ONLY on a
 * confirmed save success (the caller mounts it after the insert resolved). It is
 * a pure presentation overlay: position:fixed, pointerEvents:none, so the editor
 * stays fully interactive underneath (never a modal).
 *
 * Choreography (red 2.39:1-style corner brackets, same bracket LANGUAGE as the
 * loader but its own animation — not entangled):
 *   1. LOCK   — brackets snap into the image's corners, staggered 40ms, ~0.5s.
 *   2. HOLD   — a brief beat with the frame locked (the capture).
 *   3. FLY    — the whole frame contracts (~0.12) and flies to the PALETTE tab.
 *   4. PING   — onArrive fires so the caller can ping the tab as the frame lands.
 *   5. TEXT   — "[ ADDED TO PALETTE ]" fades in near the bottom, then out.
 * Total ~2s. Remount with a fresh key to restart cleanly on rapid re-saves.
 */

import { useEffect, useRef, useState } from "react";

const RED = "#FF0000";
const EASE = "cubic-bezier(0.16,0.84,0.3,1)";
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export interface Rect { left: number; top: number; width: number; height: number }

interface Props {
  source: Rect;                 // the image stage's on-screen rect
  target: { x: number; y: number }; // the PALETTE tab centre
  onArrive?: () => void;        // frame reaches the tab → ping it
  onDone?: () => void;          // sequence complete → unmount
}

export default function LookSavedOverlay({ source, target, onArrive, onDone }: Props) {
  const [phase, setPhase] = useState<"lock" | "fly">("lock");
  const [textIn, setTextIn] = useState(false);
  const arrived = useRef(false);

  useEffect(() => {
    const t: number[] = [];
    t.push(window.setTimeout(() => { setPhase("fly"); setTextIn(true); }, 820));        // lock+hold → fly
    t.push(window.setTimeout(() => { if (!arrived.current) { arrived.current = true; onArrive?.(); } }, 1360)); // fly end
    t.push(window.setTimeout(() => setTextIn(false), 1650));
    t.push(window.setTimeout(() => onDone?.(), 2050));
    return () => t.forEach(clearTimeout);
  }, [onArrive, onDone]);

  const cx = source.left + source.width / 2;
  const cy = source.top + source.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;

  const arm = Math.max(14, Math.round(Math.min(source.width, source.height) * 0.16));
  const t = 2;     // bracket thickness
  const off = 22;  // snap-in outward offset

  const corners = [
    { k: "tl", pos: { top: -t, left: -t },     bd: { borderTop: `${t}px solid ${RED}`, borderLeft: `${t}px solid ${RED}` },     dx: -off, dy: -off, d: 0 },
    { k: "tr", pos: { top: -t, right: -t },    bd: { borderTop: `${t}px solid ${RED}`, borderRight: `${t}px solid ${RED}` },    dx:  off, dy: -off, d: 40 },
    { k: "bl", pos: { bottom: -t, left: -t },  bd: { borderBottom: `${t}px solid ${RED}`, borderLeft: `${t}px solid ${RED}` },  dx: -off, dy:  off, d: 80 },
    { k: "br", pos: { bottom: -t, right: -t }, bd: { borderBottom: `${t}px solid ${RED}`, borderRight: `${t}px solid ${RED}` }, dx:  off, dy:  off, d: 120 },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 320, pointerEvents: "none" }}>
      {/* Frame — sits on the image (source rect), then flies to the tab. */}
      <div
        style={{
          position: "fixed",
          left: source.left, top: source.top, width: source.width, height: source.height,
          transformOrigin: "center center",
          transform: phase === "fly" ? `translate(${dx}px, ${dy}px) scale(0.12)` : "translate(0,0) scale(1)",
          opacity: phase === "fly" ? 0 : 1,
          transition: phase === "fly" ? `transform 0.55s ${EASE}, opacity 0.55s ${EASE}` : "none",
        }}
      >
        {corners.map((c) => {
          const st: React.CSSProperties = { position: "absolute", width: arm, height: arm, ...c.pos, ...c.bd };
          if (phase === "lock") {
            (st as Record<string, string | number>)["--lx"] = `${c.dx}px`;
            (st as Record<string, string | number>)["--ly"] = `${c.dy}px`;
            st.animation = `lookBracketSnap 0.5s ${EASE} ${c.d}ms both`;
          }
          return <div key={c.k} style={st} />;
        })}
      </div>

      {/* "[ ADDED TO PALETTE ]" — red brackets enclosing the words. */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: "14%", textAlign: "center", opacity: textIn ? 1 : 0, transition: `opacity 0.3s ${EASE}` }}>
        <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: RED, letterSpacing: "0.22em", textTransform: "uppercase" }}>[ ADDED TO PALETTE ]</span>
      </div>

      <style>{`
        @keyframes lookBracketSnap {
          0%   { opacity: 0; transform: translate(var(--lx,0), var(--ly,0)) scale(0.55); }
          100% { opacity: 1; transform: translate(0,0) scale(1); }
        }
      `}</style>
    </div>
  );
}
