// ── POST /api/music/notify-admin — "N tracks submitted for review" ───────────
// Fired ONCE per batch by the client AFTER the per-track submits land (aggregated —
// never 12 bells). Deliberately OFF the submit critical path: the submission has
// already succeeded, so this alert can never sink it (critical-path-takes-no-
// passengers). No-op when no admin is configured.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminUserId } from '@/lib/adminUser';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const count = Math.max(0, Math.floor(Number(body.count) || 0));
  const admin = getAdminUserId();
  if (count < 1 || !admin) return NextResponse.json({ ok: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.from('notifications').insert({
    recipient_id: admin, sender_id: admin, sender_username: 'SCOPE',
    type: 'market', message: `${count} track${count > 1 ? 's' : ''} submitted for review`, is_read: false,
  });
  if (error) console.warn('[contrib] admin alert failed:', error.message);
  return NextResponse.json({ ok: true });
}
