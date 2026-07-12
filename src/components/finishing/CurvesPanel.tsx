"use client";

/**
 * CurvesPanel — the CURVES tool body (Brief 7).
 *
 *   LUMA · R · G · B · HUE   channel tabs (active = white + red underline)
 *   [ CurveGraph for the active channel ]
 *   [ RESET <CHANNEL> ]
 *
 * Per-channel Pro gating (NOT a whole-tool lock): LUMA is free; R/G/B/HUE show a
 * lock on their tab for free users, and tapping one fires the UpsellSheet WITHOUT
 * switching. Each channel keeps its own independent control points.
 */

import { useState } from 'react';
import CurveGraph from './CurveGraph';
import { CHANNELS, channelConfig, identityCurve, type Curves, type CurveChannel } from '@/lib/editor/curveEngine';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';

interface CurvesPanelProps {
  curves: Curves;
  onChange: (curves: Curves) => void;
  isPro: boolean;
  onUpsell: () => void;
}

export default function CurvesPanel({ curves, onChange, isPro, onUpsell }: CurvesPanelProps) {
  const [active, setActive] = useState<CurveChannel>('luma');
  const cfg = channelConfig(active);

  const tapTab = (ch: CurveChannel) => {
    const locked = channelConfig(ch).pro && !isPro;
    if (locked) { onUpsell(); return; } // free user → upsell, do NOT switch
    setActive(ch);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Channel tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {CHANNELS.map((c) => {
          const on = c.key === active;
          const locked = c.pro && !isPro;
          return (
            <button key={c.key} onClick={() => tapTab(c.key)} style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: on ? 'white' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</span>
              {locked && (
                <svg width="11.5" height="11.5" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="9" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              )}
              {on && <div style={{ position: 'absolute', left: 4, right: 4, bottom: -4, height: 2, background: RED }} />}
            </button>
          );
        })}
      </div>

      <CurveGraph
        points={curves[active]}
        config={cfg}
        onChange={(pts) => onChange({ ...curves, [active]: pts })}
      />

      <button
        onClick={() => onChange({ ...curves, [active]: identityCurve(active) })}
        style={{ alignSelf: 'flex-end', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: '6px 12px' }}
      >
        <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>RESET {cfg.label}</span>
      </button>
    </div>
  );
}
