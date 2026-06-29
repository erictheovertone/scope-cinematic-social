'use client';

// ── SlideShell — slide the destination surface in on a swipe-committed nav ────
//
// At REST this is `display: contents` — zero box, zero layout/containing-block
// effect, so the app's many position:fixed scrollers behave exactly as before.
// When a swipe set a pending direction, the next route render turns this into a
// `position:fixed; inset:0` layer with a translateX keyframe, so the incoming
// surface (and its fixed chrome) slides in as one unit, then reverts to contents.
// Footer taps set no direction → instant (no slide). Reduced-motion → instant.

import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { consumePendingSlide, type SlideDir } from '@/lib/swipeNav';

export default function SlideShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [prev, setPrev] = useState(pathname);
  const slideRef = useRef<SlideDir | null>(null);

  // Adjust on pathname change (the sanctioned "derive state from a changing value"
  // pattern): consume the pending direction DURING this render so the slide class is
  // applied on the destination's first paint — no one-frame flash at x:0.
  if (pathname !== prev) {
    setPrev(pathname);
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    slideRef.current = reduce ? null : consumePendingSlide();
  }

  // force re-render to drop the slide class once the animation finishes
  const [, force] = useState(0);
  const cls = slideRef.current
    ? `slide-shell slide-sliding slide-${slideRef.current}`
    : 'slide-shell';

  return (
    <div
      className={cls}
      onAnimationEnd={() => {
        if (slideRef.current) { slideRef.current = null; force((n) => n + 1); }
      }}
    >
      {children}
    </div>
  );
}
