'use client';
// ── FirstCutLedger — the founding-collector list + canonical counter ─────────
//
// THE First Cut counter on FULL POST VIEWS (Lightbox + profile post-scroll).
// COLLAPSED by default: header only (mark + "FIRST CUT" + N/10 + a caret).
// Tapping the header expands the 10 slots, which RIPPLE down (staggered reveal).
// The header's N/10 is the WHIP TARGET: when the viewer's own buy earns First Cut
// on this post, the celebration mark whips from screen-centre INTO this count and
// it ticks up on impact (red flash → settles grey). Same payoff as the feed chip,
// just a different landing element (the feed uses FirstCutChip; full post views
// use this row — one counter per surface, never both).
//
// Self-fetching: takes coinAddress + postId and owns its own ledger read + whip,
// so a single <FirstCutLedger/> is the whole counter. Design system: black,
// #E5E1DB (impact only), grey at rest, SK-Modernist Bold, sharp corners.

import { useState, useEffect, useRef } from 'react';
import { feedImage } from "@/lib/mediaUrl";
import { createPortal } from 'react-dom';
import { BADGES } from '@/lib/economy/badges';
import { useFirstCutLedger, FIRST_CUT_SLOTS, onFirstCutEarned } from '@/lib/firstCutLedger';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const MARK = BADGES.firstCut.bannerSrc ?? BADGES.firstCut.src;
const WHIP_MS = 560; // fast, decisive — identical to the feed chip

interface Fly { cx: number; cy: number; sx: number; sy: number; ss: number }

export default function FirstCutLedger({
  coinAddress,
  postId,
  onHolderTap,
}: {
  coinAddress: string;
  postId?: string;
  onHolderTap?: (username: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const holders = useFirstCutLedger(coinAddress, refreshKey);

  // ── Whip-into-counter — the celebration's exit lands on the header count ────
  const countRef = useRef<HTMLSpanElement>(null);
  const [pulse, setPulse] = useState(false);       // impact flash + punch on the number
  const [fly, setFly] = useState<Fly | null>(null); // the flying mark (null = none)
  const frozen = useRef<number | null>(null);       // count held at OLD value during the flight
  const reduceMotion = useRef(false);
  useEffect(() => { reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }, []);

  // Our own earn on this post → re-fetch (ready by impact) and whip into the count.
  useEffect(() => onFirstCutEarned((earnedPostId) => {
    if (!postId || earnedPostId !== postId) return;
    setRefreshKey((k) => k + 1); // pull the new count during the flight

    const impact = () => { setPulse(true); setTimeout(() => setPulse(false), 500); };
    const el = countRef.current;
    if (reduceMotion.current || !el) { impact(); return; } // no flight — count just updates

    // Start where Moment 1 played (screen centre, upper) → land on this count.
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    frozen.current = holders ? holders.length : 0; // hold the OLD value through the flight
    setFly({ cx, cy, sx: window.innerWidth / 2 - cx, sy: window.innerHeight * 0.42 - cy, ss: 5.5 });
    const t = setTimeout(() => { setFly(null); frozen.current = null; impact(); }, WHIP_MS); // land → reveal + flash
    return () => clearTimeout(t);
  }), [postId, holders]);

  const filled = holders?.length ?? 0;
  const byRank = new Map((holders ?? []).map((h) => [h.rank, h]));
  const shown = fly && frozen.current !== null ? frozen.current : filled; // frozen during flight

  return (
    <div style={{ background: '#000', width: '100%' }}>
      {/* Header — tappable to expand/collapse; the count on the right is the whip target */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 10px', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <img
            src={MARK}
            alt=""
            style={{ width: 18, height: 18, objectFit: 'contain', display: 'block', ...(pulse ? { animation: 'fcMarkPop 0.5s cubic-bezier(0.16,0.84,0.3,1) both' } : null) }}
          />
          <span style={{ ...SKB, fontSize: 'var(--fs-11)', letterSpacing: '0.18em', color: '#E5E1DB', textTransform: 'uppercase' }}>First Cut</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            ref={countRef}
            style={{
              // GREY at rest (ordinary metadata). Red is the impact-only flash:
              // fcTickUp flips the colour for a beat, then settles back to this grey.
              ...SKB, fontSize: 'var(--fs-11)', letterSpacing: '0.08em', color: 'rgba(229,225,219,0.6)', lineHeight: 1, display: 'inline-block',
              ...(pulse ? { animation: 'fcTickUp 0.5s cubic-bezier(0.16,0.84,0.3,1) both' } : null),
            }}
          >
            {holders === null ? '— / 10' : `${shown} / ${FIRST_CUT_SLOTS}`}
          </span>
          {/* caret — points right collapsed, down expanded */}
          <svg
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.5)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
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
              style={{ ...SKR, fontSize: 'var(--fs-10)', color: '#E5E1DB', letterSpacing: '0.16em', textTransform: 'uppercase', padding: '2px 0 10px', animation: 'fcSlotRipple 0.32s cubic-bezier(0.16,0.84,0.3,1) both' }}
            >
              Be the first
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
                  borderTop: '0.5px solid rgba(229,225,219,0.08)',
                  cursor: h?.username && onHolderTap ? 'pointer' : 'default',
                  opacity: h ? 1 : 0.4,
                  // ripple-down — each slot offset slightly after the previous
                  animation: 'fcSlotRipple 0.32s cubic-bezier(0.16,0.84,0.3,1) both',
                  animationDelay: `${(rank - 1) * 0.035}s`,
                }}
              >
                {/* rank number */}
                <span style={{ ...SKB, fontSize: 'var(--fs-10)', width: 16, color: h ? '#E5E1DB' : 'rgba(229,225,219,0.5)', letterSpacing: '0.02em' }}>
                  {rank}
                </span>
                {/* PFP (filled) or outline circle (open) */}
                {h ? (
                  h.avatarUrl
                    ? <img src={feedImage(h.avatarUrl, 96)} alt="" style={{ width: 22, height: 22, objectFit: 'cover', display: 'block', flexShrink: 0 }} />
                    : <div style={{ width: 22, height: 22, background: '#1a1a1a', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid rgba(229,225,219,0.25)', flexShrink: 0 }} />
                )}
                {/* handle (filled) or OPEN (empty) */}
                {h ? (
                  <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    @{h.username ?? '—'}
                  </span>
                ) : (
                  <span style={{ ...SKR, fontSize: 'var(--fs-9)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(229,225,219,0.35)' }}>
                    Open
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* The whip — portaled to body so `fixed` is viewport-true regardless of any
          transformed/scrolled ancestor. Lands centred on the header count. */}
      {fly && typeof document !== 'undefined' && createPortal(
        <img
          src={MARK}
          alt=""
          style={{
            position: 'fixed', left: fly.cx, top: fly.cy, width: 22, height: 22, objectFit: 'contain',
            zIndex: 650, pointerEvents: 'none',
            filter: 'drop-shadow(0 0 9px rgba(229,225,219,0.65))',
            ['--fc-sx' as string]: `${fly.sx}px`,
            ['--fc-sy' as string]: `${fly.sy}px`,
            ['--fc-ss' as string]: `${fly.ss}`,
            animation: `fcWhip ${WHIP_MS}ms cubic-bezier(0.16,0.84,0.3,1) both`,
          } as React.CSSProperties}
        />,
        document.body,
      )}
    </div>
  );
}
