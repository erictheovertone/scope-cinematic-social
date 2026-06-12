'use client';
// ── Public First Cut page (Economy UI brief Part 2.5) ────────────────────────
//
// Reachable from ANY profile's First Cut badge. PUBLIC — anyone views anyone's
// founding positions (the curator résumé). Reads ONLY through the economy
// boundary (useEconomy). Dev-flag gated: with the flag OFF this route shows
// nothing (Part 2 must not appear off-flag).
//
// Header: green First Cut coin + ] • [ FIRST CUT, @handle, total earned, holding
// count. Rows: slot #, post thumb, title, creator, holding days, earned $.
// Scales 1→∞.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useEconomy } from '@/components/EconomyProvider';
import { economyPreviewEnabled } from '@/lib/economy/flag';
import { BADGES } from '@/lib/economy/badges';
import ApertureMark from '@/components/economy/ApertureMark';
import { getProfileByUsername } from '@/lib/userService';
import type { FirstCuts } from '@/lib/economy/types';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);

export default function FirstCutPage() {
  const router = useRouter();
  const params = useParams();
  const username = String(params?.username ?? '');
  const economy = useEconomy();

  const [data, setData] = useState<FirstCuts | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!economyPreviewEnabled()) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await getProfileByUsername(username);
        const uid = (profile as any)?.user_id ?? username;
        const fc = await economy.getFirstCuts(uid);
        if (!cancelled) { setData(fc); setLoaded(true); }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [username, economy]);

  // Off-flag: this surface does not exist.
  if (!economyPreviewEnabled()) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => router.push('/')} style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.5)', background: 'transparent', border: 'none', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
          ← HOME
        </button>
      </div>
    );
  }

  const positions = data?.positions ?? [];
  const holding = positions.filter((p) => p.active).length;

  return (
    <div style={{ minHeight: '100vh', background: '#000', maxWidth: 375, margin: '0 auto', padding: '20px 18px 60px' }}>
      <div style={{ ...SKB, fontSize: 7, letterSpacing: '0.2em', color: '#FF0000', textTransform: 'uppercase', marginBottom: 16 }}>
        ECONOMY PREVIEW · MOCK DATA
      </div>

      {/* Header — left: ] • [ FIRST CUT + @HANDLE · N HOLDING grey sub.
          right: total earned, red, large tabular, with EARNED label under.
          (Green coin retained per the badge-asset instruction.) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 24, borderBottom: '1px solid #FF0000', paddingBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <img src={BADGES.firstCut.src} alt="First Cut" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, filter: `drop-shadow(0 0 6px ${BADGES.firstCut.color}66)` }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ApertureMark size={14} />
              <span style={{ ...SKB, fontSize: 15, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>FIRST CUT</span>
            </div>
            <p style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.45)', margin: '6px 0 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              @{username} · {data ? holding : 0} HOLDING
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
          <p style={{ ...SKB, fontSize: 26, color: '#FF0000', margin: 0, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
            {data ? usd(data.totalEarnedUsd) : '—'}
          </p>
          <p style={{ ...SKB, fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.16em', margin: '4px 0 0' }}>EARNED</p>
        </div>
      </div>

      {/* Rows */}
      {loaded && positions.length === 0 && (
        <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          NO FOUNDING POSITIONS YET.
        </p>
      )}
      {positions
        .slice()
        .sort((a, b) => Number(b.active) - Number(a.active) || b.earnedUsd - a.earnedUsd)
        .map((p) => (
          <div key={p.postId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', opacity: p.active ? 1 : 0.45 }}>
            <span style={{ ...SKB, fontSize: 10, width: 20, color: p.active ? '#FF0000' : 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>
              {String(p.slot).padStart(2, '0')}
            </span>
            {p.thumbUrl
              ? <img src={p.thumbUrl} alt="" style={{ width: 64, height: 38, objectFit: 'cover', flexShrink: 0, background: '#111', filter: p.active ? 'none' : 'grayscale(1)' }} />
              : <div style={{ width: 64, height: 38, background: '#111', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ ...SKB, fontSize: 11, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.postTitle}
              </p>
              <p style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.45)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                @{p.creatorHandle} · holding {p.holdingDays} days
              </p>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <p style={{ ...SKB, fontSize: 13, color: '#FF0000', margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>{usd(p.earnedUsd)}</p>
              <p style={{ ...SKB, fontSize: 6.5, color: p.active ? '#FF0000' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                {p.active ? 'HOLDING' : 'DEPARTED'}
              </p>
            </div>
          </div>
        ))}

      <button onClick={() => router.back()} style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.5)', background: 'transparent', border: 'none', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', marginTop: 28 }}>
        ← BACK
      </button>
    </div>
  );
}
