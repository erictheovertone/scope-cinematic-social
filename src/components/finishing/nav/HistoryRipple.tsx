"use client";

/**
 * HistoryRipple — HISTORY mode's special Tier-3 area (real events now).
 *
 * A vertical, scrollable timeline: ORIGINAL at the TOP, then one row per SETTLED
 * edit event, CURRENT/newest at the BOTTOM (red node). Each event row shows the
 * tool's small rail icon + label + value summary. New rows ripple in (rise+fade,
 * staggered) when the timeline renders. Display-only — no revert/jump (later brief).
 */

import ToolIcon, { type IconKey } from '../ToolIcon';
import type { HistoryEvent } from '@/lib/editor/history';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';

interface HistoryRippleProps {
  events: HistoryEvent[];
}

export default function HistoryRipple({ events }: HistoryRippleProps) {
  // top→bottom: ORIGINAL baseline, then events oldest→newest (newest = current).
  const rows = [{ kind: 'origin' as const }, ...events.map((e) => ({ kind: 'event' as const, e }))];

  return (
    <div style={{ maxHeight: 200, overflowY: 'auto', padding: '8px 18px 12px' }}>
      {rows.map((row, i) => {
        const isFirst = i === 0;
        const isLast = i === rows.length - 1;
        const current = isLast && row.kind === 'event';
        const nodeColor = current ? RED : 'rgba(255,255,255,0.5)';
        return (
          <div
            key={row.kind === 'event' ? row.e.id : 'origin'}
            style={{ display: 'flex', alignItems: 'stretch', gap: 12, minHeight: 36, animation: `ripUp 0.32s cubic-bezier(0.16,0.84,0.3,1) both`, animationDelay: `${Math.min(i, 8) * 0.03}s` }}
          >
            {/* node column: connecting line + dot */}
            <div style={{ position: 'relative', width: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ flex: 1, width: 1, background: isFirst ? 'transparent' : 'rgba(255,255,255,0.2)' }} />
              <div style={{
                width: current ? 9 : 7, height: current ? 9 : 7, flexShrink: 0,
                background: current ? RED : '#000',
                border: `1.5px solid ${nodeColor}`,
              }} />
              <div style={{ flex: 1, width: 1, background: isLast ? 'transparent' : 'rgba(255,255,255,0.2)' }} />
            </div>

            {/* content */}
            {row.kind === 'origin' ? (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ORIGINAL</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ color: current ? RED : 'white', lineHeight: 0, flexShrink: 0 }}>
                  <ToolIcon toolKey={row.e.toolKey as IconKey} size={16.5} />
                </span>
                <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: current ? RED : 'white', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{row.e.label}</span>
                <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.e.value}</span>
              </div>
            )}
          </div>
        );
      })}
      <style>{`@keyframes ripUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
