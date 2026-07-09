'use client';
// ── DESKTOP BADGES SHEET — "Badges on Scope" as a centered desktop modal ─────
// Replaces the mobile bottom-sheet on desktop (whose full-screen scrim +
// off-screen translateY read as a page black-out — the reported "crash").
// All badge types, HELD vs LOCKED via the badgeHoldings truth, the app's
// modal language + red brackets.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BADGES, RARITY_ORDER, BADGE_BLURBS, type BadgeKey } from '@/lib/economy/badges';
import RedBrackets from '@/components/desktop/RedBrackets';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(255,255,255,0.12)';

export default function DesktopBadgesSheet({
  heldKeys, onClose,
}: {
  /** Keys the viewed profile currently HOLDS (the badgeHoldings truth). */
  heldKeys: Set<BadgeKey>;
  onClose: () => void;
}) {
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
          const held = k === 'free' ? true : heldKeys.has(k); // every account holds FREE TIER (base membership)
          const src = b.bannerSrc ?? b.src;
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 0', borderBottom: `1px solid ${HAIR}`, opacity: held ? 1 : 0.5 }}>
              <span style={{ position: 'relative', width: 48, height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={src} alt={b.title} style={{ width: 44, height: 44, objectFit: 'contain', display: 'block', filter: held ? 'none' : 'grayscale(1)' }} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ ...SKB, fontSize: 13, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k === 'top1k' ? 'COLLECTOR' : b.title}</span>
                  <span style={{ ...SKB, fontSize: 9, color: held ? '#00E08A' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{held ? 'HELD' : 'LOCKED'}</span>
                </div>
                <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: '6px 0 0' }}>{BADGE_BLURBS[k]}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
