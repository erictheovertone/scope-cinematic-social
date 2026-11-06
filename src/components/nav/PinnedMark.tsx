"use client";
// ── PinnedMark — Brief NAV-1, variant A "Stem" ───────────────────────────────────────────────────
// A 44px round logomark button pinned top-left once the mobile profile header scrolls off. It STAYS
// visible for the whole scroll (the old snap mark buried itself) and, on tap, grows a hairline "stem"
// into a two-row menu (COLLECTED / DECKS). Every press (open AND close) fires a short chromatic
// glitch. Theme-aware throughout (var(--ink) / var(--canvas-rgb)). prefers-reduced-motion drops the
// glitch + travel and swaps states instantly.
import { useState, useRef, useEffect, useCallback } from "react";
import { MARK_BLADES } from "@/components/brand/markBlades";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKM: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 500 };
const BRASS = "#C8A86A";
const OPEN_CURVE = "cubic-bezier(.22,1.3,.36,1)";
const CLOSE_CURVE = "cubic-bezier(.4,0,1,1)";

// Blades 0–2 are the LEFT half (x<0), 3–5 the RIGHT half. Outer pair (0,5) spread ±40 viewBox units,
// middle (1,4) ±24, inner (2,3) ±10, each with a small rotation — the aperture opening.
const SPREAD: { dx: number; rot: number }[] = [
  { dx: -40, rot: -8 }, { dx: -24, rot: -5 }, { dx: -10, rot: -2 },
  { dx: 10, rot: 2 }, { dx: 24, rot: 5 }, { dx: 40, rot: 8 },
];

export interface PinnedMarkRow { label: string; count: number; onClick: () => void; }

function Blades({ open, fill, clip, throwX }: { open: boolean; fill: string; clip?: string; throwX?: number }) {
  return (
    <svg viewBox="-333 -204 666 408" width={26} height={16} aria-hidden
      style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%)${throwX ? ` translateX(${throwX}px)` : ""}`, overflow: "visible", ...(clip ? { WebkitClipPath: clip, clipPath: clip } : {}) }}>
      <g fill={fill}>
        {MARK_BLADES.map((d, i) => (
          <path key={i} d={d} style={{
            transformBox: "fill-box", transformOrigin: "center",
            transform: open ? `translateX(${SPREAD[i].dx}px) rotate(${SPREAD[i].rot}deg)` : "none",
            transition: `transform 260ms ${open ? OPEN_CURVE : CLOSE_CURVE}`,
          }} />
        ))}
      </g>
    </svg>
  );
}

export default function PinnedMark({ visible, rows }: { visible: boolean; rows: PinnedMarkRow[] }) {
  const [open, setOpen] = useState(false);
  const [glitch, setGlitch] = useState(0); // bump to replay the press glitch
  // NAV-1b — explicit CLOSING state so the menu plays an exit (scale→.55 + fade, 160ms CLOSE_CURVE,
  // stem retracts) instead of vanishing. `menuRender` = in the DOM; `menuVisible` = at rest (scale 1).
  // Closing unmounts on the panel's transitionend (with a timeout safety net for reduced-motion).
  const [menuRender, setMenuRender] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const press = () => setGlitch((g) => g + 1);
  const toggle = useCallback(() => { press(); setOpen((o) => !o); }, []);
  const close = useCallback(() => { setOpen((o) => { if (o) press(); return false; }); }, []);

  // Drive render/visible off `open`: open → mount then (after a paint) grow; close → shrink, then
  // unmount once the exit transition ends.
  useEffect(() => {
    if (open) {
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = undefined; }
      setMenuRender(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setMenuVisible(true)));
      return () => cancelAnimationFrame(id);
    }
    setMenuVisible(false);
    // Fallback unmount if transitionend never fires (reduced-motion / no transition).
    closeTimer.current = window.setTimeout(() => setMenuRender(false), 240);
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // The mark hides (or the header returns) → the menu must not linger.
  useEffect(() => { if (!visible) setOpen(false); }, [visible]);

  return (
    <>
      <style>{`
        @keyframes nav-ghost-top { 0%,70% { opacity:.9 } 100% { opacity:0 } }
        @keyframes nav-ghost-bot { 0%,70% { opacity:.9 } 100% { opacity:0 } }
        @keyframes nav-main-glitch { 0% { transform:skewX(10deg); opacity:.55 } 50% { transform:skewX(-10deg); opacity:.55 } 100% { transform:none; opacity:1 } }
        @keyframes nav-ring-flash { 0% { border-color:${BRASS} } 60% { border-color:${BRASS} } 100% { border-color:rgb(var(--ink-rgb) / 0.18) } }
        @media (prefers-reduced-motion: reduce) {
          .nav-ghost, .nav-main-sk { animation: none !important; }
          .nav-menu-anim { transition: none !important; } /* NAV-1b — swap instantly (the 240ms fallback unmounts) */
        }
      `}</style>

      {/* Scrim — canvas at 38%, taps close. Fades in/out with the menu (NAV-1b: no hard cut). */}
      {menuRender && (
        <div onClick={close} aria-hidden className="nav-menu-anim"
          style={{
            position: "fixed", inset: 0, zIndex: 118, background: "rgb(var(--canvas-rgb) / 0.38)",
            opacity: menuVisible ? 1 : 0,
            transition: `opacity ${menuVisible ? "160ms " + OPEN_CURVE : "160ms " + CLOSE_CURVE}`,
          }} />
      )}

      {/* The pinned mark + stem + menu. Fixed top-left, 16px in, below the safe-area inset. */}
      <div
        data-testid="pinned-mark"
        style={{
          position: "fixed", top: "calc(var(--safe-top, 0px) + 10px)", left: 16, zIndex: 120,
          opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none",
          transition: "opacity 180ms ease",
        }}
      >
        {/* Mark button — 44px round, canvas 72% + 14px blur + 1px hairline (ink 18%). */}
        <button
          type="button" onClick={toggle} aria-label="Menu" aria-expanded={open}
          className="nav-main-sk"
          key={`ring-${glitch}`}
          style={{
            position: "relative", width: 44, height: 44, borderRadius: "50%",
            background: "rgb(var(--canvas-rgb) / 0.72)", WebkitBackdropFilter: "blur(14px)", backdropFilter: "blur(14px)",
            border: "1px solid rgb(var(--ink-rgb) / 0.18)", cursor: "pointer", padding: 0, display: "block",
            animation: glitch ? `nav-ring-flash 360ms steps(3) 1 both` : undefined,
          }}
        >
          {/* Glitch ghosts (behind the main mark): brass top-half thrown left, ink bottom-half right. */}
          {glitch > 0 && (
            <span key={`g-${glitch}`} aria-hidden style={{ position: "absolute", inset: 0 }}>
              <span className="nav-ghost" style={{ position: "absolute", inset: 0, animation: `nav-ghost-top 360ms steps(3) 1 both` }}>
                <Blades open={open} fill={BRASS} clip="inset(0 0 50% 0)" throwX={-2.5} />
              </span>
              <span className="nav-ghost" style={{ position: "absolute", inset: 0, animation: `nav-ghost-bot 360ms steps(3) 1 both` }}>
                <Blades open={open} fill="var(--ink)" clip="inset(50% 0 0 0)" throwX={2.5} />
              </span>
            </span>
          )}
          {/* Main mark — the one that skews + dims for a step on press. */}
          <span className="nav-main-sk" key={`m-${glitch}`} style={{ position: "absolute", inset: 0, animation: glitch ? `nav-main-glitch 360ms steps(3) 1 both` : undefined }}>
            <Blades open={open} fill="var(--ink)" />
          </span>
        </button>

        {/* Stem — a 1px hairline (ink 35%) dropping 12px from the mark's bottom-left, then the menu.
            NAV-1b: the stem RETRACTS (scaleY→0 from the top) and the menu scales to .55 + fades on the
            160ms CLOSE_CURVE; the panel's transitionend unmounts the block (transitionend precedes removal). */}
        {menuRender && (
          <>
            <div aria-hidden className="nav-menu-anim" style={{
              position: "absolute", left: 21, top: 44, width: 1, height: 12, background: "rgb(var(--ink-rgb) / 0.35)",
              transformOrigin: "top", transform: `scaleY(${menuVisible ? 1 : 0})`,
              transition: `transform ${menuVisible ? "200ms " + OPEN_CURVE : "160ms " + CLOSE_CURVE}`,
            }} />
            <div role="menu" data-testid="stem-menu" className="nav-menu-anim"
              data-menu-state={menuVisible ? "open" : "closing"}
              onTransitionEnd={(e) => {
                if (!menuVisible && e.propertyName === "transform") {
                  if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = undefined; }
                  setMenuRender(false);
                }
              }}
              style={{
                position: "absolute", left: 0, top: 56, minWidth: 164,
                transformOrigin: "top left",
                transform: `scale(${menuVisible ? 1 : 0.55})`, opacity: menuVisible ? 1 : 0,
                transition: `transform ${menuVisible ? "260ms " + OPEN_CURVE : "160ms " + CLOSE_CURVE}, opacity ${menuVisible ? "260ms " + OPEN_CURVE : "160ms " + CLOSE_CURVE}`,
                background: "rgb(var(--canvas-rgb) / 0.78)", WebkitBackdropFilter: "blur(14px)", backdropFilter: "blur(14px)",
                border: "1px solid rgb(var(--ink-rgb) / 0.18)",
              }}>
              {rows.map((r, i) => (
                <button key={r.label} type="button" role="menuitem"
                  onClick={() => { press(); setOpen(false); r.onClick(); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                    width: "100%", height: 40, padding: "0 14px", background: "transparent", cursor: "pointer",
                    border: "none", borderTop: i > 0 ? "1px solid rgb(var(--ink-rgb) / 0.12)" : "none",
                  }}>
                  <span style={{ ...SKB, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-100)" }}>{r.label}</span>
                  <span style={{ ...SKM, fontSize: 12, color: "rgb(var(--ink-rgb) / 0.55)", fontVariantNumeric: "tabular-nums" }}>{r.count}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
