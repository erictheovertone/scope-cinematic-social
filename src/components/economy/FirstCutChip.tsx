'use client';
// ── FirstCutChip — compact First Cut indicator for the home feed ─────────────
//
// Space is tight on a feed tile, so this is a small "FIRST CUT N/10" mark with a
// few stacked founder PFPs; tapping it opens the full ledger in a bottom sheet
// (the same FirstCutLedger the lightbox renders inline). Reads the immutable
// first_cut_awards via the shared hook — one tiny indexed query per coin.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BADGES } from '@/lib/economy/badges';
import { useFirstCutLedger, FIRST_CUT_SLOTS } from '@/lib/firstCutLedger';
import FirstCutLedger from './FirstCutLedger';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const MARK = BADGES.firstCut.bannerSrc ?? BADGES.firstCut.src;

export default function FirstCutChip({ coinAddress }: { coinAddress: string }) {
  const router = useRouter();
  const holders = useFirstCutLedger(coinAddress);
  const [open, setOpen] = useState(false);

  if (holders === null) return null; // loading — don't flash a half-state
  const filled = holders.length;
  const top = holders.slice(0, 3);

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px',
          background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer',
        }}
      >
        <img src={MARK} alt="" style={{ width: 12, height: 12, objectFit: 'contain', display: 'block' }} />
        <span style={{ ...SKB, fontSize: 8, letterSpacing: '0.14em', color: '#FFF', textTransform: 'uppercase' }}>
          First Cut <span style={{ color: filled > 0 ? '#FF0000' : 'rgba(255,255,255,0.55)' }}>{filled}/{FIRST_CUT_SLOTS}</span>
        </span>
        {top.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {top.map((h, i) => (
              h.avatarUrl
                ? <img key={h.userId} src={h.avatarUrl} alt="" style={{ width: 14, height: 14, objectFit: 'cover', display: 'block', marginLeft: i ? -5 : 0, border: '1px solid #000' }} />
                : <div key={h.userId} style={{ width: 14, height: 14, background: '#222', marginLeft: i ? -5 : 0, border: '1px solid #000' }} />
            ))}
          </div>
        )}
      </button>

      {open && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 700 }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: 375, zIndex: 701,
              background: '#000', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '18px 18px 34px',
              maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              aria-label="Close"
              style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', color: '#FFF', fontSize: 18, cursor: 'pointer', ...SKB, lineHeight: 1 }}
            >
              ✕
            </button>
            <FirstCutLedger holders={holders} onHolderTap={(u) => { setOpen(false); router.push('/profile/' + u); }} />
          </div>
        </>
      )}
    </>
  );
}
