'use client';

// ── PressPop — tactile "pop" scale on press ──────────────────────────────────
//
// Wraps a SINGLE interactive child (button / Link / [role=button]) and plays a
// scale keyframe on press DOWN — immediate on touch, retriggers on rapid taps.
// asChild-style: clones the child (no extra DOM), MERGES className, and CHAINS
// any existing onPointerDown/onAnimationEnd, so it never swallows clicks, nav,
// scroll, or optimistic handlers — it's a pure visual transform decorator.
//
// Levels (see globals.css @keyframes pressPop*):
//   subtle → 0.92 dip, no overshoot, 200ms ease-out
//   mid    → 0.89 → 1.03 overshoot → 1.0, 250ms
//   punchy → 0.82 → 1.10 → 0.97 → 1.0, 320ms (DEFAULT — the icon-press feel)
//
// Fires on press DOWN (pointerdown, + touchstart fallback) so it pops the instant the
// finger lands. transform-only (GPU). prefers-reduced-motion is honored by the global
// Stage 4.1 net (collapses animations to instant). Integrates with the global :active
// press (.press-pop owns the scale so the two don't stack).

import React from 'react';

export type PopLevel = 'subtle' | 'mid' | 'punchy';

// Restart the keyframe even on a rapid repeat tap: drop the class, force a reflow,
// re-add it. Reading offsetWidth flushes layout so the browser sees a real restart.
// Dedupe pointerdown + touchstart firing for the same press (within one frame) via a
// timestamp stamped on the element — touch fires both, we only want one pop.
function retrigger(el: HTMLElement, ts: number) {
  const last = (el as HTMLElement & { __popTs?: number }).__popTs ?? -1;
  if (ts - last < 80) return;
  (el as HTMLElement & { __popTs?: number }).__popTs = ts;
  el.classList.remove('pop-active');
  void el.offsetWidth; // eslint-disable-line @typescript-eslint/no-unused-expressions
  el.classList.add('pop-active');
}

export default function PressPop({
  level = 'punchy',
  children,
}: {
  level?: PopLevel;
  children: React.ReactElement;
}) {
  const child = React.Children.only(children);
  const props = child.props as {
    className?: string;
    onPointerDown?: (e: React.PointerEvent) => void;
    onTouchStart?: (e: React.TouchEvent) => void;
    onAnimationEnd?: (e: React.AnimationEvent) => void;
  };

  return React.cloneElement(child, {
    className: [props.className, 'press-pop', `pop-${level}`].filter(Boolean).join(' '),
    onPointerDown: (e: React.PointerEvent) => {
      retrigger(e.currentTarget as HTMLElement, e.timeStamp);
      props.onPointerDown?.(e);
    },
    // Fallback for any touch surface that doesn't deliver pointer events; deduped
    // against the pointerdown above so a normal touch only pops once.
    onTouchStart: (e: React.TouchEvent) => {
      retrigger(e.currentTarget as HTMLElement, e.timeStamp);
      props.onTouchStart?.(e);
    },
    onAnimationEnd: (e: React.AnimationEvent) => {
      // Only clear on OUR keyframe — other animations on the element are left alone.
      if (e.animationName.startsWith('pressPop')) {
        (e.currentTarget as HTMLElement).classList.remove('pop-active');
      }
      props.onAnimationEnd?.(e);
    },
  } as Partial<typeof props>);
}
