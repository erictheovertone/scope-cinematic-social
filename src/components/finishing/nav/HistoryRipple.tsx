"use client";

/**
 * HistoryRipple — HISTORY mode's special Tier-3 area.
 *
 * NOT a horizontal rail: a vertical, scrollable timeline. Each edit step is a
 * row with a connecting vertical line + a node dot; the CURRENT node is red.
 *
 * ORDER (chosen default): CURRENT at the BOTTOM (nearest the controls), ORIGINAL
 * at the TOP — reading UPWARD = back in time. `steps` is passed top→bottom in
 * that order. Stubbed/sample list this brief; full history wiring is later.
 */

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';

export interface HistoryStep {
  label: string;
  current?: boolean;
}

interface HistoryRippleProps {
  steps: HistoryStep[];
}

export default function HistoryRipple({ steps }: HistoryRippleProps) {
  return (
    <div style={{ maxHeight: 168, overflowY: 'auto', padding: '8px 18px 12px' }}>
      {steps.map((s, i) => {
        const isFirst = i === 0;
        const isLast = i === steps.length - 1;
        const color = s.current ? RED : 'rgba(255,255,255,0.55)';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 12, minHeight: 34 }}>
            {/* node column: connecting line above/below + dot */}
            <div style={{ position: 'relative', width: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ flex: 1, width: 1, background: isFirst ? 'transparent' : 'rgba(255,255,255,0.2)' }} />
              <div style={{
                width: s.current ? 9 : 7, height: s.current ? 9 : 7, flexShrink: 0,
                background: s.current ? RED : '#000',
                border: `1.5px solid ${s.current ? RED : 'rgba(255,255,255,0.5)'}`,
              }} />
              <div style={{ flex: 1, width: 1, background: isLast ? 'transparent' : 'rgba(255,255,255,0.2)' }} />
            </div>
            {/* label */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ ...SKB, fontSize: 9, color, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
