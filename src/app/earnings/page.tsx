'use client';
// ── Earnings page (Economy UI brief Part 2.7) ────────────────────────────────
//
// The one plain-English money surface: creator earnings + first cut earnings +
// pool earnings + total, in DOLLARS. Austere — design-system typography, no
// charts. Reads ONLY through the economy boundary (useEconomy). Dev-flag gated:
// off-flag it shows nothing (Part 2 must not appear without the flag).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useEconomy } from '@/components/EconomyProvider';
import { economyPreviewEnabled } from '@/lib/economy/flag';
import { getUserByPrivyId } from '@/lib/userService';
import type { Earnings } from '@/lib/economy/types';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);

export default function EarningsPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const economy = useEconomy();
  const [data, setData] = useState<Earnings | null>(null);

  useEffect(() => {
    if (!economyPreviewEnabled() || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        const uid = sbUser?.id ?? user.id;
        const e = await economy.getEarnings(uid);
        if (!cancelled) setData(e);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user, economy]);

  if (!economyPreviewEnabled()) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => router.push('/')} style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.5)', background: 'transparent', border: 'none', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
          ← HOME
        </button>
      </div>
    );
  }

  const rows: { label: string; sub: string; value: number | null }[] = [
    { label: 'CREATOR EARNINGS', sub: 'YOUR CUT OF EVERY TRADE ON YOUR POSTS', value: data?.creatorEarnedUsd ?? null },
    { label: 'FIRST CUT EARNINGS', sub: 'YOUR SHARE FROM POSTS YOU FOUNDED', value: data?.firstCutEarnedUsd ?? null },
    { label: 'POOL EARNINGS', sub: 'TOP 1K + AUGMENTED REWARD POOLS', value: data?.poolsEarnedUsd ?? null },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#000', maxWidth: 375, margin: '0 auto', padding: '24px 20px 60px' }}>
      <div style={{ ...SKB, fontSize: 7, letterSpacing: '0.2em', color: '#FF0000', textTransform: 'uppercase', marginBottom: 18 }}>
        ECONOMY PREVIEW · MOCK DATA
      </div>

      <h1 style={{ ...SKB, fontSize: 40, letterSpacing: '-1.6px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.05, margin: '0 0 4px' }}>
        EARNINGS
      </h1>
      <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '0 0 28px', lineHeight: 1.4 }}>
        Everything you’ve earned on Scope, in dollars.
      </p>

      {/* Total */}
      <div style={{ borderTop: '1px solid #FF0000', borderBottom: '1px solid #FF0000', padding: '18px 0', marginBottom: 24 }}>
        <p style={{ ...SKB, fontSize: 8, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.16em', margin: '0 0 8px' }}>TOTAL EARNED</p>
        <p style={{ ...SKB, fontSize: 38, color: '#FF0000', margin: 0, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
          {data ? usd(data.totalUsd) : '—'}
        </p>
      </div>

      {/* Breakdown */}
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
          <div style={{ flex: 1, paddingRight: 16 }}>
            <p style={{ ...SKB, fontSize: 11, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>{r.label}</p>
            <p style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, lineHeight: 1.35 }}>{r.sub}</p>
          </div>
          <p style={{ ...SKB, fontSize: 15, color: '#FFF', margin: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{r.value === null ? '—' : usd(r.value)}</p>
        </div>
      ))}

      <button onClick={() => router.back()} style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.5)', background: 'transparent', border: 'none', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', marginTop: 32 }}>
        ← BACK
      </button>
    </div>
  );
}
