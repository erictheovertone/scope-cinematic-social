"use client";
// ── useIsDesktop — the ONE JS gate for the 1024 desktop breakpoint ───────────
//
// Stage 3 mount boundary. Prefer CSS (@media (min-width:1024px) / --bp-desktop)
// wherever possible; use this only where the desktop swap must be JS-gated (e.g.
// mounting a different shell component). Reads the SAME 1024 value as the CSS
// token so the two can never disagree. SSR-safe: false on the server / first
// paint, syncs on mount — so it never causes a hydration mismatch flash.

import { useEffect, useState } from "react";

export const BP_DESKTOP = 1024;

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    // Brief F5 §1 — the desktop seam must key on INPUT CLASS, not width alone. A
    // touch device at ≥1024 CSS px (landscape tablet; and any future large phone)
    // would otherwise flip to the desktop composition on rotate. `(hover:hover) and
    // (pointer:fine)` is true only for a mouse/trackpad-class primary input, so every
    // touch device stays on the portrait mobile grid regardless of viewport size.
    const mq = window.matchMedia(`(min-width: ${BP_DESKTOP}px) and (hover: hover) and (pointer: fine)`);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}
