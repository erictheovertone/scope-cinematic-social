// ── Cron · First Cut expiry (lifecycle Change 3b — out-of-app sells) ─────────
//
// The in-app sell hook (/api/first-cut/expire) catches sells done IN the app;
// this cron is the completeness layer for sells done directly on Zora. For each
// ACTIVE slot it samples the holder's on-chain token balance and compares to the
// last sample: a DECREASE (a sell/transfer-out) that leaves the remaining holding
// below the $4.50 keep-floor expires the slot. A pure PRICE drop never triggers
// it (balance unchanged → no decrease). Only ever flips active → expired.
//
// NEVER falsely expires: an unverified balance/price read is skipped (no expiry,
// no sample update). The first sample only establishes a baseline (no prior to
// compare) — so this errs toward MISSING an expiry, never a false revocation.
// Reuses the hardened reads (remainingHoldingUsd retries the price).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { remainingHoldingUsd, FIRST_CUT_CONFIG } from '@/lib/economy/firstCut';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const lc = (s?: string | null) => (s ?? '').toLowerCase();
const EPS = 1e-9; // ignore float noise; a real sell is a meaningful decrease

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const t0 = Date.now();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const keep = FIRST_CUT_CONFIG.minQualifyingUsd;

  // Active slots + holder wallet.
  const { data: rows, error } = await supabase
    .from('first_cut_awards')
    .select('id, user_id, coin_address, rank, last_balance_tokens')
    .is('expired_at', null);
  if (error) return NextResponse.json({ error: 'read failed', detail: error.message }, { status: 500 });

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
  const { data: users } = await supabase.from('users').select('id, wallet_address').in('id', userIds);
  const walletOf = new Map((users ?? []).map((u) => [u.id, lc(u.wallet_address)]));

  let expired = 0, sampled = 0, unresolved = 0, baselined = 0;
  for (const r of rows ?? []) {
    const wallet = walletOf.get(r.user_id);
    if (!wallet) continue;

    const { usd, tokens, resolved } = await remainingHoldingUsd(r.coin_address, wallet);
    if (!resolved) { unresolved++; continue; } // NEVER expire / sample on a flaky read

    const prev = r.last_balance_tokens as number | null;
    const decreased = prev != null && tokens < prev - EPS;

    if (decreased && usd < keep) {
      // Confirmed token-balance decrease leaving the holding below the keep-floor.
      await supabase.from('first_cut_awards').update({ expired_at: new Date().toISOString(), last_balance_tokens: tokens }).eq('id', r.id).is('expired_at', null);
      expired++;
    } else {
      // No expiry — record the current balance for the next run's comparison.
      await supabase.from('first_cut_awards').update({ last_balance_tokens: tokens }).eq('id', r.id);
      if (prev == null) baselined++; else sampled++;
    }
  }

  const summary = { ok: true, ms: Date.now() - t0, active: rows?.length ?? 0, expired, sampled, baselined, unresolved, keep };
  console.log('[first-cut-expiry] done', JSON.stringify(summary));
  return NextResponse.json(summary);
}
