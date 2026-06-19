'use client';
// ── FirstCutChip — minimal First Cut count for the home-feed data shelf ──────
//
// Just the First Cut mark + filled-slot count ("4/10") — no word-label, no box,
// no PFP stack. Sits in the below-image row to the LEFT of COLLECT (NOT on the
// media — the boxed image overlay was removed; it cluttered the frame). The full
// ledger lives in the Lightbox (separate). Count = filled/claimed slots from
// first_cut_awards for this coin (the real award count, never stale/zero).

import { useFirstCutLedger, FIRST_CUT_SLOTS } from '@/lib/firstCutLedger';
import { BADGES } from '@/lib/economy/badges';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const MARK = BADGES.firstCut.bannerSrc ?? BADGES.firstCut.src;

export default function FirstCutChip({ coinAddress }: { coinAddress: string }) {
  const holders = useFirstCutLedger(coinAddress);
  if (holders === null) return null; // loading — don't flash a half-state
  const filled = holders.length;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <img src={MARK} alt="First Cut" style={{ width: 11, height: 11, objectFit: 'contain', display: 'block' }} />
      <span style={{ ...SKB, fontSize: 8, letterSpacing: '0.04em', color: filled > 0 ? '#FF0000' : 'rgba(255,255,255,0.5)', lineHeight: 1 }}>
        {filled}/{FIRST_CUT_SLOTS}
      </span>
    </span>
  );
}
