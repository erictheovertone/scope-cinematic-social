'use client';

import { useEffect, useRef } from 'react';

// useRotateToTheatre — rotating a phone to LANDSCAPE enters theatre. Extracted from
// ProfilePostViewer (Brief M3a) so the Screening Room post view shares the EXACT proven
// mechanism instead of a second copy.
//
// Orientation-driven: it reads `innerWidth > innerHeight` on orientationchange/resize —
// NOT a width breakpoint — so the pointer-gated desktop seam (useIsDesktop) is unaffected:
// a landscape phone stays mobile and still enters theatre. Callers on a globally-mounted
// host must still pass `enabled: !isDesktop` so a desktop window RESIZE can't mis-fire.
//
// Guards (byte-identical to the profile original): an `armed` flag re-arms ONLY in portrait
// (theatre force-rotates in portrait and, for rotation-entered sessions, exits on the
// return to portrait — so re-arming there prevents a re-trigger loop); never fires while
// theatre is already open (`isOpen`), while `blocked` (a caller sheet), or while a
// sheet/takeover marks `data-suiteOpen`. It's a MODE change, not an animation →
// prefers-reduced-motion is intentionally unaffected.
//
// Returns `enteredViaRotation` — true when THIS entry came from a physical rotate (vs a
// tap). Callers feed it to TheatreMode's `exitOnPortrait` (symmetric gesture) and to any
// origin-restore effect. Tap entries should set it false before opening.
export function useRotateToTheatre({
  enabled = true,
  isOpen,
  blocked = false,
  onEnter,
}: {
  enabled?: boolean;
  isOpen: boolean;
  blocked?: boolean;
  onEnter: () => void;
}): { enteredViaRotation: React.MutableRefObject<boolean> } {
  const armed = useRef(true);
  const enteredViaRotation = useRef(false);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  useEffect(() => {
    if (!enabled) return;
    const onOrient = () => {
      const landscape = window.innerWidth > window.innerHeight;
      if (!landscape) { armed.current = true; return; } // re-arm in portrait
      if (!armed.current || isOpen) return;
      if (blocked || document.documentElement.dataset.suiteOpen) return; // sheet/takeover up
      armed.current = false; // no re-trigger (esp. exiting theatre while still landscape)
      enteredViaRotation.current = true; // this session exits when the device returns to portrait
      onEnterRef.current();
    };
    window.addEventListener('resize', onOrient);
    window.addEventListener('orientationchange', onOrient);
    return () => { window.removeEventListener('resize', onOrient); window.removeEventListener('orientationchange', onOrient); };
  }, [enabled, isOpen, blocked]);

  return { enteredViaRotation };
}
