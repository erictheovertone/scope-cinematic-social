"use client";

/**
 * GrainPicker — the GRAIN tool body: a real film-stock picker.
 *
 * Brief 4A layout: a GAUGE TOGGLE (8MM | 16MM | 35MM) over a SINGLE density row
 * (FINE / LIGHT / MEDIUM / HEAVY) for the active gauge — keeping the sheet short
 * so the image above stays visible while picking (browsing IS previewing).
 * Toggling a gauge swaps the density row; tapping a density selects that real
 * stock live at the current intensity. Selected gauge = red underline; selected
 * density = red border + red label.
 *
 * Pure UI — emits { grainStock, grainIntensity } up; the overlay composite lives
 * in the TEXTURE-stage shader (unchanged). Asset model, compositing, intensity
 * slider, Pro-lock and edit-state are all untouched from Brief 4.
 */

import { useState } from 'react';
import ToolSlider from './ToolSlider';
import {
  GRAIN_GAUGES, grainStocksForGauge, grainStockByKey,
  type GrainGauge, type GrainStock,
} from './grainStocks';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';
const DEFAULT_INTENSITY = 6; // sensible visible starting point on first selection

interface GrainPickerProps {
  stock: string | null;       // params.grainStock
  intensity: number;          // params.grainIntensity (stop 0..12)
  onChange: (next: { grainStock: string | null; grainIntensity: number }) => void;
}

export default function GrainPicker({ stock, intensity, onChange }: GrainPickerProps) {
  // Open to the applied stock's gauge if one is set (restore selection), else 8MM.
  const [activeGauge, setActiveGauge] = useState<GrainGauge>(
    () => grainStockByKey(stock)?.gauge ?? GRAIN_GAUGES[0],
  );

  const selectStock = (s: GrainStock) => {
    // toggle off if re-tapping the selected stock
    if (s.key === stock) { onChange({ grainStock: null, grainIntensity: intensity }); return; }
    onChange({ grainStock: s.key, grainIntensity: intensity > 0 ? intensity : DEFAULT_INTENSITY });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Gauge toggle — same language as the nav's Tier-2 subcats (red underline) */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {GRAIN_GAUGES.map((g) => {
          const on = g === activeGauge;
          return (
            <button
              key={g}
              onClick={() => setActiveGauge(g)}
              style={{ flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', position: 'relative' }}
            >
              <span style={{ ...SKB, fontSize: 10, color: on ? 'white' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{g}</span>
              {on && <div style={{ position: 'absolute', left: 4, right: 4, bottom: -4, height: 2, background: RED }} />}
            </button>
          );
        })}
      </div>

      {/* Single density row for the active gauge — 4 square thumbnails */}
      <div style={{ display: 'flex', gap: 8 }}>
        {grainStocksForGauge(activeGauge).map((s) => {
          const on = s.key === stock;
          return (
            <button
              key={s.key}
              onClick={() => selectStock(s)}
              style={{
                flex: '1 1 0', minWidth: 0, background: 'transparent', cursor: 'pointer', padding: 0, border: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}
            >
              <div style={{
                width: '100%', aspectRatio: '1 / 1', overflow: 'hidden',
                border: `1px solid ${on ? RED : 'rgba(255,255,255,0.18)'}`,
              }}>
                <img
                  src={s.file}
                  alt={`${s.gauge} ${s.density}`}
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              <span style={{ ...SKB, fontSize: 7, color: on ? RED : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{s.density}</span>
            </button>
          );
        })}
      </div>

      {/* Intensity — standard additive slider (overlay blend strength) — unchanged */}
      <div style={{ paddingTop: 2 }}>
        <ToolSlider
          type="add"
          value={intensity}
          onChange={(v) => onChange({ grainStock: stock, grainIntensity: v })}
          label="INTENSITY"
        />
      </div>
    </div>
  );
}
