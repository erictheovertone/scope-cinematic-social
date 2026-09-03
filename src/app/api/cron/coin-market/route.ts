// ── Cron · Coin market-cap cache (Brief Q2) ──────────────────────────────────
//
// Every 5 min: fetch MC for ALL minted coins (batched getCoins) → upsert coin_market_data.
// Ambient-display cache only; collect/trade sheets keep LIVE pricing (never this table).
// The fetch/upsert lives in the shared lib (refreshCoinMarketData) — same hardened getCoins
// read as the screening room, so they never drift.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshCoinMarketData } from '@/lib/economy/coinMarketData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const result = await refreshCoinMarketData(supabase);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    // Never fail loud — a missed refresh just serves the last-good cache (readers dash on stale).
    return NextResponse.json({ ok: false, error: (e as Error)?.message ?? 'unknown' }, { status: 200 });
  }
}
