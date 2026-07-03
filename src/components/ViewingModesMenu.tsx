'use client';

// ── VIEWING MODES — the full-page mode menu (Figma 943:406) ───────────────────
//
// Portaled takeover on black. The four cards are Eric's BAKED two-state PNGs
// (@4x, 1344×452 — chrome/text/icons/preview art in the image): both states
// stacked, the CURRENT mode's -active variant revealed by opacity crossfade.
// Entrance choreography: takeover spring → header stagger → card cascade (all
// DEFAULT) → the IGNITION beat: ~120ms after the last card lands, the current
// mode lights red. Selection runs the host's existing mode-switch unchanged.
// Reduced-motion: instant, pre-lit. Opacity/translate transforms only.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export type ViewingMode = 'theatre' | 'screening' | 'mirage' | 'feed';

const CARDS: { mode: ViewingMode; label: string; aria: string }[] = [
  { mode: 'theatre', label: 'Theatre Mode', aria: 'Theatre Mode — full-screen theatrical viewing' },
  { mode: 'screening', label: 'Screening Room', aria: 'Screening Room — the discovery feed' },
  { mode: 'mirage', label: 'Mirage View', aria: 'Mirage View — the cinematic home feed' },
  { mode: 'feed', label: 'Feed', aria: 'Feed — the standard home feed' },
];

// Choreography (ms) — cards start after the takeover+header, 70ms cascade,
// ignition fires ~120ms after the LAST card lands.
const CARD_BASE = 260;
const CARD_STAGGER = 70;
const CARD_DUR = 280;
const IGNITE_AT = CARD_BASE + 3 * CARD_STAGGER + CARD_DUR + 120; // ≈ 870ms

interface Props {
  currentMode: ViewingMode;
  onClose: () => void;
  /** Runs the host's EXISTING mode-switch logic (unchanged) + closes. */
  onSelect: (mode: ViewingMode) => void;
}

export default function ViewingModesMenu({ currentMode, onClose, onSelect }: Props) {
  const reduced = !!useReducedMotion();
  // The illuminated card: null until the ignition beat, then the current mode;
  // switches (250ms crossfade) when a different card is tapped before closing.
  const [lit, setLit] = useState<ViewingMode | null>(reduced ? currentMode : null);
  const [pressed, setPressed] = useState<ViewingMode | null>(null);

  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => setLit(currentMode), IGNITE_AT);
    return () => window.clearTimeout(id);
  }, [reduced, currentMode]);

  const pick = (mode: ViewingMode) => {
    if (mode === lit) { onSelect(mode); return; }
    setLit(mode); // crossfade to the tapped card…
    window.setTimeout(() => onSelect(mode), reduced ? 0 : 300); // …then close into it
  };

  if (typeof document === 'undefined') return null;

  const headerIn = (delayMs: number) => ({
    initial: reduced ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: { duration: 0.15 } },
    transition: { duration: reduced ? 0 : 0.25, delay: reduced ? 0 : delayMs / 1000, ease: 'easeOut' as const },
  });

  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
      {/* Backdrop */}
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: reduced ? 0 : 0.2 }}
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: '#000' }}
      />
      {/* Takeover */}
      <motion.div
        initial={reduced ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.25, ease: 'easeIn' } }}
        transition={reduced ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0.12 }}
        style={{
          position: 'absolute', inset: 0, overflowY: 'auto', background: '#000',
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 20px calc(24px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Top hairline */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.14)', margin: '0 0 18px' }} />

        {/* Header row: title two lines + close × */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <motion.h1
            {...headerIn(120)}
            style={{ ...SKB, fontSize: 38, lineHeight: 0.96, letterSpacing: '-0.03em', color: '#FFF', textTransform: 'uppercase', margin: 0, whiteSpace: 'pre-line' }}
          >
            {'VIEWING\nMODES'}
          </motion.h1>
          <motion.button
            {...headerIn(120)}
            onClick={onClose}
            aria-label="Close viewing modes"
            style={{ ...SKB, background: 'transparent', border: 'none', cursor: 'pointer', color: '#FFF', fontSize: 22, lineHeight: 1, padding: '4px 2px' }}
          >
            ✕
          </motion.button>
        </div>

        {/* Tagline — red + glyph, right-aligned */}
        <motion.div {...headerIn(180)} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 7, margin: '14px 0 0' }}>
          <span style={{ ...SKB, fontSize: 14, color: '#FF0000', lineHeight: 1 }}>+</span>
          <span style={{ ...SKR, fontSize: 8.5, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            DEFINE YOUR PERSPECTIVE. CONTROL YOUR EXPERIENCE.
          </span>
        </motion.div>

        {/* SELECT A FORMAT over a hairline */}
        <motion.div {...headerIn(240)} style={{ margin: '22px 0 0' }}>
          <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.22em', textTransform: 'uppercase', margin: '0 0 8px' }}>
            SELECT A FORMAT
          </p>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.14)' }} />
        </motion.div>

        {/* The four cards — baked two-state PNGs, ratio-locked, cascading in
            DEFAULT state; the ignition beat lights the current mode after. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '18px 0 0' }}>
          {CARDS.map((card, i) => (
            <motion.button
              key={card.mode}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: reduced ? 0 : CARD_DUR / 1000, delay: reduced ? 0 : (CARD_BASE + i * CARD_STAGGER) / 1000, ease: 'easeOut' }}
              onClick={() => pick(card.mode)}
              onPointerDown={() => setPressed(card.mode)}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              aria-label={card.aria}
              style={{
                position: 'relative', width: '100%', aspectRatio: '1344 / 452',
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                transform: pressed === card.mode ? 'scale(0.97)' : 'scale(1)',
                transition: 'transform 120ms ease',
              }}
            >
              <img
                src={`/viewing-modes/${card.mode}-default.png`}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
              {/* -active stacked above; the crossfade IS the illumination:
                  ignition 300ms, tap-switch 250ms — same mechanism. */}
              <img
                src={`/viewing-modes/${card.mode}-active.png`}
                alt=""
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  opacity: lit === card.mode ? 1 : 0,
                  transition: reduced ? 'none' : `opacity ${lit === card.mode ? 300 : 250}ms ease`,
                }}
              />
            </motion.button>
          ))}
        </div>

        {/* Logomark, centered at the bottom */}
        <motion.div {...headerIn(CARD_BASE + 3 * CARD_STAGGER + 100)} style={{ display: 'flex', justifyContent: 'center', margin: '26px 0 0' }}>
          <img src="/logomark-plain-white.png" alt="Scope" style={{ width: 34, height: 22, objectFit: 'contain', opacity: 0.9 }} />
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  );
}
