"use client";

/**
 * SplitTonePanel — the Split Tone tool body (Brief 5, consolidated).
 *
 *   SHADOWS TINT | HIGHLIGHTS TINT   (region headers — active = white + red underline)
 *   [ strength slider ]              (additive; disabled until a hue is chosen)
 *   [ 6 square hue swatches ]        (saturated for shadows, pastel for highlights)
 *
 * Tapping a swatch pushes the ACTIVE region toward that hue immediately (palette
 * is the primary control); first selection defaults strength to a visible value;
 * tapping the selected swatch again CLEARS that region. Shadows + highlights are
 * fully independent. Scope styling: square swatches, sharp corners, red accent.
 */

import { useState } from 'react';
import ToolSlider from './ToolSlider';
import { SPLIT_HUES, splitCss, type SplitRegion } from './splitTonePalette';
import type { SplitTone } from '@/lib/editor/params';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';
const DEFAULT_STRENGTH = 6; // visible starting point on first hue selection

interface SplitTonePanelProps {
  value: SplitTone;
  onChange: (next: SplitTone) => void;
}

export default function SplitTonePanel({ value, onChange }: SplitTonePanelProps) {
  const [region, setRegion] = useState<SplitRegion>('shadows');

  const hue = region === 'shadows' ? value.shadowsHue : value.highlightsHue;
  const strength = region === 'shadows' ? value.shadowsStrength : value.highlightsStrength;

  const setRegionState = (h: string | null, s: number) =>
    onChange(region === 'shadows'
      ? { ...value, shadowsHue: h, shadowsStrength: s }
      : { ...value, highlightsHue: h, highlightsStrength: s });

  const tapSwatch = (key: string) => {
    if (key === hue) { setRegionState(null, 0); return; }           // clear region
    setRegionState(key, strength > 0 ? strength : DEFAULT_STRENGTH); // push immediately
  };

  const hasHue = hue !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Region headers */}
      <div style={{ display: 'flex', gap: 28 }}>
        {(['shadows', 'highlights'] as const).map((r) => {
          const on = r === region;
          return (
            <button key={r} onClick={() => setRegion(r)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', position: 'relative' }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: on ? 'white' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{r === 'shadows' ? 'SHADOWS TINT' : 'HIGHLIGHTS TINT'}</span>
              {on && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -4, height: 2, background: RED }} />}
            </button>
          );
        })}
      </div>

      {/* Strength — disabled/dimmed until a hue is chosen for the active region */}
      <div style={{ opacity: hasHue ? 1 : 0.35, pointerEvents: hasHue ? 'auto' : 'none' }}>
        <ToolSlider
          type="add"
          value={strength}
          onChange={(v) => setRegionState(hue, v)}
          label="STRENGTH"
        />
      </div>

      {/* Hue palette — 6 square swatches, rendered for the active region */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {SPLIT_HUES.map((h) => {
          const selected = h.key === hue;
          return (
            <button
              key={h.key}
              onClick={() => tapSwatch(h.key)}
              aria-label={h.key}
              style={{
                width: 34, height: 34, padding: 0, cursor: 'pointer',
                background: splitCss(h.h, region),
                border: selected ? `2px solid ${RED}` : '1px solid rgba(255,255,255,0.25)',
                outline: selected ? `1px solid ${RED}` : 'none', outlineOffset: 2,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
