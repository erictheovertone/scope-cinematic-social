'use client';
// ── DESKTOP BADGES SHEET — "Badges on Scope" as a centered desktop modal ─────
// Replaces the mobile bottom-sheet on desktop (whose full-screen scrim +
// off-screen translateY read as a page black-out — the reported "crash").
// All badge types, HELD vs LOCKED via the badgeHoldings truth, the app's
// modal language + red brackets.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BADGES, RARITY_ORDER, type BadgeKey } from '@/lib/economy/badges';
import { badgeState, type BadgeFlags } from '@/lib/economy/badgeModel';
import { BADGE_BLURBS } from '@/lib/economy/badges';
import { useUpsell } from '@/components/UpsellProvider';
import RedBrackets from '@/components/desktop/RedBrackets';
import { TIER_DETAILS } from '@/app/badge/[tier]/page';

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
  const { goPro } = useUpsell();
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Full-descriptor detail (LEARN MORE →): a second level in the modal.
  const [detailKey, setDetailKey] = useState<BadgeKey | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  // ORDER: the two membership tiers together at top, earned honors below.
  const order: BadgeKey[] = ['free', 'pro', 'augmented', 'firstCut', 'top1k', 'srh', 'inHouse'];
  const DETAIL_KEY: Partial<Record<BadgeKey, string>> = { free: 'free', pro: 'pro', augmented: 'founding', firstCut: 'firstCut', top1k: 'top1k', srh: 'srh', inHouse: 'creator' };

  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 660, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />
      <div style={{ position: 'relative', width: 720, maxHeight: '82vh', overflowY: 'auto', background: '#000', border: '1px solid #1a1a1a', boxSizing: 'border-box', padding: '40px 44px 44px' }}>
        <RedBrackets inset={0} />
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 34, right: 40, background: 'transparent', border: 'none', cursor: 'pointer', ...SKR, fontSize: 20, color: 'rgba(255,255,255,0.5)', lineHeight: 1, padding: 4, zIndex: 2 }}>×</button>
        {/* ── FULL DESCRIPTOR (LEARN MORE → target) — the rich TIER_DETAILS ── */}
        {detailKey && (() => {
          const d = TIER_DETAILS[DETAIL_KEY[detailKey] ?? ''];
          if (!d) return null;
          return (
            <div style={{ padding: '4px 0 8px' }}>
              <button onClick={() => setDetailKey(null)} style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>← BACK</button>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '26px 0 24px' }}>
                <img src={d.img} alt={d.label} style={{ width: d.size, height: d.size, objectFit: 'contain', display: 'block', marginBottom: 16 }} />
                <p style={{ ...SKB, fontSize: 20, color: d.color, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 10px', textAlign: 'center' }}>{d.label}</p>
                <p style={{ ...SKR, fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 1.6, margin: 0, maxWidth: 380 }}>{d.tagline}</p>
              </div>
              <div style={{ height: 1, background: HAIR, margin: '0 0 26px' }} />
              {d.sections.map((sec, i) => (
                <div key={i} style={{ marginBottom: 24 }}>
                  <p style={{ ...SKB, fontSize: 10, color: d.color, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 8px' }}>{sec.title}</p>
                  <p style={{ ...SKR, fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, margin: 0 }}>{sec.body}</p>
                </div>
              ))}
              {/* the descriptor converts too — GET PRO inside the PRO/FREE detail */}
              {(detailKey === 'pro' || detailKey === 'free') && badgeState('pro', flags) !== 'held' && isOwn && (
                <button onClick={() => { onClose(); goPro(); }} style={{ ...SKB, width: '100%', fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#f20d0d', border: 'none', cursor: 'pointer', padding: '13px 0', marginTop: 8 }}>
                  GET PRO →
                </button>
              )}
            </div>
          );
        })()}

        {!detailKey && (<>
        {/* header logo — the bracketed SCOPE wordmark (1196×620) */}
        <img src="/badges-on-scope-logo.png" alt="Badges on Scope" style={{ height: 162, width: 'auto', objectFit: 'contain', display: 'block', margin: '4px 0 26px' }} />

        {order.map((k, ri) => {
          const b = BADGES[k];
          const state = badgeState(k, flags); // 'held' | 'buyable' | 'locked'
          const src = b.bannerSrc ?? b.src;
          const chip = state === 'held' ? { t: 'HELD', c: '#00E08A' } : state === 'buyable' ? { t: 'AVAILABLE', c: '#f20d0d' } : { t: 'LOCKED', c: 'rgba(255,255,255,0.4)' };
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 0', borderBottom: `1px solid ${HAIR}`, opacity: state === 'held' ? 1 : 0.72, animation: reduced ? 'none' : `badgeRippleIn 300ms ease-out ${ri * 45}ms both` }}>
              <span style={{ position: 'relative', width: 48, height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* glow chases the ripple's leading edge (row delay + ~150ms) */}
                <img src={src} alt={b.title} style={{ width: 44, height: 44, objectFit: 'contain', display: 'block', filter: state === 'held' ? 'none' : 'grayscale(1)', opacity: state === 'held' ? 1 : 0.85, animation: reduced ? 'none' : `badgeGlowPulse 400ms ease-out ${ri * 45 + 150}ms both` }} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ ...SKB, fontSize: 13, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k === 'top1k' ? 'COLLECTOR' : b.title}</span>
                  <span style={{ ...SKB, fontSize: 9, color: chip.c, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{chip.t}</span>
                </div>
                {/* descriptor — ALWAYS readable */}
                <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: '6px 0 0' }}>{BADGE_BLURBS[k]}</p>
                {/* two clear paths: LEARN MORE → the full descriptor · GET PRO → membership */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 10 }}>
                  <button onClick={() => setDetailKey(k)} style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                    LEARN MORE →
                  </button>
                  {state === 'buyable' && isOwn && (
                    <button onClick={(e) => { e.stopPropagation(); onClose(); goPro(); }} style={{ ...SKB, fontSize: 11, color: '#f20d0d', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                      GET PRO →
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </>)}
      </div>
    </div>,
    document.body,
  );
}
