// ── First Cut ledger — the founding-collector list for a post's coin ─────────
//
// Reads the immutable first_cut_awards table (the same source the badge resolves
// from) for one coin, ordered by rank 1..10, joined to profiles for handle+PFP.
// Drives the on-post ledger (lightbox full list + feed compact chip). A coin has
// at most 10 founders, so this is a tiny, indexed read (first_cut_awards_coin_idx).

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export const FIRST_CUT_SLOTS = 10;

export interface FirstCutHolder {
  rank: number;          // 1..10 founding slot
  userId: string;
  username: string | null;
  avatarUrl: string | null;
}

/** The post's First Cut founders, oldest-first (rank 1 = first founding buy). */
export async function getFirstCutLedger(coinAddress: string): Promise<FirstCutHolder[]> {
  if (!coinAddress) return [];
  const { data: awards } = await supabase
    .from('first_cut_awards')
    .select('rank, user_id')
    .ilike('coin_address', coinAddress) // case-insensitive — stored as the post's coin_address
    .order('rank', { ascending: true });
  if (!awards?.length) return [];

  const userIds = [...new Set(awards.map((a) => a.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, username, profile_image_url')
    .in('user_id', userIds);
  const byUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  return awards.map((a) => ({
    rank: a.rank as number,
    userId: a.user_id as string,
    username: (byUser.get(a.user_id)?.username as string) ?? null,
    avatarUrl: (byUser.get(a.user_id)?.profile_image_url as string) ?? null,
  }));
}

/** Hook: the ledger for a coin. `null` = loading; `[]` = no founders yet. */
export function useFirstCutLedger(coinAddress?: string | null): FirstCutHolder[] | null {
  const [holders, setHolders] = useState<FirstCutHolder[] | null>(null);
  useEffect(() => {
    if (!coinAddress) { setHolders([]); return; }
    let cancelled = false;
    getFirstCutLedger(coinAddress)
      .then((h) => { if (!cancelled) setHolders(h); })
      .catch(() => { if (!cancelled) setHolders([]); });
    return () => { cancelled = true; };
  }, [coinAddress]);
  return holders;
}
