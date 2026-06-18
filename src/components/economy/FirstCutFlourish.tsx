'use client';
// ── FirstCutFlourish — Step 3, Moment 1 ──────────────────────────────────────
//
// A quick, video-game-style celebration that fires the instant a BUY confirms
// AND the in-flow check verifies this buy earned First Cut for the coin. ~1.8s:
// the badge mark punches in, a red ring flares past, "FIRST CUT" snaps up, then
// it all clears. ADDITIVE — it overlays the collect sheet's own success state,
// never blocks or replaces it. On-brand: pure black scrim, #FF0000, SK-Modernist,
// sharp corners. Fires ONLY for the buy that actually earned it (the caller
// gates on earned && firstTime).

import { useEffect } from 'react';
import { BADGES } from '@/lib/economy/badges';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const DURATION_MS = 1800;

export default function FirstCutFlourish({
  show,
  rank,
  onDone,
}: {
  show: boolean;
  /** Founding slot 1..10 — shown as a small "Nº" stamp under the label. */
  rank?: number | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(t);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <div
      // Above the collect sheet (z 501); click-through so it never traps the
      // collector — purely a visual beat.
      style={{
        position: 'fixed', inset: 0, zIndex: 600, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 45%, rgba(255,0,0,0.10) 0%, rgba(0,0,0,0.72) 60%, rgba(0,0,0,0.88) 100%)',
        animation: 'simpleFade 0.25s ease both',
      }}
    >
      <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Red ring flare sweeping past the mark */}
        <div
          className="fc-ring"
          style={{
            position: 'absolute', width: 96, height: 96,
            border: '1.5px solid #FF0000', borderRadius: '50%',
            animation: 'fcRing 1.1s cubic-bezier(0.16,0.84,0.3,1) both',
          }}
        />
        {/* The badge mark — punch-in with overshoot */}
        <img
          className="fc-mark"
          src={BADGES.firstCut.bannerSrc ?? BADGES.firstCut.src}
          alt="First Cut"
          style={{
            width: 72, height: 72, objectFit: 'contain', display: 'block',
            filter: 'drop-shadow(0 0 12px rgba(255,0,0,0.55))',
            animation: 'fcMark 1.8s cubic-bezier(0.16,0.84,0.3,1) both',
          }}
        />
      </div>
      <div
        className="fc-label"
        style={{ ...SKB, marginTop: 18, fontSize: 15, letterSpacing: '0.24em', color: '#FFFFFF', textTransform: 'uppercase', animation: 'fcLabel 1.8s ease both' }}
      >
        First Cut
      </div>
      {rank != null && (
        <div
          className="fc-label"
          style={{ ...SKB, marginTop: 6, fontSize: 8, letterSpacing: '0.3em', color: '#FF0000', textTransform: 'uppercase', animation: 'fcLabel 1.8s ease both', animationDelay: '0.08s' }}
        >
          Founding Nº {rank}
        </div>
      )}
    </div>
  );
}
