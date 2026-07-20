'use client';
// ── TickerMark — [ TICKER ] ──────────────────────────────────────────────────
//
// The coin ticker rendered in Scope's bracket mark, red. The ticker is
// creator-authored identity — it appears wherever a coin is referenced
// (collect sheet header, post MC chip, First Cut rows, wallet holdings).
// Deliberately NOT the $TICKER cashtag: brackets are ours, $ is for dollars.

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function TickerMark({
  ticker,
  size = 9,
  color = '#E5E1DB',
}: {
  ticker: string;
  size?: number;
  color?: string;
}) {
  if (!ticker) return null;
  return (
    <span
      style={{
        ...SKB,
        fontSize: size,
        color,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      [ {ticker} ]
    </span>
  );
}
