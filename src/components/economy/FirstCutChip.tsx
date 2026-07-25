'use client';
// ── FirstCutChip — minimal First Cut count + whip-into-counter payoff ─────────
//
// Just the First Cut mark + filled-slot count ("4/10") in the below-content row,
// left of COLLECT. The full ledger lives in the Lightbox (separate). Count =
// filled/claimed slots from first_cut_awards for this coin.
//
// WHIP PAYOFF (game feel): when the viewer's own buy earns First Cut on THIS
// post, the celebration mark shrinks and whips FAST from screen centre (where
// Moment 1 played) INTO this counter; the IMPACT drives the count tick-up — the
// number was frozen at the old value during the flight and reveals the new value
// with a red flash + punch exactly when the mark lands. Fires ONCE, only on the
// post whose count changed; no replay on scrolls/renders. Reduced-motion: the
// count just updates, no flight/flash.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFirstCutLedger, FIRST_CUT_SLOTS, onFirstCutEarned } from '@/lib/firstCutLedger';
import { BADGES } from '@/lib/economy/badges';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const MARK = BADGES.firstCut.bannerSrc ?? BADGES.firstCut.src;
const WHIP_MS = 560; // fast, decisive

interface Fly { cx: number; cy: number; sx: number; sy: number; ss: number }

// Brief M8 — in post lightbox/viewer contexts the FC row collapses to JUST the mark,
// sitting inline with the like/comment icons. `iconOnly` drops the "N/10" count (the mark
// alone, sized to the surface's icon class); `onPress` makes it a ≥44px tap target (the
// ledger surfaces open the FirstCutSheet). The whip still lands on the mark. Default (no
// iconOnly) keeps the legacy mark+count for any non-post-view caller.
export default function FirstCutChip({
  coinAddress,
  postId,
  iconOnly = false,
  size = 22,
  onPress,
}: {
  coinAddress: string;
  postId?: string;
  iconOnly?: boolean;
  size?: number;
  onPress?: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const holders = useFirstCutLedger(coinAddress, refreshKey);
  const countRef = useRef<HTMLSpanElement>(null);
  const [pulse, setPulse] = useState(false);       // impact flash + punch on the number
  const [fly, setFly] = useState<Fly | null>(null); // the flying mark (null = none)
  const frozen = useRef<number | null>(null);       // count held at OLD value during the flight
  const reduceMotion = useRef(false);

  useEffect(() => { reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }, []);

  // Our own earn on this post → re-fetch (ready by impact) and whip into the counter.
  useEffect(() => onFirstCutEarned((earnedPostId) => {
    if (!postId || earnedPostId !== postId) return;
    setRefreshKey((k) => k + 1); // pull the new count during the flight

    const impact = () => { setPulse(true); setTimeout(() => setPulse(false), 500); };
    const el = countRef.current;
    if (reduceMotion.current || !el) { impact(); return; } // no flight — count just updates (+ a flash if visible)

    // Start where Moment 1 played (screen centre, upper) → land on this counter.
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    frozen.current = holders ? holders.length : 0; // hold the OLD value through the flight
    setFly({ cx, cy, sx: window.innerWidth / 2 - cx, sy: window.innerHeight * 0.42 - cy, ss: 5.5 });
    const t = setTimeout(() => { setFly(null); frozen.current = null; impact(); }, WHIP_MS); // land → reveal + flash
    return () => clearTimeout(t);
  }), [postId, holders]);

  if (holders === null) return null; // loading — don't flash a half-state
  const live = holders.length;
  const shown = fly && frozen.current !== null ? frozen.current : live; // frozen during flight

  // Brief M8 — icon-only: the mark alone (no count), the whip anchored on it. A ≥44px
  // tap target when `onPress` is given (opens the ledger sheet), else non-interactive
  // (matches today's chip, which had no tap).
  const mark = (
    <img
      src={MARK}
      alt="First Cut"
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', ...(pulse ? { animation: 'fcMarkPop 0.5s cubic-bezier(0.16,0.84,0.3,1) both' } : null) }}
    />
  );

  return (
    <>
      {iconOnly ? (
        onPress ? (
          <button
            onClick={(e) => { e.stopPropagation(); onPress(); }}
            aria-label="First Cut"
            className="tap-target-x6"
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
          >
            <span ref={countRef} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{mark}</span>
          </button>
        ) : (
          <span ref={countRef} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{mark}</span>
        )
      ) : (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {mark}
        <span
          ref={countRef}
          className={pulse ? 'fc-tickup' : undefined}
          style={{
            // GREY at rest (ordinary metadata) — having holders does NOT make it
            // red. Red is the impact-only flash (fcTickUp flips the colour for a
            // beat, then settles back to this grey).
            ...SKB, fontSize: 'var(--fs-8)', letterSpacing: '0.04em', lineHeight: 1, display: 'inline-block',
            color: 'rgba(229,225,219,0.6)',
            ...(pulse ? { animation: 'fcTickUp 0.5s cubic-bezier(0.16,0.84,0.3,1) both' } : null),
          }}
        >
          {shown}/{FIRST_CUT_SLOTS}
        </span>
      </span>
      )}

      {/* The whip — portaled to body so `fixed` is viewport-true regardless of
          any transformed feed-tile ancestor. Lands centred on the counter. */}
      {fly && typeof document !== 'undefined' && createPortal(
        <img
          src={MARK}
          alt=""
          style={{
            position: 'fixed', left: fly.cx, top: fly.cy, width: 22, height: 22, objectFit: 'contain',
            zIndex: 650, pointerEvents: 'none',
            filter: 'drop-shadow(0 0 9px rgba(229,225,219,0.65))',
            // dynamic start offset/scale for the keyframe
            ['--fc-sx' as string]: `${fly.sx}px`,
            ['--fc-sy' as string]: `${fly.sy}px`,
            ['--fc-ss' as string]: `${fly.ss}`,
            animation: `fcWhip ${WHIP_MS}ms cubic-bezier(0.16,0.84,0.3,1) both`,
          } as React.CSSProperties}
        />,
        document.body,
      )}
    </>
  );
}
