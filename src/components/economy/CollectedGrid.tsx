'use client';
// ── COLLECTED — the page (ownership as identity, the curator résumé) ─────────
//
// A grid of posts where the PROFILE USER holds >0 pieces, EXCLUDING their own
// posts (ratified: self-positions live on the post and in the wallet). Public
// by nature — the data is on-chain; anyone can view anyone's collected grid.
// Tiles are the graded media in the established grid language (PostCell, which
// already carries the [ TICKER ]/MC chrome for coin posts); pieces/value
// detail lives one tap in: tile → the unified lightbox → collect sheet.
//
// DEFERRED by design: grouping/organization (post-launch); the ] • [ First Cut
// insignia on tiles (needs the indexer — the tile's top-right slot stays
// reserved for it).

import { useEffect, useState } from 'react';
import { useEconomy } from '@/components/EconomyProvider';
import PostCell from '@/components/PostCell';
import PostModal from '@/components/PostModal';
import type { Holding } from '@/lib/economy/types';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function CollectedGrid({
  userId,
  isOwn = false,
}: {
  /** The PROFILE user (Supabase id) whose collected positions to show. */
  userId: string;
  /** Own profile gets the on-grammar empty line; public shows an empty grid. */
  isOwn?: boolean;
}) {
  const economy = useEconomy();
  const [rows, setRows] = useState<Holding[] | null>(null);
  // ONE batched read of the OWNER's active First Cut coins per tab load — no
  // per-item queries. Marks h.post.coin_address membership.
  const [fcCoins, setFcCoins] = useState<Set<string>>(new Set());
  const [openPost, setOpenPost] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    economy.getCollected(userId)
      .then((h) => { if (!cancelled) setRows(h); })
      .catch((e) => { console.error('[collected] load error:', e); if (!cancelled) setRows([]); });
    economy.getFirstCutCoins(userId)
      .then((coins) => { if (!cancelled) setFcCoins(new Set(coins)); })
      .catch(() => { /* no marks on failure — never blocks the grid */ });
    return () => { cancelled = true; };
  }, [userId, economy]);

  if (rows === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '30vh' }}>
        <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LOADING…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return isOwn ? (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '30vh', padding: '0 32px' }}>
        <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.08em', lineHeight: 1.8 }}>
          NOTHING COLLECTED YET.<br />COLLECT IS HOW YOU KEEP THINGS ON SCOPE.
        </p>
      </div>
    ) : (
      <div style={{ minHeight: '30vh' }} />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-[1px] gap-y-[2px]">
        {rows.map((h, i) => (
          <PostCell
            key={h.postId}
            post={h.post as any}
            layoutId={(h.post as { layout_id?: string }).layout_id || '2x-scope'}
            index={i}
            onClick={() => setOpenPost(h.post)}
            fcMark={fcCoins.has(String((h.post as { coin_address?: string | null }).coin_address ?? '').toLowerCase())}
          />
        ))}
      </div>
      {openPost && (
        <PostModal post={openPost as any} onClose={() => setOpenPost(null)} />
      )}
    </>
  );
}
