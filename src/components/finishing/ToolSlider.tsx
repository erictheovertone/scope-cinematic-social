"use client";

/**
 * ToolSlider — the shared bidirectional/additive stop slider.
 *
 * Emits raw STOP values only; all stop→shader mapping is the pipeline's job
 * (mapping.ts), never the UI's.
 *   - type "bi":  range −6..+6, rests at centre with a detent (snaps to 0
 *                 within ~0.4) and a centre tick.
 *   - type "add": range 0..12, fills from the left.
 * Live numeric readout while dragging (fades on release). Double-tap/click
 * resets to the rest point (0).
 *
 * Design system: pure black, #FF0000 for active fill / active thumb / centre
 * tick accent, sharp corners, NO shadows or blur, SK-Modernist uppercase label.
 */

import { useCallback, useRef, useState } from 'react';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';
const DETENT = 0.4; // stops within which bi snaps to 0

interface ToolSliderProps {
  type: 'bi' | 'add';
  value: number; // stop
  onChange: (stop: number) => void;
  label: string;
  /**
   * APPROVED EXCEPTION — White Balance temp/tint ONLY. A CSS gradient drawn as a
   * thin 1px hairline track (e.g. blue→amber) with a white circular thumb and no
   * red fill. Every other slider leaves this undefined and stays strict red-fill.
   */
  trackGradient?: string;
  /**
   * Theatre adjusting-bar layout: name (left) · track (centre, flex) · value
   * (right) on ONE thin line. Same slider model/handlers — only the wrapper
   * changes. Stacked (default) elsewhere.
   */
  inline?: boolean;
}

export default function ToolSlider({ type, value, onChange, label, trackGradient, inline = false }: ToolSliderProps) {
  const grad = !!trackGradient;
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const lastTap = useRef(0);

  const min = type === 'bi' ? -6 : 0;
  const max = type === 'bi' ? 6 : 12;
  const range = max - min;

  // value → 0..1 position
  const pos = (value - min) / range;

  const applyFromClientX = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    let stop = min + frac * range;
    if (type === 'bi' && Math.abs(stop) < DETENT) stop = 0; // centre detent
    stop = Math.round(stop * 10) / 10;
    onChange(stop);
  }, [min, range, type, onChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    // double-tap → reset to rest
    const now = Date.now();
    if (now - lastTap.current < 300) { onChange(0); lastTap.current = 0; return; }
    lastTap.current = now;
    setDragging(true);
    applyFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    applyFromClientX(e.clientX);
  };
  const onPointerUp = () => setDragging(false);

  const readout = `${value > 0 && type === 'bi' ? '+' : ''}${value.toFixed(1)}`;

  // fill geometry
  const fillLeft = type === 'bi' ? `${Math.min(0.5, pos) * 100}%` : '0%';
  const fillWidth = type === 'bi'
    ? `${Math.abs(pos - 0.5) * 100}%`
    : `${pos * 100}%`;

  // Shared track (identical model in both layouts).
  const track = (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{ position: 'relative', height: inline ? 24 : 28, flex: inline ? 1 : undefined, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}
    >
      {/* base line — WB exception draws a thin 1px gradient hairline; else a strict line */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: grad ? 1 : 2, background: trackGradient ?? 'rgba(255,255,255,0.18)' }} />
      {/* active red fill — strict sliders only (never on the WB gradient track) */}
      {!grad && <div style={{ position: 'absolute', left: fillLeft, width: fillWidth, height: 2, background: RED }} />}
      {/* centre tick for bi */}
      {type === 'bi' && (
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 1.5, height: 10, background: !grad && value === 0 ? RED : 'rgba(255,255,255,0.45)' }} />
      )}
      {/* thumb — WB: white circular always; strict: square, red when touched */}
      <div style={{
        position: 'absolute', left: `${pos * 100}%`, transform: 'translateX(-50%)',
        width: grad ? 13 : 12, height: grad ? 13 : 12,
        borderRadius: grad ? '50%' : 0,
        background: grad ? 'white' : (value !== 0 || dragging ? RED : 'white'),
      }} />
    </div>
  );

  // ── Theatre adjusting bar: name · track · value on one thin line ──
  if (inline) {
    return (
      <div style={{ width: '100%', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{label}</span>
        {track}
        <span style={{
          ...SKB, fontSize: 'var(--fs-11)', color: value !== 0 ? RED : 'rgba(255,255,255,0.4)',
          fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right',
        }}>{readout}</span>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', userSelect: 'none' }}>
      {/* label + readout row */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
        <span style={{
          ...SKB, fontSize: 'var(--fs-11)', color: value !== 0 ? RED : 'rgba(255,255,255,0.4)',
          opacity: dragging ? 1 : 0.35, transition: 'opacity 0.3s ease', fontVariantNumeric: 'tabular-nums',
        }}>{readout}</span>
      </div>
      {track}
    </div>
  );
}
