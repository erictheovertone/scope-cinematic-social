'use client';
// ── ApertureMark — the ] • [ glyph ───────────────────────────────────────────
//
// The FIRST CUT aperture-dot mark, rendered as a UI glyph (NOT the badge PNG).
// Used where the brief calls for a rendered mark: the COLLECTED-tile insignia
// (top-right) and the collect-sheet provenance row icon. Red, sharp, austere —
// matches the design system. The badge COIN art (green PNG) is used elsewhere.

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function ApertureMark({
  size = 11,
  color = '#FF0000',
  title = 'First Cut founding position',
}: {
  size?: number;
  color?: string;
  title?: string;
}) {
  return (
    <span
      aria-label={title}
      title={title}
      style={{
        ...SKB,
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.18,
        fontSize: size,
        lineHeight: 1,
        color,
        letterSpacing: 0,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <span aria-hidden>]</span>
      <span aria-hidden style={{ fontSize: size * 0.7 }}>•</span>
      <span aria-hidden>[</span>
    </span>
  );
}
