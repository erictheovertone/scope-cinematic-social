'use client';

// ── HOW EARNINGS WORK — second-level pull-up over the earnings sheet ─────────
//
// Compact portaled sheet stacked ABOVE EarningsSheet (z 1200 > 1100); closing
// returns to the earnings sheet, never the wallet. Brand: black, sharp,
// SK-Modernist. Entry: quick slide-up (~280ms spring); reduced-motion instant.
//
// COPY: DRAFT — grounded in the verified fee mechanics (0.5% creator fee,
// ZORA payout, live cash-out). Swap in Eric's approved strings verbatim when
// provided; the BEATS array is the single place to edit.

import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const BEATS: { lead: string; body: string }[] = [
  {
    lead: 'You earn from every trade of your work.',
    body: 'Every time someone buys or sells your work, a creator fee comes back to you — automatically, instantly, on every single trade. Forever.',
  },
  {
    lead: 'It’s built in.',
    body: 'Your share is baked into how your work exists on Scope. Nobody can change it, pause it, or take it away.',
  },
  {
    lead: 'Cash out anytime.',
    body: 'Your balance sits in the wallet as CREATOR EARNINGS. One tap converts it to USDC — dollars you can send or spend.',
  },
  {
    lead: 'It compounds from day one.',
    body: 'The chart tracks every collect since your account was created. No thresholds, no payout windows — your work earns while it travels.',
  },
];

interface Props {
  onClose: () => void;
}

export default function EarningsExplainerSheet({ onClose }: Props) {
  const reduced = !!useReducedMotion();
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 1200 }}>
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.2 }}
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
      />
      <motion.div
        initial={reduced ? { y: 0 } : { y: '100%' }}
        animate={{ y: 0 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', duration: 0.28, bounce: 0.14 }}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: '#080808', borderTop: '1px solid rgba(229,225,219,0.08)',
          padding: '20px 22px calc(30px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ width: 36, height: 2, backgroundColor: 'rgba(229,225,219,0.12)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.18em', margin: 0 }}>
            HOW EARNINGS WORK
          </p>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, margin: -6 }}>
            <span style={{ ...SKR, fontSize: 'var(--fs-16)', color: 'rgba(229,225,219,0.5)', lineHeight: 1 }}>×</span>
          </button>
        </div>

        {BEATS.map((b) => (
          <div key={b.lead} style={{ marginBottom: 22 }}>
            <p style={{ ...SKB, fontSize: 'var(--fs-13)', color: '#E5E1DB', margin: '0 0 5px', letterSpacing: '-0.01em' }}>
              {b.lead}
            </p>
            <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(229,225,219,0.55)', lineHeight: 1.6, margin: 0 }}>
              {b.body}
            </p>
          </div>
        ))}
      </motion.div>
    </div>,
    document.body,
  );
}
