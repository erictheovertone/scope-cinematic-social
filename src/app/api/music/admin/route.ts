// ── /api/music/admin — the approval queue (Eric-only, service role) ──────────
// GET  ?adminUserId=<caller Privy DID>            → list pending tracks (+ composer handle)
// POST { adminUserId, trackId, action:'approve'|'reject' }
//   approve → status='approved' + approved_at + notify the composer (COMPOSER badge
//             auto-derives from the approved row). reject → status='rejected'.
// Gated: the caller's Privy DID must equal process.env.SCOPE_ADMIN_USER_ID.
import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/adminUser';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const adminUserId = req.nextUrl.searchParams.get('adminUserId');
  if (!isAdminUser(adminUserId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const supabase = svc();
  const { data, error } = await supabase
    .from('tracks')
    .select('id, title, composer_user_id, keywords, duration_seconds, file_url, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'query failed' }, { status: 500 });

  // Enrich each with the composer's handle (composer_user_id → profiles.user_id, both uuid).
  const ids = [...new Set((data ?? []).map((t) => t.composer_user_id))];
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('user_id, username').in('user_id', ids)
    : { data: [] as { user_id: string; username: string }[] };
  const handleByUuid = new Map((profiles ?? []).map((p) => [p.user_id, p.username]));
  const tracks = (data ?? []).map((t) => ({ ...t, composer_handle: handleByUuid.get(t.composer_user_id) ?? null }));
  return NextResponse.json({ tracks });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const adminUserId = String(body.adminUserId ?? '');
  const action = String(body.action ?? '');
  if (!isAdminUser(adminUserId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // Accept a batch (trackIds[]) or a single (trackId) — one code path for both, so
  // APPROVE ALL / REJECT ALL and single decisions behave identically.
  const trackIds: string[] = Array.isArray(body.trackIds)
    ? body.trackIds.map(String).filter(Boolean)
    : (body.trackId ? [String(body.trackId)] : []);
  if (trackIds.length === 0 || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'trackId(s) + action(approve|reject) required' }, { status: 400 });
  }

  const supabase = svc();

  if (action === 'reject') {
    // Silent (matches M1 — a rejection doesn't notify; the composer can resubmit).
    const { error } = await supabase.from('tracks').update({ status: 'rejected', approved_at: null }).in('id', trackIds);
    if (error) return NextResponse.json({ error: 'update failed' }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'rejected', count: trackIds.length });
  }

  // approve the whole set at once
  const { data: approved, error } = await supabase
    .from('tracks')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .in('id', trackIds)
    .select('id, title, composer_user_id');
  if (error) return NextResponse.json({ error: 'update failed' }, { status: 500 });

  // Fire-and-forget: ONE notification per composer per DECISION WAVE (a 12-batch
  // doesn't spam 12 bells). recipient_id is a Privy DID → translate composer uuid →
  // users.privy_id. The badge auto-derives from the approved rows (first-approval
  // award; already-held is a no-op).
  ;(async () => {
    try {
      const byComposer = new Map<string, { count: number; firstTitle: string }>();
      for (const t of approved ?? []) {
        const g = byComposer.get(t.composer_user_id) ?? { count: 0, firstTitle: t.title };
        g.count += 1;
        byComposer.set(t.composer_user_id, g);
      }
      for (const [uuid, g] of byComposer) {
        const { data: composerUser } = await supabase.from('users').select('privy_id').eq('id', uuid).single();
        const did = composerUser?.privy_id;
        if (!did) continue;
        const message = g.count === 1
          ? `Your track "${g.firstTitle}" was approved — you've earned the COMPOSER badge`
          : `${g.count} of your tracks were approved — you've earned the COMPOSER badge`;
        await supabase.from('notifications').insert({
          recipient_id: did, sender_id: adminUserId, sender_username: 'SCOPE',
          sender_avatar: null, type: 'badge', message, is_read: false,
        });
      }
    } catch (e) {
      console.error('composer approval notification error:', e);
    }
  })();

  return NextResponse.json({ ok: true, status: 'approved', count: (approved ?? []).length });
}
