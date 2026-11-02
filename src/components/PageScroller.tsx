'use client';
// ── PageScroller — THE page scroll container (scroll-trap rule, Brief M22) ─────
// html/body are LOCKED (position:fixed, overflow:hidden, 100dvh, touch-action:none — the PWA
// viewport work), so a page whose root is a plain min-height / fixed-px block can't scroll: its
// content is clipped below the fold. Every page with content that can outgrow the viewport
// renders inside ONE PageScroller (the M17 library pattern, now shared):
//   • position:fixed inset:0 + overflow-y:auto — measured against the viewport, so it always
//     has a height ceiling and actually scrolls;
//   • overscroll contained (no chain into the locked body), touch-action pan-y (opts back in
//     under body's touch-action:none);
//   • data-swipe-exclude so the horizontal SwipeNav ignores vertical scrolling;
//   • --safe-bottom padding INSIDE, so the last row clears the home indicator;
//   • wired to useScrollChrome (M19): the pill hides on scroll down, returns on up.
// The permanent check is the scroll-trap sweep in test/smooth-gate.mjs (npm run perf:smooth).
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useScrollChrome } from '@/lib/useScrollChrome';

type Props = {
  children: React.ReactNode;
  /** Inner column width (the content wrapper); omit for full width. */
  maxWidth?: number | string;
  className?: string;
  style?: React.CSSProperties;
  /** Hide/return the footer pill with scroll direction (default on). */
  chrome?: boolean;
  /** LT-2 §1 — pad the content top by --safe-top so a page's FIRST element (a header bar / back row)
      clears the notch. Opt-in: a page whose own top chrome already pads --safe-top leaves this off.
      This is the shared fix for the top-inset class (the mirror of the built-in --safe-bottom pad). */
  safeTop?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'style' | 'className' | 'children'>;

const PageScroller = forwardRef<HTMLDivElement, Props>(function PageScroller(
  { children, maxWidth, className = 'bg-canvas', style, chrome = true, safeTop = false, ...rest }, ref,
) {
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => el.current as HTMLDivElement);
  useScrollChrome([el], chrome);
  return (
    <div
      ref={el}
      className={className}
      data-swipe-exclude
      data-page-scroller
      {...rest}
      style={{
        position: 'fixed', inset: 0, overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y',
        color: 'var(--ink-100)', ...style,
      }}
    >
      <div style={{ maxWidth, margin: maxWidth ? '0 auto' : undefined, paddingTop: safeTop ? 'var(--safe-top)' : undefined, paddingBottom: 'var(--safe-bottom)' }}>
        {children}
      </div>
    </div>
  );
});

export default PageScroller;
