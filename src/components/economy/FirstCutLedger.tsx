'use client';
// ── FirstCutLedger — the founding-collector list on a post ───────────────────
//
// COLLAPSED by default: just the header (mark + "FIRST CUT" + N/10 + a caret).
// Tapping the header expands the 10 slots, which RIPPLE down (staggered reveal
// on the signature easing). Each slot shows its founder (PFP + handle) or an
// open slot. Used inline in the lightbox.
//
// Design system: black, #FF0000, SK-Modernist Bold (uppercase labels, tight
// tracking), sharp corners, NO shadow/blur.

import { useState } from 'react';
import { BADGES } from '@/lib/economy/badges';
import { FIRST_CUT_SLOTS, type FirstCutHolder } from '@/lib/firstCutLedger';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const MARK = BADGES.firstCut.bannerSrc ?? BADGES.firstCut.src;

export default function FirstCutLedger({
  holders,
  onHolderTap,
}: {
  /** null = loading; [] = no founders yet. */
  holders: FirstCutHolder[] | null;
  onHolderTap?: (username: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const filled = holders?.length ?? 0;
  const byRank = new Map((holders ?? []).map((h) => [h.rank, h]));

  return (
    <div style={{ background: '#000', width: '100%' }}>
      {/* Header — tappable to expand/collapse the slot list */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 10px', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <img src={MARK} alt="" style={{ width: 18, height: 18, objectFit: 'contain', display: 'block' }} />
          <span style={{ ...SKB, fontSize: 11, letterSpacing: '0.18em', color: '#FFF', textTransform: 'uppercase' }}>First Cut</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...SKB, fontSize: 11, letterSpacing: '0.08em', color: filled > 0 ? '#FFF' : 'rgba(255,255,255,0.45)' }}>
            {holders === null ? '— / 10' : `${filled} / ${FIRST_CUT_SLOTS}`}
          </span>
          {/* caret — points right collapsed, down expanded */}
          <svg
            width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.25s cubic-bezier(0.16,0.84,0.3,1)', flexShrink: 0 }}
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </div>
      </div>

      {/* Expanded: invitation (empty) + the 10 slots rippling down */}
      {expanded && holders !== null && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filled === 0 && (
            <div
              className="fc-slot"
              style={{ ...SKR, fontSize: 10, color: '#FF0000', letterSpacing: '0.16em', textTransform: 'uppercase', padding: '2px 0 10px', animation: 'fcSlotRipple 0.32s cubic-bezier(0.16,0.84,0.3,1) both' }}
            >
              Be the first — the founding class is open
            </div>
          )}
          {Array.from({ length: FIRST_CUT_SLOTS }, (_, i) => i + 1).map((rank) => {
            const h = byRank.get(rank);
            return (
              <div
                key={rank}
                onClick={h?.username && onHolderTap ? () => onHolderTap(h.username!) : undefined}
                className="fc-slot"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                  borderTop: '0.5px solid rgba(255,255,255,0.08)',
                  cursor: h?.username && onHolderTap ? 'pointer' : 'default',
                  opacity: h ? 1 : 0.4,
                  // ripple-down — each slot offset slightly after the previous
                  animation: 'fcSlotRipple 0.32s cubic-bezier(0.16,0.84,0.3,1) both',
                  animationDelay: `${(rank - 1) * 0.035}s`,
                }}
              >
                {/* rank number */}
                <span style={{ ...SKB, fontSize: 10, width: 16, color: h ? '#FF0000' : 'rgba(255,255,255,0.5)', letterSpacing: '0.02em' }}>
                  {rank}
                </span>
                {/* PFP (filled) or outline circle (open) */}
                {h ? (
                  h.avatarUrl
                    ? <img src={h.avatarUrl} alt="" style={{ width: 22, height: 22, objectFit: 'cover', display: 'block', flexShrink: 0 }} />
                    : <div style={{ width: 22, height: 22, background: '#1a1a1a', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)', flexShrink: 0 }} />
                )}
                {/* handle (filled) or OPEN (empty — no "YOURS") */}
                {h ? (
                  <span style={{ ...SKB, fontSize: 11, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    @{h.username ?? '—'}
                  </span>
                ) : (
                  <span style={{ ...SKR, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
                    Open
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
