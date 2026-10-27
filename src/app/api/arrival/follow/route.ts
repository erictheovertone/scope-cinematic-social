// ── POST /api/arrival/follow — complete an Arrival sign-up (Brief ARR-1) ───────────────────────
// Body { username, ref?, follow }. The caller is the VERIFIED Privy DID from the bearer token (never
// a client-supplied id). If `follow`, the caller follows the arrived-at profile; the target's DID is
// resolved here and never returned. `ref` + the username are recorded once on the caller's users
// row for attribution (users.signup_ref / signup_profile — fails soft until that migration runs).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicProfilesEnabled } from '@/lib/arrival/flag';
import { verifyRequest } from '@/lib/privyVerify';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!publicProfilesEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const did = await verifyRequest(req);
  if (!did) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { username?: string; ref?: string | null; follow?: boolean };
  const username = (body.username ?? '').trim();
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(username)) return NextResponse.json({ error: 'bad username' }, { status: 400 });
  const ref = typeof body.ref === 'string' ? body.ref.slice(0, 64).replace(/[^\w.-]/g, '') || null : null;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: prof } = await db.from('profiles').select('user_id, username')
    .ilike('username', username.replace(/[%_]/g, (m) => `\\${m}`)).maybeSingle();
  if (!prof?.user_id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data: target } = await db.from('users').select('privy_id').eq('id', prof.user_id).maybeSingle();

  let following = false;
  if (body.follow && target?.privy_id && target.privy_id !== did) {
    const { data: existing } = await db.from('follows').select('id')
      .eq('follower_id', did).eq('following_id', target.privy_id).maybeSingle();
    if (existing) following = true;
    else following = !(await db.from('follows').insert({ follower_id: did, following_id: target.privy_id })).error;
  }

  // Attribution — first arrival wins; tolerant of the columns not existing yet.
  await db.from('users').update({ signup_ref: ref ?? 'arrival', signup_profile: prof.username })
    .eq('privy_id', did).is('signup_profile', null)
    .then(() => undefined, () => undefined);

  return NextResponse.json({ username: prof.username, following });
}
