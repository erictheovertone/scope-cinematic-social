// ── POST /api/music/live-notice — decide + STAMP the "your music is live" notice (Brief MUS-3a) ───
// The notice fired on every login because the stamp was a CLIENT-side profiles.update() under the
// anon key: RLS (Privy auth ≠ a Supabase session, so auth.uid() is null) silently rejected it, and
// the fire-and-forget `void` swallowed the error — the read (public SELECT) still worked, so the
// sheet showed forever. Every other profile write in the app goes through a service-role route; this
// one now does too.
//
// Verified caller (Privy token → users.id). Decision + stamp happen HERE, atomically and server-side:
// if the composer has an approved track whose approval post-dates the stamp (or there's no stamp),
// we STAMP now() by the correct uuid, read the column back, log loudly if it's still null, and return
// show:true exactly once. A later album (approved after the stamp) notifies again — it's a timestamp,
// not a boolean.
import { NextResponse } from 'next/server';
import { callerOf, serviceClient } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  const userId = caller.userId;

  // Newest approved track for this composer.
  const { data: t } = await supabase
    .from('tracks').select('approved_at')
    .eq('composer_user_id', userId).eq('status', 'approved').not('approved_at', 'is', null)
    .order('approved_at', { ascending: false }).limit(1).maybeSingle();
  const approvedAt = (t as { approved_at?: string | null } | null)?.approved_at;
  if (!approvedAt) return NextResponse.json({ show: false });

  // Current stamp.
  const { data: p } = await supabase.from('profiles').select('music_live_notified_at').eq('user_id', userId).maybeSingle();
  const stamp = (p as { music_live_notified_at?: string | null } | null)?.music_live_notified_at;
  const show = Date.parse(approvedAt) > (stamp ? Date.parse(stamp) : 0);
  if (!show) return NextResponse.json({ show: false });

  // STAMP on show (service role → bypasses RLS), then READ IT BACK and log loudly if it didn't land.
  const now = new Date().toISOString();
  const { error: upErr } = await supabase.from('profiles').update({ music_live_notified_at: now }).eq('user_id', userId);
  const { data: after } = await supabase.from('profiles').select('music_live_notified_at').eq('user_id', userId).maybeSingle();
  const landed = (after as { music_live_notified_at?: string | null } | null)?.music_live_notified_at;
  if (upErr || !landed) {
    console.error('[music-live-notice] STAMP DID NOT LAND', { userId, upErr: upErr?.message, readBack: landed ?? null });
  }
  return NextResponse.json({ show: true, stampedAt: landed ?? null });
}
