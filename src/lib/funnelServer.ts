// ── funnelServer — the ONE server-side funnel write (BAL-1h #4) ──────────────────────────────────
// Service-role insert into funnel_events, keyed by the Supabase users.id UUID. Used by the /api/funnel
// route (client events, caller resolved from the Privy token) and by the onramp webhook (server-to-
// server, userId from the session metadata). AWAITED + error-logged — never a fire-and-forget builder
// (MUS-3a / the check-void-supabase guard).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function serverTrack(
  supabase: SupabaseClient,
  userId: string | null,
  event: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from('funnel_events').insert({ user_id: userId, event, props });
  if (error) console.error('[funnel] insert failed', { event, userId, error: error.message });
}
