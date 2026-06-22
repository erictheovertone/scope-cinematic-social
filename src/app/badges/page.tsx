'use client';
// ── /badges — STUB (Piece 6 placeholder) ─────────────────────────────────────
//
// The "EXPLORE SCOPE BADGES" button in the bio-sheet BADGES pop (Piece 4)
// deep-links here. PIECE 6 builds the real full tier list — until then this is a
// minimal, honest placeholder so the deep-link never 404s. Replace this whole
// page when Piece 6 lands.

import { useRouter } from 'next/navigation';
import { BADGES, RARITY_ORDER, BADGE_SHORT_BLURB } from '@/lib/economy/badges';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function BadgesStubPage() {
  const router = useRouter();
  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
      <div style={{ maxWidth: '30rem', margin: '0 auto', padding: '16px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 20px' }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'white', letterSpacing: '0.1em', textTransform: 'uppercase' }}>← BACK</span>
          </button>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF0000', marginLeft: 'auto' }} />
        </div>

        <p style={{ ...SKB, fontSize: 'var(--fs-22)', color: 'white', letterSpacing: '-0.02em', textTransform: 'uppercase', margin: '0 0 6px' }}>SCOPE BADGES</p>
        <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, margin: '0 0 28px' }}>
          The full tier list lands in Piece 6. Here&rsquo;s the short version for now.
        </p>

        {RARITY_ORDER.map((key) => {
          const b = BADGES[key];
          return (
            <div key={key} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={b.bannerSrc ?? b.src} alt={b.title} style={{ width: 38, height: 38, objectFit: 'contain', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#FF0000', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 5px' }}>{b.title}</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-10_5)', color: 'rgba(255,255,255,0.6)', lineHeight: 1.45, margin: 0 }}>{BADGE_SHORT_BLURB[key]}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
