'use client';
// ── DESKTOP BADGES SHEET — "Badges on Scope" as a centered desktop modal ─────
// Replaces the mobile bottom-sheet on desktop (whose full-screen scrim +
// off-screen translateY read as a page black-out — the reported "crash").
// All badge types, HELD vs LOCKED via the badgeHoldings truth, the app's
// modal language + red brackets.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BADGES, RARITY_ORDER, type BadgeKey } from '@/lib/economy/badges';
import { badgeState, BADGE_EARN_PATH, BADGE_NATURE, type BadgeFlags } from '@/lib/economy/badgeModel';
import { BADGE_BLURBS } from '@/lib/economy/badges';
import { useUpsell } from '@/components/UpsellProvider';
import RedBrackets from '@/components/desktop/RedBrackets';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(255,255,255,0.12)';

export default function DesktopBadgesSheet({
  flags, isOwn, onClose,
}: {
  /** The viewed profile's tier flags — the shared model resolves state. */
  flags: BadgeFlags;
  /** Own profile → the PRO buy CTA links to the upsell (self-serve). */
  isOwn: boolean;
  onClose: () => void;
}) {
  const { showUpsell } = useUpsell();
  // ALL DESCRIPTORS ALWAYS OPEN: a locked badge is an invitation, not a wall —
  // this list renders every descriptor unconditionally (no tap gate to swallow).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  // FREE always shown (base membership); the six earnable tiers after.
  const order: BadgeKey[] = ['free', ...RARITY_ORDER];

  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 660, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />
      <div style={{ position: 'relative', width: 720, maxHeight: '82vh', overflowY: 'auto', background: '#000', border: '1px solid #1a1a1a', boxSizing: 'border-box', padding: '40px 44px 44px' }}>
        <RedBrackets inset={0} />
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ ...SKB, fontSize: 22, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>BADGES ON SCOPE</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', ...SKR, fontSize: 20, color: 'rgba(255,255,255,0.5)', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {order.map((k) => {
          const b = BADGES[k];
          const state = badgeState(k, flags); // 'held' | 'buyable' | 'locked'
          const src = b.bannerSrc ?? b.src;
          const chip = state === 'held' ? { t: 'HELD', c: '#00E08A' } : state === 'buyable' ? { t: 'AVAILABLE', c: '#f20d0d' } : { t: 'LOCKED', c: 'rgba(255,255,255,0.4)' };
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 0', borderBottom: `1px solid ${HAIR}`, opacity: state === 'held' ? 1 : 0.72 }}>
              <span style={{ position: 'relative', width: 48, height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={src} alt={b.title} style={{ width: 44, height: 44, objectFit: 'contain', display: 'block', filter: state === 'held' ? 'none' : 'grayscale(1)', opacity: state === 'held' ? 1 : 0.85 }} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ ...SKB, fontSize: 13, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k === 'top1k' ? 'COLLECTOR' : b.title}</span>
                  <span style={{ ...SKB, fontSize: 9, color: chip.c, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{chip.t}</span>
                </div>
                {/* descriptor — ALWAYS readable */}
                <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: '6px 0 0' }}>{BADGE_BLURBS[k]}</p>
                {/* earn path for LOCKED earned badges (an invitation, per badge) */}
                {state === 'locked' && (
                  <p style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.45, margin: '8px 0 0' }}>{BADGE_EARN_PATH[k]}</p>
                )}
                {/* PRO buy CTA — the highest-intent upsell moment (own profile) */}
                {state === 'buyable' && isOwn && (
                  <button onClick={() => { onClose(); showUpsell('posts'); }} style={{ ...SKB, fontSize: 11, color: '#f20d0d', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 0 0' }}>
                    GET PRO →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
