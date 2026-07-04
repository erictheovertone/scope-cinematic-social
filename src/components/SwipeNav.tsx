'use client';

// ── SwipeNav — global horizontal-swipe → contextual navigation ───────────────
//
// Listens at the document level (passive — never preventDefault, so it can't fight
// the feed's vertical scroll or its existing horizontal-drift backstop). Direction-
// locks per gesture; commits a navigation only on a dominantly-horizontal swipe past
// a distance/velocity threshold. Carousels / open overlays opt out via
// [data-swipe-exclude]. On commit it sets the slide direction (SlideShell animates
// the destination in) and routes — or, for an action slot, just opens the overlay.

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { neighbor, setPendingSlide } from '@/lib/swipeNav';

const START = 10;        // px before a direction locks
const RATIO = 1.5;       // |dx| must beat |dy| by this to be a page-swipe
const COMMIT_FRAC = 0.33; // commit past 33% of screen width…
const FLICK_VX = 0.5;     // …or a fast flick (px/ms)

export default function SwipeNav() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let x0 = 0, y0 = 0, lastX = 0, lastT = 0, vx = 0;
    let lock: 'none' | 'h' | 'v' | 'excluded' = 'none';
    let active = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { active = false; lock = 'excluded'; return; }
      // SUITE STANDDOWN (global): while an editing session is open
      // (CreatePostFlow sets data-suite-open on <html>), page-swipes are OFF
      // EVERYWHERE — an edit must be un-swipe-away-able from any gesture.
      // Deliberately a document-level gate, not per-element data-swipe-exclude:
      // the membership sheets taught us sprinkled exclusions get missed.
      if (document.documentElement.dataset.suiteOpen) { active = false; lock = 'excluded'; return; }
      const target = e.target as Element | null;
      // CAROUSEL / overlay ALWAYS WINS — a touch starting inside an excluded
      // container never becomes a page-swipe.
      if (target && target.closest('[data-swipe-exclude]')) { active = false; lock = 'excluded'; return; }
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; lastX = x0; lastT = e.timeStamp; vx = 0;
      lock = 'none'; active = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!active || lock === 'excluded' || lock === 'v') return;
      const t = e.touches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (lock === 'none') {
        // Vertical wins the moment it dominates → release the gesture to the scroller.
        if (Math.abs(dy) > START && Math.abs(dy) >= Math.abs(dx)) { lock = 'v'; return; }
        if (Math.abs(dx) > START && Math.abs(dx) > RATIO * Math.abs(dy)) { lock = 'h'; }
      }
      if (lock === 'h') {
        const dt = Math.max(1, e.timeStamp - lastT);
        vx = (t.clientX - lastX) / dt;
        lastX = t.clientX; lastT = e.timeStamp;
      }
    };

    const onEnd = (e: TouchEvent) => {
      const wasHorizontal = active && lock === 'h';
      active = false;
      const prevLock = lock;
      lock = 'none';
      if (!wasHorizontal) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0;
      const committed = Math.abs(dx) > COMMIT_FRAC * window.innerWidth || Math.abs(vx) > FLICK_VX;
      if (!committed || dx === 0 || prevLock !== 'h') return;
      const dir: 'left' | 'right' = dx < 0 ? 'left' : 'right';
      const slot = neighbor(pathname, dir);
      if (!slot) return; // end of sequence → rubber-band (no-op)
      if (slot.type === 'action') { router.push(slot.to); return; } // open modal, no slide
      setPendingSlide(dir);
      router.push(slot.to);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [pathname, router]);

  return null;
}
