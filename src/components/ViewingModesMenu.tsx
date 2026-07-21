'use client';

// ── VIEWING MODES — full-page mode menu (Brief S1, Figma 192:914) ─────────────
// Rebuilt to the revised frame: page-title "Viewing Modes" top-left + logomark
// top-right (close/return), four soft gradient cards (mode name · description ·
// preview crop). Full takeover on --canvas, safe-area padded, footer pill hidden
// via the body suiteOpen flag. Selection runs the host's EXISTING mode-switch
// (onSelect) unchanged. No text blur (W5 retirement stands — the frame's soft look
// is the low-opacity border/fill only; text inside stays crisp).

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';

export type ViewingMode = 'theatre' | 'screening' | 'mirage' | 'feed';

const CARDS: { mode: ViewingMode; name: string; desc: string; preview: string; aria: string }[] = [
  { mode: 'theatre',   name: 'Theatre',         desc: 'Turn your phone.',                                   preview: '/viewing-modes-v2/theatre-preview.png',   aria: 'Theatre — full-screen theatrical viewing; turn your phone' },
  { mode: 'screening', name: 'Screening\nRoom', desc: 'The best work on Scope. Chosen by you',              preview: '/viewing-modes-v2/screening-preview.png', aria: 'Screening Room — the best work on Scope, chosen by you' },
  { mode: 'mirage',    name: 'Mirage',          desc: 'Everything in a collage. See what catches your eye', preview: '/viewing-modes-v2/mirage-preview.png',     aria: 'Mirage — everything in a collage' },
  { mode: 'feed',      name: 'Feed',            desc: 'Standard feed mode.',                                preview: '/viewing-modes-v2/feed-preview.png',      aria: 'Feed — the standard home feed' },
];

interface Props {
  /** Kept for the host contract; the revised frame renders cards uniformly (no
   *  active-state art), so it's no longer used for highlighting. */
  currentMode?: ViewingMode;
  onClose: () => void;
  /** Runs the host's EXISTING mode-switch logic (unchanged) + closes. */
  onSelect: (mode: ViewingMode) => void;
}

export default function ViewingModesMenu({ onClose, onSelect }: Props) {
  const reduced = !!useReducedMotion();

  // Footer pill hide — the body takeover flag (same mechanism as the bio/collect
  // sheets); `had` guards a nested takeover from clearing a parent's flag.
  useEffect(() => {
    const had = document.documentElement.dataset.suiteOpen;
    document.documentElement.dataset.suiteOpen = '1';
    window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    return () => {
      if (!had) delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      data-swipe-exclude
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: reduced ? 0 : 0.22 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'var(--canvas)',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box',
        padding: 'calc(15px + var(--safe-top)) 7px calc(24px + var(--safe-bottom))',
      }}
    >
      {/* Header — title top-left, logomark top-right (close/return affordance;
          replaces the old ✕. Backdrop tap still closes too). */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 3px 0 6px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, lineHeight: 0.94, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', margin: 0 }}>
          Viewing Modes
        </h1>
        <button onClick={onClose} aria-label="Close viewing modes" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 2px', marginTop: -2, lineHeight: 0 }}>
          <img src="/design-updates-071526/scope-logomark-offwhite.png" alt="Close" style={{ width: 39, height: 'auto', objectFit: 'contain', display: 'block' }} />
        </button>
      </div>

      {/* Cards — 360×110 fluid, radius 13, 1px 0.49 ivory border, horizontal
          0.07→0.08 gradient. Whole card is the tap target. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15, margin: '18px 0 0' }}>
        {CARDS.map((card, i) => (
          <motion.button
            key={card.mode}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.06 + i * 0.06, ease: 'easeOut' }}
            whileTap={reduced ? undefined : { scale: 0.98 }}
            onClick={(e) => { e.stopPropagation(); onSelect(card.mode); }}
            aria-label={card.aria}
            style={{
              position: 'relative', width: '100%', height: 110, flexShrink: 0, borderRadius: 13,
              border: '1px solid rgba(229,225,219,0.49)',
              background: 'linear-gradient(90deg, rgba(229,225,219,0.07), rgba(33,31,31,0.08))',
              overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 16px 0 32px', gap: 14,
            }}
          >
            <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, lineHeight: 0.82, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', whiteSpace: 'pre-line' }}>{card.name}</span>
              <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 10, lineHeight: 1.25, color: 'rgba(229,225,219,0.5)', marginTop: 8 }}>{card.desc}</span>
            </span>
            <img src={card.preview} alt="" aria-hidden style={{ width: 140, height: 59, objectFit: 'contain', opacity: 0.78, flexShrink: 0, display: 'block' }} />
          </motion.button>
        ))}
      </div>
    </motion.div>,
    document.body,
  );
}
