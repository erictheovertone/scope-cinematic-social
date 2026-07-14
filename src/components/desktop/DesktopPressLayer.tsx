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
      const el = t.closest('button, a, [role="button"], .tappable') as HTMLElement | null;
      if (!el || el.closest(SKIP)) return;
      // CALIBRATION (feel pass): four tiers, matched to the hover language.
      //   rail  → 0.92 (side toolbar glyphs)
      //   card  → 0.985 (a PHOTO card: <img> in a sizable box — gentle)
      //   icon  → 0.92 (a glyph: svg, or a small img/avatar, or ≤2 chars)
      //   text  → 0.96 (words/buttons)
      const rail = !!el.closest('nav[aria-label="Primary"]');
      const hasImg = !!el.querySelector('img');
      const hasSvg = !!el.querySelector('svg');
      const txt = (el.textContent ?? '').trim();
      const r = el.getBoundingClientRect();
      const big = r.width >= 72 && r.height >= 72;
      const variant = rail ? 'pop-dk-rail'
        : (hasImg && big) ? 'pop-dk-card'
        : (hasSvg || txt.length <= 2 || hasImg) ? 'pop-dk-icon'
        : 'pop-dk-text';
      el.classList.remove('pop-punchy', 'pop-dk-icon', 'pop-dk-text', 'pop-dk-rail', 'pop-dk-card', 'pop-active');
      el.classList.add('press-pop', variant);
      void el.offsetWidth;
      el.classList.add('pop-active');
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return null;
}
