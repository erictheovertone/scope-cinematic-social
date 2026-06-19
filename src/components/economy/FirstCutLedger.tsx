'use client';
// ── FirstCutLedger — the founding-collector list on a post ───────────────────
//
// The post's First Cut holders (rank 1..10) with PFP + handle, the filled/open
// count (N / 10), and the remaining open slots as an invitation. Full display —
// used inline in the lightbox AND inside the feed chip's expand sheet.
//
// Design system: black, #FF0000, SK-Modernist Bold (uppercase labels, tight
// tracking), sharp corners, NO shadow/blur.

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
  const filled = holders?.length ?? 0;
  const byRank = new Map((holders ?? []).map((h) => [h.rank, h]));

  return (
    <div style={{ background: '#000', width: '100%' }}>
      {/* Header — mark + FIRST CUT + N / 10 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <img src={MARK} alt="" style={{ width: 15, height: 15, objectFit: 'contain', display: 'block' }} />
          <span style={{ ...SKB, fontSize: 11, letterSpacing: '0.18em', color: '#FFF', textTransform: 'uppercase' }}>First Cut</span>
        </div>
        <span style={{ ...SKB, fontSize: 11, letterSpacing: '0.08em', color: filled > 0 ? '#FFF' : 'rgba(255,255,255,0.45)' }}>
          {holders === null ? '— / 10' : `${filled} / ${FIRST_CUT_SLOTS}`}
        </span>
      </div>

      {/* Empty invitation */}
      {holders !== null && filled === 0 && (
        <div style={{ ...SKR, fontSize: 10, color: '#FF0000', letterSpacing: '0.16em', textTransform: 'uppercase', padding: '2px 0 10px' }}>
          Be the first — the founding class is open
        </div>
      )}

      {/* Slot rows 1..10 */}
      {holders !== null && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {Array.from({ length: FIRST_CUT_SLOTS }, (_, i) => i + 1).map((rank) => {
            const h = byRank.get(rank);
            const isNextOpen = !h && rank === filled + 1; // the next slot to fill — the invitation
            return (
              <div
                key={rank}
                onClick={h?.username && onHolderTap ? () => onHolderTap(h.username!) : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                  borderTop: '0.5px solid rgba(255,255,255,0.08)',
                  cursor: h?.username && onHolderTap ? 'pointer' : 'default',
                  opacity: h ? 1 : isNextOpen ? 0.9 : 0.4,
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
                  <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${isNextOpen ? '#FF0000' : 'rgba(255,255,255,0.25)'}`, flexShrink: 0 }} />
                )}
                {/* handle (filled) or OPEN (empty) */}
                {h ? (
                  <span style={{ ...SKB, fontSize: 11, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    @{h.username ?? '—'}
                  </span>
                ) : (
                  <span style={{ ...SKR, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: isNextOpen ? '#FF0000' : 'rgba(255,255,255,0.35)' }}>
                    {isNextOpen ? 'Open — yours' : 'Open'}
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
