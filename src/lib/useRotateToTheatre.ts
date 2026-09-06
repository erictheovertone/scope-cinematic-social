'use client';

import { useEffect, useRef } from 'react';
import { isVideoDebug } from '@/lib/debugFlags';

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
  name = 'unknown',
}: {
  enabled?: boolean;
  isOpen: boolean;
  blocked?: boolean;
  onEnter: () => void;
  /** Brief M7c §1 — consumer label for the ?debug=video [rotate] lifecycle trace. */
  name?: string;
}): { enteredViaRotation: React.MutableRefObject<boolean> } {
  const armed = useRef(true);
  const enteredViaRotation = useRef(false);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  useEffect(() => {
    // Brief M7c §1 — [rotate] instrumentation (gated by ?debug=video, so it runs in
    // production for the device trace). Logs the mount (consumer + guard inputs), each
    // orientation event received, EVERY guard condition + its value at fire time, and the
    // entry call — so a missed entry is attributable to an exact line, never guessed.
    const rlog = (m: string) => { if (isVideoDebug()) console.log(`[rotate] ${name} ${m}`); };
    rlog(`hook effect run — enabled=${enabled} isOpen=${isOpen} blocked=${blocked}`);
    if (!enabled) { rlog('NOT MOUNTED (enabled=false) → no listener'); return; }
    // Brief M7c §3 — READ ORIENTATION AFTER LAYOUT SETTLES, from the freshest source.
    // The M7c harness proved that under a full-screen fixed-PORTAL consumer (the feed
    // lightbox / PostModal), the FIRST orientationchange fires while both matchMedia(
    // '(orientation: landscape)') AND innerWidth/Height are STILL STALE (portrait) — so the
    // synchronous read took the "re-arm in portrait" branch and missed the flip. Chrome
    // happens to deliver a SECOND, fresh event that rescues it; iOS Safari under the portal
    // delivers only the one stale event → theatre never enters (the M7/M7a/M7b symptom).
    // Fix: never decide synchronously — on any orientation signal, re-evaluate on the next
    // animation frame (layout settled) reading screen.orientation (fresh at event time)
    // first, matchMedia as fallback; and re-check once more after a short settle for the
    // single-stale-event (iOS-portal) case. Triggers stay orientation-ONLY (no `resize`, so
    // a desktop window resize still can't mis-fire — the M7a guarantee).
    const landscapeMq = window.matchMedia('(orientation: landscape)');
    const readLandscape = () => {
      const so = (typeof screen !== 'undefined' ? (screen as Screen & { orientation?: { type?: string } }).orientation : undefined);
      if (so && typeof so.type === 'string') return /landscape/.test(so.type); // fresh on iOS 16.4+/Chrome
      return landscapeMq.matches;
    };
    let retry: number | null = null;
    const evaluate = (via: string): boolean => {
      const landscape = readLandscape();
      const suite = !!document.documentElement.dataset.suiteOpen;
      rlog(`evaluate(${via}) landscape=${landscape} armed=${armed.current} isOpen=${isOpen} blocked=${blocked} suiteOpen=${suite} innerWH=${window.innerWidth}x${window.innerHeight}`);
      if (!landscape) { armed.current = true; return false; }          // re-arm in portrait
      if (!armed.current || isOpen || blocked || suite) return false;  // already open / sheet up
      armed.current = false;                 // no re-trigger (esp. exiting theatre while still landscape)
      enteredViaRotation.current = true;     // this session exits when the device returns to portrait
      rlog('→ ENTER fired (onEnter)');
      onEnterRef.current();
      return true;
    };
    const onSignal = (ev: Event) => {
      rlog(`signal=${ev.type}`);
      requestAnimationFrame(() => {
        const entered = evaluate('raf');
        // Single-stale-event (iOS portal) insurance: if the settled frame still read portrait
        // and nothing fired, re-check once after the orientation fully settles.
        if (!entered && retry == null) retry = window.setTimeout(() => { retry = null; evaluate('retry'); }, 280);
      });
    };
    landscapeMq.addEventListener('change', onSignal);
    window.addEventListener('orientationchange', onSignal);
    const so = (typeof screen !== 'undefined' ? (screen as Screen & { orientation?: { addEventListener?: typeof window.addEventListener; removeEventListener?: typeof window.removeEventListener } }).orientation : undefined);
    so?.addEventListener?.('change', onSignal); // Screen Orientation API — fires with fresh state
    rlog(`listener attached — armed=${armed.current} landscapeNow=${readLandscape()}`);
    return () => {
      rlog('listener removed (cleanup)');
      if (retry != null) clearTimeout(retry);
      landscapeMq.removeEventListener('change', onSignal);
      window.removeEventListener('orientationchange', onSignal);
      so?.removeEventListener?.('change', onSignal);
    };
  }, [enabled, isOpen, blocked, name]);

  return { enteredViaRotation };
}
