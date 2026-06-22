// ── Cron · Screening Room ranking + SRH awarding (DAILY BACKSTOP) ────────────
//
// On-demand refresh-on-view (/api/screening-room/refresh) is now the PRIMARY path
// that keeps the room live. This daily cron is the harmless free backstop —
// guarantees freshness even with zero traffic. The recompute itself lives in the
// shared lib (recomputeScreeningRoom) so cron + on-demand never drift.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recomputeScreeningRoom } from '@/lib/economy/screeningRoom';

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

  const result = await recomputeScreeningRoom(supabase);
  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}
