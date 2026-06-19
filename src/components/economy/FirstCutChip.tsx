'use client';
// ── FirstCutChip — minimal First Cut count for the home-feed data shelf ──────
//
// Just the First Cut mark + filled-slot count ("4/10") — no word-label, no box,
// no PFP stack. Sits in the below-image row to the LEFT of COLLECT. The full
// ledger lives in the Lightbox (separate). Count = filled/claimed slots from
// first_cut_awards for this coin (the real award count, never stale/zero).
//
// TICK-UP PAYOFF: when the viewer's own buy earns First Cut on THIS post, the
// count re-fetches and ticks up with a brief red illumination (the home-feed
// echo of Moment 1). Fires ONCE, only on the post whose count changed, only on a
// genuine increment.

import { useEffect, useRef, useState } from 'react';
import { useFirstCutLedger, FIRST_CUT_SLOTS, onFirstCutEarned } from '@/lib/firstCutLedger';
import { BADGES } from '@/lib/economy/badges';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const MARK = BADGES.firstCut.bannerSrc ?? BADGES.firstCut.src;

export default function FirstCutChip({ coinAddress, postId }: { coinAddress: string; postId?: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const holders = useFirstCutLedger(coinAddress, refreshKey);
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef<number | null>(null);

  // Our own earn on this post → re-fetch the (now-incremented) count.
  useEffect(() => onFirstCutEarned((earnedPostId) => {
    if (postId && earnedPostId === postId) setRefreshKey((k) => k + 1);
  }), [postId]);

  // Play the tick-up ONCE, only on a genuine increment (truthful to the buy).
  // First load just records the baseline (no pulse); subsequent renders/scrolls
  // don't re-fire (count unchanged → no pulse).
  useEffect(() => {
    if (holders === null) return;
    const count = holders.length;
    if (prevCount.current !== null && count > prevCount.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      prevCount.current = count;
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [holders]);

  if (holders === null) return null; // loading — don't flash a half-state
  const filled = holders.length;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <img
        src={MARK}
        alt="First Cut"
        className={pulse ? 'fc-markpop' : undefined}
        style={{ width: 22, height: 22, objectFit: 'contain', display: 'block', ...(pulse ? { animation: 'fcMarkPop 0.5s cubic-bezier(0.16,0.84,0.3,1) both' } : null) }}
      />
      <span
        className={pulse ? 'fc-tickup' : undefined}
        style={{
          ...SKB, fontSize: 8, letterSpacing: '0.04em', lineHeight: 1, display: 'inline-block',
          color: filled > 0 ? '#FF0000' : 'rgba(255,255,255,0.5)',
          ...(pulse ? { animation: 'fcTickUp 0.5s cubic-bezier(0.16,0.84,0.3,1) both' } : null),
        }}
      >
        {filled}/{FIRST_CUT_SLOTS}
      </span>
    </span>
  );
}
