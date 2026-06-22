// ── On-demand Screening Room refresh (stale-while-revalidate, single-flight) ──
//
// Fired (non-awaited) by the Screening Room page AFTER it renders the cached
// ranking — so the view is never blocked. This route:
//   1. STALENESS — if the cache (max screening_room.computed_at) is younger than
//      THRESHOLD, do nothing (return 'fresh').
//   2. SINGLE-FLIGHT LOCK — atomically claim screening_room_lock (one UPDATE; only
//      ONE caller across all serverless instances wins). If not claimed → 'locked'.
//   3. BACKGROUND RECOMPUTE — return 202 immediately, then run the shared
//      recomputeScreeningRoom in `after()` (Next 16; survives client-abort on
//      Vercel), and release the lock.
//
// Self-throttling: staleness + single-flight ⇒ at most one recompute per ~THRESHOLD
// regardless of call volume, so it's safe to leave callable by the client without
// CRON_SECRET (a browser can't hold the secret anyway). Reuses the HARDENED reads.
//
// Pre-migration safety: if screening_room_lock doesn't exist, the claim errors →
// treated as 'not claimed' → no recompute, no regression (the daily cron carries it).

import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recomputeScreeningRoom } from '@/lib/economy/screeningRoom';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const THRESHOLD_MS = 60_000; // 60s — tunable. Lower = more live, more market reads.
const LOCK_MS = 45_000;      // lock TTL — covers a crashed recompute; auto-expires.

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. STALENESS — newest computed_at across the cached ranking.
  const { data: fresh } = await supabase
    .from('screening_room')
    .select('computed_at')
    .order('computed_at', { ascending: false })
    .limit(1);
  const last = fresh?.[0]?.computed_at ? new Date(fresh[0].computed_at as string).getTime() : 0;
  if (last && Date.now() - last < THRESHOLD_MS) {
    return NextResponse.json({ skipped: 'fresh', ageMs: Date.now() - last });
  }

  // 2. SINGLE-FLIGHT LOCK — atomic claim. The conditional UPDATE is row-locked by
  //    Postgres and re-checks the WHERE under the lock, so exactly one concurrent
  //    caller claims it; the rest match 0 rows.
  const nowIso = new Date().toISOString();
  const lockUntil = new Date(Date.now() + LOCK_MS).toISOString();
  const { data: claimed, error: lockErr } = await supabase
    .from('screening_room_lock')
    .update({ locked_until: lockUntil })
    .eq('id', 1)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .select('id');

  if (lockErr) {
    // Table missing (pre-migration) or transient — degrade gracefully, no recompute.
    console.warn('[sr-refresh] lock claim failed (skipping on-demand):', lockErr.message);
    return NextResponse.json({ skipped: 'lock-unavailable' });
  }
  if (!claimed?.length) {
    return NextResponse.json({ skipped: 'locked' }); // another instance is recomputing
  }

  // 3. BACKGROUND RECOMPUTE — respond now; finish after the response (Next `after`).
  after(async () => {
    try {
      await recomputeScreeningRoom(supabase);
    } catch (e: any) {
      console.error('[sr-refresh] recompute error:', e?.message);
    } finally {
      // Release the lock so the next stale view can refresh promptly (otherwise it
      // would idle until the 45s TTL expires).
      await supabase.from('screening_room_lock').update({ locked_until: null }).eq('id', 1);
    }
  });

  return NextResponse.json({ triggered: true }, { status: 202 });
}
