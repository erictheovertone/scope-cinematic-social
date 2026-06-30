// ── /api/recap — WHILE YOU WERE AWAY data layer (server-only, READ-ONLY) ──────
//
// Real earnings from on-chain reads with ZERO instrumentation of the trade/collect
// flow: per owned coin we page getCoinSwaps (newest-first) back to last_seen, count
// BUYs by OTHERS, sum their USD volume (reusing swapUsd from firstCut.ts), and the
// creator's cut = volume × CREATOR_FEE_RATE. Social comes from notifications since
// last_seen. getCoinSwaps needs the Zora API key → must be server-side.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCoinSwaps, setApiKey } from '@zoralabs/coins-sdk';
import { swapUsd } from '@/lib/economy/firstCut';
import { CREATOR_FEE_RATE, type Recap, type RecapBreakdownRow } from '@/lib/economy/recap';

export const dynamic = 'force-dynamic';

const BASE_CHAIN = 8453;
const SWAP_PAGE = 100;
const RECAP_MAX_PAGES = 6;        // bound per-coin pagination (recent cutoff → usually ~1 page)
const DEFAULT_LOOKBACK_DAYS = 7;  // when last_seen is unknown (first run / column not yet added)
const DAY_MS = 86_400_000;

const lc = (s?: string | null) => (s ?? '').toLowerCase();

let _keyed = false;
function ensureKey() {
  if (!_keyed && process.env.ZORA_API_KEY) { setApiKey(process.env.ZORA_API_KEY); _keyed = true; }
}

function thumbOf(p: {
  media_type?: string | null; poster_url?: string | null;
  thumbnail_url?: string | null; media_urls?: string[] | null;
}): string | null {
  if (p?.media_type === 'video') return p.poster_url ?? p.thumbnail_url ?? p.media_urls?.[0] ?? null;
  return p?.thumbnail_url ?? p.media_urls?.[0] ?? null;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');           // posts.user_id = Supabase UUID
  const sinceParam = req.nextUrl.searchParams.get('since');        // optional ISO override (testing)
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // user → privy_id (social tables/notifications are keyed by Privy DID, not UUID)
  const { data: userRow } = await supabase
    .from('users').select('id, privy_id').eq('id', userId).maybeSingle();
  const privyId: string | null = userRow?.privy_id ?? null;

  // cutoff = explicit since > profiles.last_seen_at > default lookback
  let lastSeen: string | null = sinceParam;
  if (!lastSeen) {
    const { data: prof } = await supabase
      .from('profiles').select('last_seen_at').eq('user_id', userId).maybeSingle();
    lastSeen = (prof as { last_seen_at?: string | null } | null)?.last_seen_at ?? null;
  }
  const cutoffMs = lastSeen ? Date.parse(lastSeen) : Date.now() - DEFAULT_LOOKBACK_DAYS * DAY_MS;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const sinceDays = Math.max(1, Math.round((Date.now() - cutoffMs) / DAY_MS));

  // owned coin posts (reuse the collector cron's coin_address/creator_address pattern)
  const { data: posts } = await supabase
    .from('posts')
    .select('id, coin_address, creator_address, ticker, media_type, poster_url, thumbnail_url, media_urls')
    .eq('user_id', userId)
    .eq('token_standard', 'coin')
    .not('coin_address', 'is', null);

  ensureKey();

  const rows: RecapBreakdownRow[] = [];
  for (const p of posts ?? []) {
    const creator = lc(p.creator_address);
    let after: string | undefined;
    let collectCount = 0;
    let volumeUsd = 0;
    let pastCutoff = false;

    for (let page = 0; page < RECAP_MAX_PAGES && !pastCutoff; page++) {
      let res: { data?: { zora20Token?: { swapActivities?: { edges?: { node?: Record<string, unknown> }[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } } } };
      try {
        res = await getCoinSwaps({ address: p.coin_address as `0x${string}`, chain: BASE_CHAIN, first: SWAP_PAGE, after }) as typeof res;
      } catch { break; } // one coin's failure must not sink the whole recap
      const sa = res?.data?.zora20Token?.swapActivities;
      const edges = sa?.edges ?? [];
      for (const e of edges) {
        const n = e?.node as { blockTimestamp?: string; activityType?: string; senderAddress?: string } | undefined;
        if (!n) continue;
        // Newest-first feed → once we cross the cutoff, everything after is older too.
        if (Date.parse(n.blockTimestamp ?? '') <= cutoffMs) { pastCutoff = true; continue; }
        if (n.activityType !== 'BUY') continue;
        if (lc(n.senderAddress) === creator) continue; // exclude creator self-buys (earned from OTHERS)
        collectCount += 1;
        volumeUsd += swapUsd(n);
      }
      if (pastCutoff || !(sa?.pageInfo?.hasNextPage && sa?.pageInfo?.endCursor)) break;
      after = sa.pageInfo.endCursor;
    }

    rows.push({
      postId: p.id,
      ticker: p.ticker ?? null,
      thumbnailUrl: thumbOf(p),
      collectCount,
      volumeUsd,
      proceeds: volumeUsd * CREATOR_FEE_RATE,
    });
  }

  // Top earners first; only posts with collects since last_seen appear.
  const breakdown = rows.filter((r) => r.collectCount > 0).sort((a, b) => b.proceeds - a.proceeds);
  const earned = breakdown.reduce((s, r) => s + r.proceeds, 0);

  // Social — counts since last_seen via notifications (recipient = the user's Privy DID).
  const socialCount = async (type: 'follow' | 'comment' | 'like'): Promise<number> => {
    if (!privyId) return 0;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', privyId)
      .eq('type', type)
      .gt('created_at', cutoffIso);
    return count ?? 0;
  };
  const [follows, comments, likes] = await Promise.all([
    socialCount('follow'), socialCount('comment'), socialCount('like'),
  ]);

  const social = { follows, comments, likes };
  const hasActivity = breakdown.length > 0 || follows + comments + likes > 0;

  const recap: Recap = {
    sinceDays,
    hero: { earned, postCount: breakdown.length },
    breakdown,
    social,
    hasActivity,
  };
  return NextResponse.json(recap);
}
