// ── src/lib/useScrollChrome.ts — mobile chrome hides on scroll down, returns on up ──
// Brief M19. A page passes its REAL scroller(s); the hook reads direction with
// hysteresis and stamps <html data-chrome-hidden>. CSS (globals.css, M19) slides the
// footer pill down and every [data-chrome-top] layer up — so one attribute drives
// every pill instance + top layer and React never re-renders on scroll.
//
// Listener is CAPTURE-phase on `document` (scroll doesn't bubble) filtered to the
// given refs: no mount race when the scroller renders after a loading state.
"use client";

import { useEffect, useState, type RefObject } from "react";

const FLIP_PX = 10;   // accumulate this much in one direction before flipping
const TOP_PX = 64;    // always visible this close to the top

/** The top-layer transition, for elements that already carry an inline `transition`
 *  (an inline list overrides the stylesheet's, so they append this). */
export const CHROME_TOP_TRANSITION = "translate 240ms cubic-bezier(0.2, 0.8, 0.2, 1)";

export function useScrollChrome(scrollers: RefObject<HTMLElement | null>[], enabled = true): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    let cur = false, acc = 0, last = 0, raf = 0;
    let lastEl: HTMLElement | null = null;

    const set = (h: boolean) => {
      if (h === cur) return;
      cur = h;
      if (h) root.dataset.chromeHidden = ""; else delete root.dataset.chromeHidden;
      setHidden(h);
    };

    const measure = () => {
      raf = 0;
      const el = lastEl;
      if (!el) return;
      const y = el.scrollTop;
      const max = el.scrollHeight - el.clientHeight;
      if (y < 0 || y > max) return; // iOS rubber-band overscroll: not intent
      const dy = y - last;
      last = y;
      // Forced visible: near the top, or within one viewport of the bottom.
      if (y < TOP_PX || max - y < el.clientHeight) { acc = 0; set(false); return; }
      if (dy === 0) return;
      if (dy > 0 !== acc > 0) acc = 0; // direction changed → start a fresh run
      acc += dy;
      if (acc >= FLIP_PX) set(true);
      else if (acc <= -FLIP_PX) set(false);
    };

    const onScroll = (e: Event) => {
      const el = scrollers.map((r) => r.current).find((s) => s && s === e.target);
      if (!el) return;
      // First sight of a scroller: it started at the top (a fresh mount), so measure from 0
      // — a fling's first event counts. A tab swap re-bases on where that scroller sits.
      if (el !== lastEl) { last = lastEl ? el.scrollTop : 0; lastEl = el; acc = 0; }
      if (!raf) raf = requestAnimationFrame(measure);
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      cancelAnimationFrame(raf);
      delete root.dataset.chromeHidden; // leaving the surface never strands the chrome
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps -- refs are stable

  return hidden;
}
