'use client';

// ── WHILE YOU WERE AWAY — the recap bottom sheet (Stage 2 UI) ─────────────────
//
// Portaled to document.body (the ProfileDataSheet pattern). Consumes the verified
// /api/recap shape. Earnings hero + per-post breakdown + social strip, all real.
// Greeting fades in first; every number counts up 0→value together (easeOutExpo,
// ~700ms). Read-only — row taps open the post via the global lightbox event.
// Brand: black, red #FF0000, money-green #4ade80, SK-Modernist, sharp corners.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Recap } from '@/lib/economy/recap';
import { openPostLightbox } from '@/lib/postLightbox';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const RED = '#FF0000';
const GREEN = '#4ade80';
const W65 = 'rgba(255,255,255,0.65)';

const fmtMoney = (n: number) => `+$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

// Per-row proceeds: sub-cent reads "< $0.01" (no tick — it's a string, not a number);
// ≥ $0.01 ticks up to "+$X.XX". `final` is the real value, `e` the count-up easing.
const fmtRowProceeds = (final: number, e: number): string => {
  if (final > 0 && final < 0.01) return '< $0.01';
  return `+$${(final * e).toFixed(2)}`;
};


// ── Inline Tabler-outline icons (no raster assets) ───────────────────────────
const ICON = (d: React.ReactNode, size = 16, color = 'rgba(255,255,255,0.8)'): React.ReactNode => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const UserPlus = ICON(<><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h3" /><path d="M16 19h6" /><path d="M19 16v6" /></>);
const MessageCircle = ICON(<path d="M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1" />);
const Heart = ICON(<path d="M19.5 12.6l-7.5 7.4l-7.5 -7.4a5 5 0 1 1 7.5 -6.6a5 5 0 1 1 7.5 6.6" />);
const TrendingUp = (s = 13) => ICON(<><path d="M3 17l6 -6l4 4l8 -8" /><path d="M14 7l7 0l0 7" /></>, s, GREEN);
const Chevron = ICON(<path d="M9 6l6 6l-6 6" />, 16, 'rgba(255,255,255,0.4)');

// Synchronized count-up easing (0→1). Starts ~150ms after open, ~700ms easeOutExpo,
// snaps to 1. Reduced-motion → instant 1. Runs once per show (keyed on `open`).
function useCountProgress(open: boolean, reduced: boolean): number {
  const [e, setE] = useState(0);
  useEffect(() => {
    if (!open) { setE(0); return; }
    if (reduced) { setE(1); return; }
    setE(0);
    const DUR = 700, DELAY = 150;
    const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0 - DELAY) / DUR));
      setE(ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, reduced]);
  return e;
}

interface Props {
  visible: boolean;
  recap: Recap | null;
  username: string;
  onClose: () => void;
}

export default function WhileYouWereAwaySheet({ visible, recap, username, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const reduced = useRef(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }, []);

  const e = useCountProgress(visible, reduced.current);

  // ── Swipe-DOWN to dismiss ──────────────────────────────────────────────────
  // Drag the full-page takeover down with the finger; past a threshold (or a fast
  // downward flick) → onClose. Gated like swipe-nav: it engages ONLY when the content
  // is scrolled to the top AND the first movement is downward — otherwise the gesture
  // is released to the inner scroll (direction-locked per gesture, no mid-swipe switch).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragYRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let startY = 0, lastY = 0, lastT = 0, vy = 0, active = false;
    let lock: 'none' | 'dismiss' | 'scroll' = 'none';
    const set = (y: number) => { dragYRef.current = y; setDragY(y); };

    const onStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) { active = false; return; }
      startY = ev.touches[0].clientY; lastY = startY; lastT = ev.timeStamp; vy = 0; lock = 'none'; active = true;
    };
    const onMove = (ev: TouchEvent) => {
      if (!active) return;
      const y = ev.touches[0].clientY; const dy = y - startY;
      if (lock === 'none') {
        if (el.scrollTop <= 0 && dy > 8) lock = 'dismiss';   // at top + downward → dismiss
        else if (Math.abs(dy) > 8) { lock = 'scroll'; return; } // else release to content scroll
        else return;
      }
      if (lock === 'dismiss') {
        ev.preventDefault();                                  // suppress native overscroll/rubber-band
        vy = (y - lastY) / Math.max(1, ev.timeStamp - lastT); lastY = y; lastT = ev.timeStamp;
        setDragging(true);
        set(Math.max(0, dy));
      }
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      if (lock === 'dismiss') {
        const dismissed = dragYRef.current > window.innerHeight * 0.27 || vy > 0.5; // threshold OR flick
        setDragging(false);
        if (dismissed) onCloseRef.current();
        set(0);                                               // spring back (or reset for the slide-out)
      }
      lock = 'none';
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [recap]);

  if (!mounted || !recap) return null;

  const hero = recap.hero;
  const s = recap.social;

  const stat = (icon: React.ReactNode, n: number, label: string) => (
    // Icon TOP-LEFT (unchanged); number + label + trend mark CENTER-aligned in the column.
    <div style={{ flex: 1, position: 'relative', padding: '14px 8px 12px', minWidth: 0, textAlign: 'center' }}>
      <div style={{ position: 'absolute', top: 10, left: 8 }}>{icon}</div>
      <p style={{ ...SKB, fontSize: 28, color: '#fff', margin: '14px 0 0', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>+{Math.round(n * e)}</p>
      {/* −0.5px (fs-7_5) + nowrap so NEW COMMENTS fits one line alongside the others */}
      <p style={{ ...SKB, fontSize: 'var(--fs-7_5)', color: W65, margin: '6px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        {label} {TrendingUp(11)}
      </p>
    </div>
  );

  return createPortal(
    // FULL-PAGE takeover — fixed edge-to-edge, black, slides up on open. The whole page
    // translates with the dismiss drag (transform on the container); the inner div scrolls.
    <div
      data-swipe-exclude
      style={{
        position: 'fixed', inset: 0, zIndex: 600, background: '#000', overflow: 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
        transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)',
        transition: dragging ? 'none' : 'transform 0.36s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      <div
        ref={scrollRef}
        style={{
          position: 'absolute', inset: 0, overflowY: 'auto',
          WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',
          boxSizing: 'border-box',
          // Flex column so content fills the full page top→bottom (spacer pushes ENTER/footer
          // to the bottom; sections get Figma breathing room) — no crowding, no dead gap.
          display: 'flex', flexDirection: 'column',
          // Safe-area insets on every edge — content never hides under status bar / home indicator.
          padding: 'calc(env(safe-area-inset-top, 0px) + 24px) calc(env(safe-area-inset-right, 0px) + 14px) calc(env(safe-area-inset-bottom, 0px) + 24px) calc(env(safe-area-inset-left, 0px) + 14px)',
        }}
      >
        {/* SECTION ROW — top element now (greeting removed) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26, flexShrink: 0 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: W65, textTransform: 'uppercase', letterSpacing: '0.14em' }}>WHILE YOU WERE AWAY</span>
          {/* N DAYS pill — dark gradient + dark-red border, RED text (Figma 793:323), radius 2 */}
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: RED, background: 'linear-gradient(93.77deg, #181818 24.12%, #000 64.5%)', border: '0.5px solid #7a2e2e', borderRadius: 2, padding: '3px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{recap.sinceDays} DAYS</span>
        </div>

        {/* HERO / EARNED CARD — baked PNG background (fills + scales), radius 2, h 127,
            elements absolutely placed per Figma 787:248. */}
        <div style={{ position: 'relative', overflow: 'hidden', border: '0.5px solid #1f1f1f', borderRadius: 2, height: 127, boxSizing: 'border-box', marginBottom: 28, flexShrink: 0 }}>
          {/* PNG background — behind all content, stretches to fill the card edge-to-edge */}
          <img src="/your-work-earned-rect.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 0, pointerEvents: 'none' }} />
          {/* Holo logo top-right (~19px from top, ~124×81) */}
          <img src="/opaque-scope-logo-holo.png" alt="" style={{ position: 'absolute', top: 19, right: 12, width: 124, height: 'auto', zIndex: 2, pointerEvents: 'none' }} />
          <p style={{ position: 'absolute', top: 21, left: 12, zIndex: 1, ...SKB, fontSize: 'var(--fs-9)', color: W65, margin: 0, textTransform: 'uppercase', letterSpacing: '0.12em' }}>YOUR WORK EARNED</p>
          <p style={{ position: 'absolute', top: 39, left: 16, zIndex: 1, ...SKB, fontSize: 48, color: '#fff', margin: 0, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(hero.earned * e)}</p>
          {/* across — indented (~86px from left), just below the number */}
          <p style={{ position: 'absolute', top: 98, left: 86, zIndex: 1, ...SKR, fontSize: 'var(--fs-7)', color: W65, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>across {hero.postCount} of your posts</p>
        </div>

        {/* BREAKDOWN HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="11" height="13" viewBox="0 0 9 11" fill={RED}><path d="M0 0v11l9 -5.5z" /></svg>
            BREAKDOWN
          </span>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: W65, textTransform: 'uppercase', letterSpacing: '0.06em' }}>VIEW ALL ›</span>
        </div>

        {/* PER-POST ROWS — pitch ~74px (48px thumb + ~26px gap) per Figma */}
        <div style={{ marginBottom: 28, flexShrink: 0 }}>
          {recap.breakdown.map((row) => (
            <button
              key={row.postId}
              onClick={() => { onClose(); openPostLightbox(row.postId); }}
              className="tap-target"
              style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 0', background: 'transparent', border: 'none', borderBottom: '0.5px solid #141414', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ width: 133, height: 48, flexShrink: 0, background: '#0d0d0d', overflow: 'hidden' }}>
                {row.thumbnailUrl && <img src={row.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: RED, margin: 0, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>[ {row.ticker ?? '—'} ]</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: W65, margin: '3px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>collected {row.collectCount} {row.collectCount === 1 ? 'time' : 'times'}</p>
              </div>
              {/* aligned with the "collected" line (upper area), not the ticker line */}
              <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: GREEN, fontVariantNumeric: 'tabular-nums', marginTop: 16 }}>{fmtRowProceeds(row.proceeds, e)}</span>
              <span style={{ display: 'flex', marginTop: 15 }}>{Chevron}</span>
            </button>
          ))}
        </div>

        {/* STAT STRIP (audience) — baked PNG background (fills + scales), radius 2, h 98,
            3 equal columns above it. */}
        <div style={{ position: 'relative', overflow: 'hidden', height: 98, flexShrink: 0, border: '0.5px solid #1f1f1f', borderRadius: 2 }}>
          <img src="/audience-growth-rect.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 0, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'stretch', height: '100%' }}>
            <div style={{ flex: 1, display: 'flex' }}>{stat(UserPlus, s.follows, 'NEW FOLLOWS')}</div>
            <div style={{ flex: 1, display: 'flex' }}>{stat(MessageCircle, s.comments, 'NEW COMMENTS')}</div>
            <div style={{ flex: 1, display: 'flex' }}>{stat(Heart, s.likes, 'NEW LIKES')}</div>
          </div>
        </div>

        {/* SPACER — absorbs extra height so ENTER + footer sit at the BOTTOM (fills the page;
            collapses to 0 when content overflows and the page scrolls). */}
        <div style={{ flex: '1 1 24px', minHeight: 24 }} />

        {/* ENTER — red→dark-red gradient (DELIBERATE), 0.25px white border, radius 2, ~44px (tap floor) */}
        <button
          onClick={onClose}
          className="tap-target"
          style={{ width: '100%', flexShrink: 0, background: 'linear-gradient(to right, #FF0000 0%, #990000 100%)', border: '0.25px solid #FFFFFF', borderRadius: 2, cursor: 'pointer', padding: '13px 0' }}
        >
          <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.14em' }}>ENTER</span>
        </button>

        {/* FOOTER */}
        <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.35)', textAlign: 'center', margin: '12px 0 0', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          SHOW ON RETURN · TURN OFF IN SETTINGS
        </p>
      </div>
    </div>,
    document.body,
  );
}
