'use client';
// ── RED L-CORNER BRACKETS — the viewfinder motif (reusable) ──────────────────
// Four #E5E1DB L-corners (34×2px arms) inset on a relative parent. Used by the
// onboarding cards; the same language as the create-flow codification brackets.

const RED = '#E5E1DB';
const ARM = 34;
const W = 2;

export default function RedBrackets({ inset = 0, color = RED }: { inset?: number; color?: string }) {
  const corner = (v: 'top' | 'bottom', h: 'left' | 'right') => (
    <span style={{ position: 'absolute', [v]: inset, [h]: inset, width: ARM, height: ARM, pointerEvents: 'none' }}>
      <span style={{ position: 'absolute', [h]: 0, [v]: 0, width: W, height: ARM, background: color }} />
      <span style={{ position: 'absolute', [h]: 0, [v]: 0, width: ARM, height: W, background: color }} />
    </span>
  );
  return <>{corner('top', 'left')}{corner('top', 'right')}{corner('bottom', 'left')}{corner('bottom', 'right')}</>;
}
