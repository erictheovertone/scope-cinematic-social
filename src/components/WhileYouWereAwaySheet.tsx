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

function timeGreeting(h: number): string {
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Up late';
}

// ── Inline Tabler-outline icons (no raster assets) ───────────────────────────
const ICON = (d: React.ReactNode, size = 14, color = 'rgba(255,255,255,0.8)'): React.ReactNode => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const UserPlus = ICON(<><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h3" /><path d="M16 19h6" /><path d="M19 16v6" /></>);
const MessageCircle = ICON(<path d="M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1" />);
const Heart = ICON(<path d="M19.5 12.6l-7.5 7.4l-7.5 -7.4a5 5 0 1 1 7.5 -6.6a5 5 0 1 1 7.5 6.6" />);
const TrendingUp = (s = 11) => ICON(<><path d="M3 17l6 -6l4 4l8 -8" /><path d="M14 7l7 0l0 7" /></>, s, GREEN);
const Chevron = ICON(<path d="M9 6l6 6l-6 6" />, 14, 'rgba(255,255,255,0.4)');

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

  // Greeting entrance (fade + translateY), ~60ms after open.
  const [greetIn, setGreetIn] = useState(false);
  useEffect(() => {
    if (!visible) { setGreetIn(reduced.current); return; }
    if (reduced.current) { setGreetIn(true); return; }
    setGreetIn(false);
    const id = setTimeout(() => setGreetIn(true), 60);
    return () => clearTimeout(id);
  }, [visible]);

  const e = useCountProgress(visible, reduced.current);

  if (!mounted || !recap) return null;

  const greeting = `${timeGreeting(new Date().getHours())}, ${(username || 'there').toUpperCase()}`;
  const hero = recap.hero;
  const s = recap.social;

  const stat = (icon: React.ReactNode, n: number, label: string) => (
    <div style={{ flex: 1, position: 'relative', padding: '14px 12px 12px', minWidth: 0 }}>
      <div style={{ position: 'absolute', top: 10, left: 10 }}>{icon}</div>
      <p style={{ ...SKB, fontSize: 28, color: '#fff', margin: '14px 0 0', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>+{Math.round(n * e)}</p>
      <p style={{ ...SKB, fontSize: 'var(--fs-8)', color: W65, margin: '6px 0 0', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
        {label} {TrendingUp(10)}
      </p>
    </div>
  );

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        data-swipe-exclude
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 600, opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.3s ease' }}
      />
      {/* Sheet */}
      <div
        data-swipe-exclude
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: '30rem',
          background: '#000', zIndex: 601, borderTop: '0.5px solid #1f1f1f',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.4s cubic-bezier(0.32,0.72,0,1)',
          padding: '20px 18px calc(18px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        {/* GREETING */}
        <p style={{
          ...SKB, fontSize: 17, color: '#fff', margin: '0 0 14px',
          opacity: greetIn ? 1 : 0,
          transform: greetIn ? 'translateY(0)' : 'translateY(10px)',
          transition: reduced.current ? 'none' : 'opacity 0.45s ease, transform 0.45s ease',
        }}>{greeting}</p>

        {/* SECTION ROW */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: W65, textTransform: 'uppercase', letterSpacing: '0.14em' }}>WHILE YOU WERE AWAY</span>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#fff', background: RED, padding: '3px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{recap.sinceDays} DAYS</span>
        </div>

        {/* HERO CARD */}
        <div style={{ background: 'linear-gradient(180deg, #181818 0%, #0d0d0d 100%)', border: '0.5px solid #1f1f1f', padding: '18px 16px 20px', marginBottom: 20 }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: W65, margin: 0, textTransform: 'uppercase', letterSpacing: '0.12em' }}>YOUR WORK EARNED</p>
          <p style={{ ...SKB, fontSize: 46, color: '#fff', margin: '6px 0 2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(hero.earned * e)}</p>
          <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: W65, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>across {hero.postCount} of your posts</p>
        </div>

        {/* BREAKDOWN HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="9" height="11" viewBox="0 0 9 11" fill={RED}><path d="M0 0v11l9 -5.5z" /></svg>
            BREAKDOWN
          </span>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: W65, textTransform: 'uppercase', letterSpacing: '0.06em' }}>VIEW ALL ›</span>
        </div>

        {/* PER-POST ROWS */}
        <div style={{ marginBottom: 20 }}>
          {recap.breakdown.map((row) => (
            <button
              key={row.postId}
              onClick={() => { onClose(); openPostLightbox(row.postId); }}
              className="tap-target"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', background: 'transparent', border: 'none', borderBottom: '0.5px solid #141414', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ width: 44, height: 44, flexShrink: 0, background: '#0d0d0d', overflow: 'hidden' }}>
                {row.thumbnailUrl && <img src={row.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: RED, margin: 0, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>[ {row.ticker ?? '—'} ]</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: W65, margin: '3px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>collected {row.collectCount} {row.collectCount === 1 ? 'time' : 'times'}</p>
              </div>
              <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: GREEN, fontVariantNumeric: 'tabular-nums' }}>{fmtRowProceeds(row.proceeds, e)}</span>
              <span style={{ display: 'flex' }}>{Chevron}</span>
            </button>
          ))}
        </div>

        {/* STAT STRIP */}
        <div style={{ display: 'flex', gap: 1, background: '#141414', marginBottom: 20 }}>
          <div style={{ flex: 1, background: '#0a0a0a', display: 'flex' }}>{stat(UserPlus, s.follows, 'NEW FOLLOWS')}</div>
          <div style={{ flex: 1, background: '#0a0a0a', display: 'flex' }}>{stat(MessageCircle, s.comments, 'NEW COMMENTS')}</div>
          <div style={{ flex: 1, background: '#0a0a0a', display: 'flex' }}>{stat(Heart, s.likes, 'NEW LIKES')}</div>
        </div>

        {/* ENTER */}
        <button
          onClick={onClose}
          className="tap-target"
          style={{ width: '100%', background: RED, border: 'none', cursor: 'pointer', padding: '15px 0' }}
        >
          <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.14em' }}>ENTER</span>
        </button>

        {/* FOOTER */}
        <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.35)', textAlign: 'center', margin: '12px 0 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          SHOW ON RETURN · TURN OFF IN SETTINGS
        </p>
      </div>
    </>,
    document.body,
  );
}
