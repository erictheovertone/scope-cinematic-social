// ── POST /api/funnel — record a client funnel event for the signed-in member (BAL-1h #4) ──────────
// Verified Privy caller → users.id (never the DID). The client never writes the table directly (anon
// RLS denies it); it posts here with its Bearer token. Unknown events are allowed (the set grows).
import { NextResponse } from 'next/server';
import { callerOf, serviceClient } from '@/lib/serverAuth';
import { serverTrack } from '@/lib/funnelServer';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  let b: { event?: unknown; props?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const event = typeof b.event === 'string' ? b.event.slice(0, 64) : null;
  if (!event) return NextResponse.json({ error: 'event required' }, { status: 400 });
  const props = b.props && typeof b.props === 'object' ? (b.props as Record<string, unknown>) : {};
  await serverTrack(supabase, caller.userId, event, props);
  return NextResponse.json({ ok: true });
}
