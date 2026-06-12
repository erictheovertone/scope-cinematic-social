'use client';
// ── CollectedPreview (Economy UI brief Part 2.6) ─────────────────────────────
//
// Gated preview of the profile COLLECTED window. Tiles where the viewer holds a
// FIRST CUT founding position get the small ] • [ insignia in the top-right —
// the boundary (getFoundingPostIds) supplies WHICH. The real COLLECTED holdings
// grid isn't built yet (CLAUDE.md: "Collected page — Not Yet Built"); this is a
// mock-data skeleton so the insignia mechanic is demonstrable on-flag. The
// FoundingInsignia overlay is reusable by the real grid when it lands.

import { useEffect, useState } from 'react';
import { useEconomy } from '@/components/EconomyProvider';
import ApertureMark from '@/components/economy/ApertureMark';

// Deterministic mock collected tiles (stable ids → stable insignia placement).
const MOCK_TILES = Array.from({ length: 9 }).map((_, i) => ({
  id: `mock-collected-${i + 1}`,
  thumb: `https://picsum.photos/seed/collected-${i + 1}/200/200`,
}));

export function FoundingInsignia() {
  return (
    <div style={{ position: 'absolute', top: 5, right: 5, zIndex: 3, background: 'rgba(0,0,0,0.72)', padding: 3, lineHeight: 0 }}>
      <ApertureMark size={8} />
    </div>
  );
}

export default function CollectedPreview() {
  const economy = useEconomy();
  const [founding, setFounding] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    economy.getFoundingPostIds(MOCK_TILES.map((t) => t.id))
      .then((ids) => { if (!cancelled) setFounding(new Set(ids)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [economy]);

  return (
    <div style={{ position: 'absolute', top: 140, left: 0, right: 0, bottom: 60, overflowY: 'auto', padding: '0 1px' }}>
      <div style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 7, letterSpacing: '0.2em', color: '#FF0000', textTransform: 'uppercase', padding: '4px 6px 10px' }}>
        ECONOMY PREVIEW · MOCK DATA
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
        {MOCK_TILES.map((t) => (
          <div key={t.id} style={{ position: 'relative', aspectRatio: '1 / 1', background: '#111', overflow: 'hidden' }}>
            <img src={t.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {founding.has(t.id) && <FoundingInsignia />}
          </div>
        ))}
      </div>
    </div>
  );
}
