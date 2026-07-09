'use client';
// ── DESKTOP PRESS LAYER — mobile's press-pop, everywhere, by delegation ──────
// ONE mechanism: a document-level pointerdown listener applies the SAME
// classes (.press-pop .pop-punchy .pop-active) that mobile's PressPop applies
// — the globals.css keyframes do the rest, so the pop FEELS identical by
// construction (same 320ms punchy overshoot spring). Mounted only on desktop
// (AppShell's ≥1024 branch). The hover layer is pure CSS (globals, media-
// gated). [data-no-pop] opts an element out (grid cells: media hovers, no
// press scale). Inputs/sliders never pop. Reduced-motion: the global Stage
// 4.1 net collapses the keyframe; the CSS hover brightness remains.

import { useEffect } from 'react';

const SKIP = 'input, textarea, select, [data-no-pop]';

export default function DesktopPressLayer() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      const el = t.closest('button, a, [role="button"]') as HTMLElement | null;
      if (!el || el.closest(SKIP)) return;
      // mobile's retrigger discipline: drop, reflow, re-add (rapid-tap safe)
      el.classList.add('press-pop', 'pop-punchy');
      el.classList.remove('pop-active');
      void el.offsetWidth;
      el.classList.add('pop-active');
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return null;
}
