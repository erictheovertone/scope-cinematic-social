// ── POST /api/music/waveform — legacy peak self-heal (service role) ──────────
// { trackId, peaks:number[] }. Fills waveform_peaks ONLY where it's null → the
// backfill is idempotent and can never overwrite real peaks, so no auth is needed
// (a peakless approved track is public; any viewer's decode heals it once).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const trackId = String(body.trackId ?? '');
  const peaks = Array.isArray(body.peaks) ? body.peaks : null;
  if (!trackId || !peaks) return NextResponse.json({ error: 'trackId + peaks required' }, { status: 400 });
  // sanity-bound: numbers in [0,1], reasonable length
  if (peaks.length === 0 || peaks.length > 2000 || !peaks.every((n) => typeof n === 'number' && n >= 0 && n <= 1)) {
    return NextResponse.json({ error: 'bad peaks' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  // Fill only if empty — never overwrite.
  const { error } = await supabase.from('tracks').update({ waveform_peaks: peaks }).eq('id', trackId).is('waveform_peaks', null);
  if (error) { console.error('waveform backfill error:', error); return NextResponse.json({ error: 'update failed' }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
