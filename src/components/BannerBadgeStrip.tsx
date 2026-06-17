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
  /** Piece 2 hook — colour/gradient of the 0.5px divider. DEFAULT = black
      (#000000), i.e. effectively invisible against the black header. Piece 2
      lets badge holders / Pro users choose a custom line colour/gradient in
      Edit Profile; default stays black/none until they do. */
  dividerColor = '#000000',
  /** Piece 3 — Augmented-only holographic fill. When true, the backdrop becomes
      a living iridescent (magenta/pink/plum) shimmer instead of the static art.
      Icons stay above it (z-index) and legible. */
  holo = false,
  onPress,
}: {
  badges: StripBadge[];
  height?: number;
  width?: number;
  iconSize?: number;
  dividerColor?: string;
  holo?: boolean;
  onPress?: () => void;
}) {
  const overflow = badges.length > MAX_VISIBLE;
  const visible = overflow ? badges.slice(0, MAX_VISIBLE - 1) : badges;
  const extra = overflow ? badges.length - visible.length : 0;

  return (
    <div style={{ position: 'relative', width, height, flexShrink: 0 }}>
      {/* Backdrop — standard art, OR (Augmented + holo on) the iridescent fill.
          Icons sit on it, fixed size, symmetric for any count. */}
      <div
        onClick={onPress ? (e) => { e.stopPropagation(); onPress(); } : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          backgroundColor: '#000',
          backgroundImage: holo ? 'none' : "url('/badges/profile-badge-banner-backdrop.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-around', // even + centered for ANY count
          cursor: onPress ? 'pointer' : 'default',
        }}
      >
        {/* DRIFT — the locked Augmented holo: a slow top→bottom drift of the
            magenta/pink/plum gradient at 14s (Eric's picked pace). Single layer,
            no sheen/hue. Opacity tuned down vs the preview so it's special, not
            blinding; icons stay legible above (z-index 1). Pure CSS bg-position
            on a tiny element — GPU-friendly, no scroll jank. */}
        {holo && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            background: 'linear-gradient(160deg, #FF0DBF 0%, #991F77 22%, #7F2366 38%, #FF9AD0 55%, #B14FD6 72%, #FF0DBF 100%)',
            backgroundSize: '100% 300%',
            opacity: 0.42,
            willChange: 'background-position',
            animation: 'holoDrift 14s ease-in-out infinite',
          }} />
        )}
        {visible.map((b) => (
          <img
            key={b.key}
            src={b.src}
            alt={b.title ?? b.key}
            style={{ position: 'relative', zIndex: 1, width: iconSize, height: iconSize, objectFit: 'contain', display: 'block' }}
          />
        ))}
        {extra > 0 && (
          <span style={{ position: 'relative', zIndex: 1, ...SKB, fontSize: Math.round(iconSize * 0.5), color: '#FF0000', lineHeight: 1 }}>+{extra}</span>
        )}
      </div>

      {/* 0.5px divider between the backdrop and the PFP. Colour set by Piece 2. */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: 0.5, height: '100%', zIndex: 2, background: dividerColor }} />
    </div>
  );
}
