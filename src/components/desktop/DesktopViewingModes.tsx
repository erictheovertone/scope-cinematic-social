'use client';

// ── DESKTOP VIEWING MODES (Brief D7 §9) — rebuilt to match the mobile S1/S1a ──
// design: a "Viewing Modes" page-title, the four gradient-bordered mode cards
// (Theatre / Screening Room / Mirage / Feed) reused from the mobile recipe
// (VmodeCard), a logomark top-right that closes, and a 2×2 grid distribution that
// fills the viewport (adapted from the mobile single-column flex fill). Routing is
// unchanged — onSelect still runs the host's onSelectMode; mirage stays "coming"
// on desktop (not yet built there). The rail stays visible (panel offset left).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VmodeCard, { VMODE_CARDS, type VmodeMode } from './VmodeCard';

// Superset kept so the host (DesktopHome.onSelectMode) still routes 'lightbox'
// via its other affordances; this menu itself only surfaces the four mobile modes.
export type ViewingMode = 'theatre' | 'screening' | 'lightbox' | 'mirage' | 'feed';

interface Props {
  currentMode: ViewingMode;
  onClose: () => void;
  /** Runs the host's mode-switch (select + close). */
  onSelect: (mode: ViewingMode) => void;
}

export default function DesktopViewingModes({ currentMode, onClose, onSelect }: Props) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)', opacity: mounted ? 1 : 0, transition: reduced ? 'none' : 'opacity 220ms ease' }} />
      {/* content panel — offset right of the rail (rail stays visible), scrollable */}
      <div style={{ position: 'absolute', top: 0, left: 'var(--rail-w)', right: 0, bottom: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, width: '100%', maxWidth: 1200, margin: '0 auto', padding: '56px 56px 64px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: reduced ? 'none' : 'opacity 320ms ease, transform 320ms cubic-bezier(0.16,0.84,0.3,1)' }}>

          {/* HEADER — page-title left, logomark top-right (closes), matching mobile. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, marginBottom: 34 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'calc(44px * var(--type-scale))', lineHeight: 0.94, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', margin: 0 }}>Viewing Modes</h1>
            <button onClick={onClose} aria-label="Close viewing modes" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 2px', marginTop: -2, lineHeight: 0 }}>
              <img src="/design-updates-071526/scope-logomark-offwhite.png" alt="Close" style={{ width: 44, height: 'auto', objectFit: 'contain', display: 'block' }} />
            </button>
          </div>

          {/* 2×2 grid — four cards share the remaining height/width to fill the viewport
              (chosen over a single row: on a wide desktop a row makes each card a thin
              letterbox; 2×2 keeps them substantial and balanced). */}
          <div style={{ flex: 1, minHeight: 440, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 18 }}>
            {VMODE_CARDS.map((card, i) => (
              <VmodeCard
                key={card.mode}
                card={card}
                index={i}
                reduced={!!reduced}
                selected={currentMode === (card.mode as ViewingMode)}
                onSelect={(m: VmodeMode) => onSelect(m)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
