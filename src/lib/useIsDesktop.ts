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
    const mq = window.matchMedia(`(min-width: ${BP_DESKTOP}px)`);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}
