'use client';
// ── BannerBadgeStrip — PIECE 1 of the badge redesign ─────────────────────────
//
// The badge BACKDROP strip on the profile header: a vertical rectangle to the
// LEFT of the PFP that the user's earned badge icons sit on, with a 0.5px
// hairline divider between it and the PFP. Foundation for every other badge
// surface. SAME component on own + public profiles (do not fork).
//
// GENERIC: renders ANY badge from a {src} list — newer badges light up
// automatically once their art + earning logic exist; nothing is hardcoded.
//
// SYMMETRY RULE (explicit): icon size is FIXED (never changes with count). Icons
// stay vertically balanced/centered for ANY count (1..MAX) — only the spacing
// redistributes (space-around). NEVER resize or top-align for fewer badges:
//   1 badge  → one centered icon
//   2 badges → two balanced about the centre
//   4 badges → evenly distributed within the height
//
// DIVIDER: Piece 2 sets its colour/gradient via `dividerColor`. Here it defaults
// to a plain hairline — that prop is the clean hook for Piece 2.

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export interface StripBadge {
  key: string;
  src: string;
  title?: string;
}

// Figma reference is the 4-badge frame → 4 visible max. Beyond that, overflow to
// (MAX-1) icons + a "+N" chip. (Default rule — Figma doesn't specify >4; flag.)
const MAX_VISIBLE = 4;

export default function BannerBadgeStrip({
  badges,
  height = 80,
  width = 27,
  iconSize = 16,
  /** Piece 2 hook — colour/gradient of the 0.5px divider. Default hairline. */
  dividerColor = 'rgba(255,255,255,0.15)',
  onPress,
}: {
  badges: StripBadge[];
  height?: number;
  width?: number;
  iconSize?: number;
  dividerColor?: string;
  onPress?: () => void;
}) {
  const overflow = badges.length > MAX_VISIBLE;
  const visible = overflow ? badges.slice(0, MAX_VISIBLE - 1) : badges;
  const extra = overflow ? badges.length - visible.length : 0;

  return (
    <div style={{ position: 'relative', width, height, flexShrink: 0 }}>
      {/* Backdrop — pure black; icons sit on it, fixed size, symmetric for any count. */}
      <div
        onClick={onPress ? (e) => { e.stopPropagation(); onPress(); } : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-around', // even + centered for ANY count
          cursor: onPress ? 'pointer' : 'default',
        }}
      >
        {visible.map((b) => (
          <img
            key={b.key}
            src={b.src}
            alt={b.title ?? b.key}
            style={{ width: iconSize, height: iconSize, objectFit: 'contain', display: 'block' }}
          />
        ))}
        {extra > 0 && (
          <span style={{ ...SKB, fontSize: Math.round(iconSize * 0.5), color: '#FF0000', lineHeight: 1 }}>+{extra}</span>
        )}
      </div>

      {/* 0.5px divider between the backdrop and the PFP. Colour set by Piece 2. */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: 0.5, height: '100%', background: dividerColor }} />
    </div>
  );
}
