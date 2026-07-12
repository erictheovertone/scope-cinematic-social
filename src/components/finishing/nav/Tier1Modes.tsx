"use client";

/**
 * Tier1Modes — the bottom, heaviest navigation row.
 *
 * Five fixed modes (LOOKS · PALETTE · EDIT · FX · HISTORY) in EQUAL-WIDTH cells
 * (flex:1 1 0; minWidth:0) so icon rhythm is even regardless of label length.
 * Larger icons (~26px), one label font size for all five (never varied to fit).
 * Active mode: icon red, label white. Inactive: both muted.
 */

import { MODES, type Mode } from './navModel';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';
const ICON = 28;

// Line-style mode glyphs (currentColor, stroke ~1.5, no fill unless noted).
function ModeIcon({ mode, size = ICON }: { mode: Mode; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (mode) {
    case 'looks': // aperture brackets ] [ — viewfinder identity
      return (<svg {...common}><path d="M6 6h3v12H6" /><path d="M18 6h-3v12h3" /></svg>);
    case 'palette': // 2×2 swatch grid
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" />
          <rect x="13" y="4" width="7" height="7" />
          <rect x="4" y="13" width="7" height="7" />
          <rect x="13" y="13" width="7" height="7" />
        </svg>
      );
    case 'edit': // sliders glyph
      return (
        <svg {...common}>
          <path d="M3 7h18M3 12h18M3 17h18" />
          <circle cx="8" cy="7" r="2" fill="#000" />
          <circle cx="16" cy="12" r="2" fill="#000" />
          <circle cx="11" cy="17" r="2" fill="#000" />
        </svg>
      );
    case 'fx': // "FX" lettermark
      return (
        <svg {...common}>
          <text x="12" y="16.5" textAnchor="middle" fontFamily="'SK-Modernist', sans-serif" fontWeight={700} fontSize="11" fill="currentColor" stroke="none">FX</text>
        </svg>
      );
    case 'history': // clock + counter-clockwise revert arrow
      return (
        <svg {...common}>
          <path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4" />
          <path d="M4 4.2v3.2h3.2" />
          <path d="M12 8.5V12l2.6 1.6" />
        </svg>
      );
  }
}

interface Tier1ModesProps {
  active: Mode;
  onSelect: (m: Mode) => void;
  /** 'horizontal' = phone bottom row (default). 'vertical' = Theatre right rail. */
  orientation?: 'horizontal' | 'vertical';
  /** Compact = landscape-mobile rail (smaller icons/labels). */
  compact?: boolean;
  /** Mode whose icon should give a one-shot scale ping (e.g. PALETTE on save arrival). */
  pingKey?: Mode | null;
}

export default function Tier1Modes({ active, onSelect, orientation = 'horizontal', compact = false, pingKey = null }: Tier1ModesProps) {
  const vertical = orientation === 'vertical';
  // Vertical rail: shrink icons so all five modes fit the rail height with no
  // clipping/scroll (shortest case = landscape-mobile). Horizontal row unchanged.
  const iconSize = vertical ? (compact ? 20 : 24) : ICON;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        ...(vertical
          // Distribute all five within the rail height (flex:1 items below) so
          // none clip at top/bottom; overflow hidden guards the shortest rails.
          ? { borderLeft: '1px solid rgba(255,255,255,0.08)', height: '100%', justifyContent: 'space-between', padding: compact ? '4px 0' : '8px 0', overflow: 'hidden' }
          : { borderTop: '1px solid rgba(255,255,255,0.08)' }),
        background: '#000',
      }}
    >
      {MODES.map((m) => {
        const on = m.key === active;
        return (
          <button
            key={m.key}
            data-finishing-mode={m.key}
            onClick={() => onSelect(m.key)}
            style={{
              ...(vertical ? { width: '100%', flex: '1 1 0', minHeight: 0, justifyContent: 'center' } : { flex: '1 1 0', minWidth: 0 }),
              position: 'relative',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: vertical ? (compact ? '2px 0' : '6px 0') : '11px 0 13px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 3 : 5,
              color: on ? RED : 'rgba(255,255,255,0.5)', // drives the icon (currentColor)
            }}
          >
            {/* active marker — left red bar in the vertical rail */}
            {vertical && on && (
              <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 2, height: compact ? 16 : 24, background: RED }} />
            )}
            <span style={{ display: 'inline-flex', animation: pingKey === m.key ? 'tabPing 0.4s ease-out' : undefined }}>
              <ModeIcon mode={m.key} size={iconSize} />
            </span>
            <span style={{ ...SKB, fontSize: compact ? 7 : 9, color: on ? 'white' : 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
