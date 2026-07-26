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
        display: 'flex', flexDirection: 'column',
        padding: 'calc(15px + var(--safe-top)) 7px calc(24px + var(--safe-bottom))',
      }}
    >
      {/* Header — title top-left, logomark top-right (close/return affordance;
          replaces the old ✕. Backdrop tap still closes too). */}
      <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 3px 0 6px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, lineHeight: 0.94, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', margin: 0 }}>
          Viewing Modes
        </h1>
        <button onClick={onClose} aria-label="Close viewing modes" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 2px', marginTop: -2, lineHeight: 0 }}>
          <img src="/design-updates-071526/scope-logomark-offwhite.png" alt="Close" style={{ width: 39, height: 'auto', objectFit: 'contain', display: 'block' }} />
        </button>
      </div>

      {/* Cards — Brief S1a: the stack fills the viewport. flex:1 column distributes the
          height BELOW the title zone; four cards share it equally (flex:1 each) with 12px
          gaps down to safe-bottom — no dead space, no scroll on 812/844/852. Recipe
          (radius 13 / 0.49 ivory border / 0.07→0.08 gradient) unchanged. Whole card taps.
          Short-viewport guard: each card floors at minHeight 110 (the S1 size) → once the
          natural flex height would drop below that the stack overflows and this container
          scrolls (graceful, not crushed). */}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 12, margin: '18px 0 0' }}>
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
              position: 'relative', width: '100%', flex: '1 1 0', minHeight: 110, borderRadius: 13,
              border: '1px solid rgba(229,225,219,0.49)',
              background: 'linear-gradient(90deg, rgba(229,225,219,0.07), rgba(33,31,31,0.08))',
              overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 16px 0 32px', gap: 14,
            }}
          >
            <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 25, lineHeight: 0.82, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', whiteSpace: 'pre-line' }}>{card.name}</span>
              {/* Brief M10a §4 — description at Eric's literal 5px (SANITY-FLAGGED: this
                  is likely illegibly small; the prior value was 15px, not the 10px the
                  brief assumed — the fa59661 "+5px" bump — so this is −10px from reality).
                  marginTop 8→5 re-balances the title/description group for the smaller line;
                  the group stays vertically centered via the card's alignItems:center. */}
              <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 5, lineHeight: 1.25, color: 'rgba(229,225,219,0.5)', marginTop: 5 }}>{card.desc}</span>
            </span>
            {/* Brief S1a — preview scales WITH the card: height = 53% of the card height
                (preserves the original 59/110 ratio), aspect locked 140:59, capped at 82px
                so the text column keeps ≥~120px and is never crowded. Falls back to ~58px
                (≈ the original 59) when cards floor at minHeight 110. */}
            <img src={card.preview} alt="" aria-hidden style={{ height: '53%', maxHeight: 82, aspectRatio: '140 / 59', width: 'auto', objectFit: 'contain', opacity: 0.78, flexShrink: 0, display: 'block' }} />
          </motion.button>
        ))}
      </div>
    </motion.div>,
    document.body,
  );
}
