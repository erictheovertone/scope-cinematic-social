// ── /api/fc-rewards?user=<uuid> — COLLECTED-tab read: accruals per post ──────
// Groups the append-only ledger by post with paid/unpaid split + post meta
// (ticker, thumb) for the wallet's earnings detail view.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user');
  if (!userId) return NextResponse.json({ error: 'user required' }, { status: 400 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: rows, error } = await supabase
    .from('fc_rewards')
    .select('post_id, coin_address, reward_usd, paid_at')
    .eq('holder_user_id', userId);
  if (error) {
    // Table not created yet → an empty COLLECTED, never an error surface.
    return NextResponse.json({ posts: [], totalUsd: 0, unpaidUsd: 0 });
  }

  const byPost = new Map<string, { postId: string; coinAddress: string; accruedUsd: number; unpaidUsd: number }>();
  for (const r of rows ?? []) {
    const k = r.post_id as string;
    const e = byPost.get(k) ?? { postId: k, coinAddress: r.coin_address as string, accruedUsd: 0, unpaidUsd: 0 };
    e.accruedUsd += Number(r.reward_usd) || 0;
    if (!r.paid_at) e.unpaidUsd += Number(r.reward_usd) || 0;
    byPost.set(k, e);
  }

  const ids = [...byPost.keys()];
  const { data: posts } = ids.length
    ? await supabase.from('posts').select('id, ticker, poster_url, thumbnail_url, media_urls, layout_id').in('id', ids)
    : { data: [] as Record<string, unknown>[] };
  const meta = new Map((posts ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

  const out = [...byPost.values()].map((e) => {
    const p = meta.get(e.postId) as { ticker?: string; poster_url?: string; thumbnail_url?: string; media_urls?: string[]; layout_id?: string } | undefined;
    return {
      ...e,
      ticker: p?.ticker ?? null,
      thumb: p?.poster_url || p?.thumbnail_url || p?.media_urls?.[0] || null,
      layoutId: p?.layout_id ?? null,
    };
  }).sort((a, b) => b.accruedUsd - a.accruedUsd);

  const totalUsd = out.reduce((s, e) => s + e.accruedUsd, 0);
  const unpaidUsd = out.reduce((s, e) => s + e.unpaidUsd, 0);
  return NextResponse.json({ posts: out, totalUsd, unpaidUsd });
}
