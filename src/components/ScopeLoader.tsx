"use client";

import { useEffect, useState } from "react";

/**
 * ScopeLoader — the logomark "Pulse" loader (Brief L1, approved variant 01).
 * Replaces FrameLoader everywhere.
 *
 * Technique: six absolutely-positioned layers, each the SAME logomark PNG used as
 * a mask over a solid --ink (#E5E1DB) fill, then clip-pathed to one arc "blade" of
 * the mark. No vector tracing. The mark is symmetric — three blades per side — so
 * the six layers are (left|right) × (inner|mid|outer). Each pulses opacity
 * .2 → 1 → .2; the stagger (inner 0s · mid .2s · outer .4s) makes the pulse travel
 * center-out. Opacity-only animation → GPU-cheap, no layout thrash even with many
 * small instances in a feed.
 *
 * Arc boundaries (SEAMS): the logomark's blades and the gaps between them were
 * measured from the asset's alpha channel (594×375). Each seam sits in a near-zero
 * ink trough so a single blade never splits across two differently-timed layers:
 *   left  outer|mid  13.5%  (measured zero gap 12.6–13.8%)
 *   left  mid|inner  25%    (measured zero gap 24.1–26.3%)
 *   center           50%    (empty aperture, zero ink 38–61%)
 *   right inner|mid  74%    (measured zero gap 73.1–74.4%; NOT the symmetric 75%,
 *                            which clips the leading edge of the right-mid blade)
 *   right mid|outer  86%    (measured ink minimum ~85.7%)
 */

const ASSET = "/design-updates-071526/scope-logomark-offwhite.png";
const INK = "var(--ink)"; // #E5E1DB
const ASPECT = "594 / 375"; // the asset's native ratio; height follows width

// Timing (all named per brief) ------------------------------------------------
const DURATION = "1.6s";
const EASING = "cubic-bezier(.45, 0, .35, 1)";
const STAGGER = { inner: 0, mid: 0.2, outer: 0.4 } as const; // seconds, center-out
const REDUCED_OPACITY = 0.85; // static mark when motion is disabled

// Arc-boundary seams (% from left), measured from the asset's alpha channel -----
const SEAM = {
  outerMidL: 13.5,
  midInnerL: 25,
  center: 50,
  innerMidR: 74,
  midOuterR: 86,
} as const;

// Six blades: same mask, clipped to one arc band, grouped by pulse tier.
// clip-path inset(top right bottom left) — kept x-range is [left, 100 − right].
const BLADES = [
  { k: "left-inner",  clip: `inset(0 ${100 - SEAM.center}% 0 ${SEAM.midInnerL}%)`, delay: STAGGER.inner },
  { k: "right-inner", clip: `inset(0 ${100 - SEAM.innerMidR}% 0 ${SEAM.center}%)`, delay: STAGGER.inner },
  { k: "left-mid",    clip: `inset(0 ${100 - SEAM.midInnerL}% 0 ${SEAM.outerMidL}%)`, delay: STAGGER.mid },
  { k: "right-mid",   clip: `inset(0 ${100 - SEAM.midOuterR}% 0 ${SEAM.innerMidR}%)`, delay: STAGGER.mid },
  { k: "left-outer",  clip: `inset(0 ${100 - SEAM.outerMidL}% 0 0)`, delay: STAGGER.outer },
  { k: "right-outer", clip: `inset(0 0 0 ${SEAM.midOuterR}%)`, delay: STAGGER.outer },
] as const;

const SIZE_W = { sm: 28, md: 48, lg: 96 } as const;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

interface ScopeLoaderProps {
  /** Width tier: sm 28px · md 48px · lg 96px. Height follows the 594/375 ratio. */
  size?: "sm" | "md" | "lg";
  /** Optional caption beneath (house micro-caps). Off by default. */
  label?: string;
}

export default function ScopeLoader({ size = "md", label }: ScopeLoaderProps) {
  const reduced = usePrefersReducedMotion();
  const width = SIZE_W[size];

  return (
    <div
      role="status"
      aria-label={label ?? "Loading"}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: label ? 8 : 0 }}
    >
      <div style={{ position: "relative", width, aspectRatio: ASPECT }}>
        {BLADES.map((b) => {
          const mask = `url(${ASSET}) center / contain no-repeat`;
          const style: React.CSSProperties = {
            position: "absolute",
            inset: 0,
            background: INK,
            // -webkit- first for Safari; standard `mask` for everyone else.
            ...({ WebkitMask: mask, mask } as React.CSSProperties),
            clipPath: b.clip,
            willChange: "opacity",
          };
          if (reduced) {
            style.opacity = REDUCED_OPACITY;
          } else {
            style.animation = `scopeLoaderPulse ${DURATION} ${EASING} ${b.delay}s infinite`;
          }
          return <div key={b.k} style={style} />;
        })}
      </div>
      {label ? (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--ink-30)",
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
