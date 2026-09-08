'use client';
// ── useDragScroll — Brief D15 §2 ─────────────────────────────────────────────
// Click-drag horizontal scrolling for an overflow-x row, MOUSE pointers only.
// Native scroll + Pointer Events (no library): mousedown→drag moves the strip 1:1
// with the cursor; release with velocity → ease-out momentum; cursor grab/grabbing.
// Guards: a drag past DRAG_THRESHOLD suppresses the click on the thumbnail under the
// cursor (no accidental opens); wheel/trackpad + keyboard scrolling stay native
// (untouched). Reduced-motion → no momentum, direct drag only. Gated to a FINE pointer
// so touch devices keep their native touch scrolling.

import { useEffect } from 'react';

const DRAG_THRESHOLD = 6;        // px of travel before it counts as a drag (suppresses the click)
const MOMENTUM_FRICTION = 0.94;  // per-frame velocity decay
const MIN_VELOCITY = 0.02;       // px/ms — below this momentum stops
const FRAME_MS = 16;

export function useDragScroll(ref: React.RefObject<HTMLElement | null>, opts?: { reduced?: boolean }) {
  const reduced = !!opts?.reduced;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // MOUSE only — touch keeps native scroll (and this whole cue is a pointer affordance).
    if (typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches) return;
    el.style.cursor = 'grab';

    let down = false, moved = false, startX = 0, startLeft = 0;
    let lastX = 0, lastT = 0, vel = 0, raf = 0;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = true; moved = false;
      startX = e.clientX; startLeft = el.scrollLeft;
      lastX = e.clientX; lastT = performance.now(); vel = 0;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      el.style.cursor = 'grabbing';
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > DRAG_THRESHOLD) moved = true;
      el.scrollLeft = startLeft - dx; // 1:1 follow
      const now = performance.now(), dt = now - lastT;
      if (dt > 0) { vel = (e.clientX - lastX) / dt; lastX = e.clientX; lastT = now; }
    };
    const end = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      el.style.cursor = 'grab';
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      // Momentum ease-out (unless reduced-motion).
      if (moved && !reduced && Math.abs(vel) > MIN_VELOCITY) {
        let v = vel;
        const spin = () => {
          v *= MOMENTUM_FRICTION;
          el.scrollLeft -= v * FRAME_MS;
          raf = Math.abs(v) > MIN_VELOCITY ? requestAnimationFrame(spin) : 0;
        };
        raf = requestAnimationFrame(spin);
      }
      // A real drag suppresses the click that would otherwise open the thumbnail under it.
      if (moved) {
        const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        el.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => el.removeEventListener('click', swallow, { capture: true } as EventListenerOptions), 60);
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, reduced]);
}
