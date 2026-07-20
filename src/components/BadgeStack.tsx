'use client';
// ── BadgeStack ───────────────────────────────────────────────────────────────
//
// The pfp badge stack (Economy UI brief Part 1.1). Rules, enforced here:
//  • max 3 coins + an overflow chip ("+N") when the user has more,
//  • the WHOLE stack ≤ 50% of the pfp width (coins shrink/tighten to comply),
//  • static at rest (no animation — the 3D flip lives in the BADGES section),
//  • rarity order Augmented → First Cut → Top 1k → Pro (resolved upstream).
//
// REAL/ungated. First Cut only enters the list when the economy boundary
// supplies firstCutCount > 0, so nothing implies earnings off-flag.

import type { BadgeMeta } from '@/lib/economy/badges';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function BadgeStack({
  badges,
  pfpWidth = 80,
  onPress,
}: {
  /** Rarity-ordered earned badges (use resolveBadges). */
  badges: BadgeMeta[];
  /** Width of the pfp this stack sits on; the stack is capped at half of it. */
  pfpWidth?: number;
  onPress?: () => void;
}) {
  if (!badges.length) return null;

  const maxStackWidth = pfpWidth * 0.5; // hard rule: ≤ 50% of the pfp width
  const visible = badges.slice(0, 3);
  const overflow = badges.length - visible.length; // shown as a "+N" chip
  const slots = visible.length + (overflow > 0 ? 1 : 0);

  // Approved spec: coins ~22px at a 120px pfp, scaled proportionally; overlap
  // ~40% (each slot advances 60% of a coin); overflow chip same diameter. The
  // ≤50%-of-pfp cap still wins — coins shrink to comply when the stack is full.
  const STEP_RATIO = 0.6;              // 60% advance = ~40% overlap
  const targetSize = pfpWidth * (22 / 120);
  const denom = 1 + STEP_RATIO * (slots - 1);
  const size = Math.min(targetSize, maxStackWidth / denom);
  const step = size * STEP_RATIO;
  const totalWidth = size + step * (slots - 1);

  return (
    <div
      onClick={onPress ? (e) => { e.stopPropagation(); onPress(); } : undefined}
      style={{
        position: 'absolute',
        top: -9,
        left: -9,
        height: size,
        width: totalWidth,
        zIndex: 10,
        cursor: onPress ? 'pointer' : 'default',
      }}
    >
      {visible.map((b, i) => (
        <img
          key={b.key}
          src={b.src}
          alt={b.title}
          style={{
            position: 'absolute',
            left: i * step,
            top: 0,
            width: size,
            height: size,
            display: 'block',
            // Higher-rarity coin (earlier) sits on top of the next.
            zIndex: visible.length - i,
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.9)) drop-shadow(0 0 3px rgba(0,0,0,0.8))',
          }}
        />
      ))}
      {overflow > 0 && (
        <div
          style={{
            position: 'absolute',
            left: visible.length * step,
            top: 0,
            width: size,
            height: size,
            zIndex: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            border: '1px solid rgba(229,225,219,0.22)', // hairline, on-brand
            boxShadow: '0 2px 6px rgba(0,0,0,0.9)',
          }}
        >
          <span style={{ ...SKB, fontSize: Math.max(6, size * 0.42), color: '#E5E1DB', lineHeight: 1 }}>
            +{overflow}
          </span>
        </div>
      )}
    </div>
  );
}
