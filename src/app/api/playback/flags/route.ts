// ── GET /api/playback/flags → { graded: boolean } ────────────────────────────────────────────────
// VID-2c — resolves graded WebGL playback for THE VIEWER at runtime, server-side, from the env var
// GRADED_PLAYBACK_ALLOWLIST (comma usernames, case-insensitive, "*" = everyone incl. signed-out,
// unset = off). The list NEVER reaches the client — only this boolean does. Flip it in Vercel and
// Redeploy; no code change.
//
// Username resolution (the DID landmine): the Privy token's `sub` is a DID. users.privy_id = DID →
// users.id (UUID) → profiles.user_id (UUID) → profiles.username. NEVER compare a DID to the allowlist.
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyRequest } from '@/lib/privyVerify';
import { gradedAllowlistAllows } from '@/lib/gradedPlayback';

export const dynamic = 'force-dynamic'; // runtime env read — never prerender/cache

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const list = process.env.GRADED_PLAYBACK_ALLOWLIST ?? '';
  const trimmed = list.trim();

  // "*" admits everyone, including signed-out — no token or DB round-trip needed.
  if (trimmed === '*') return NextResponse.json({ graded: true }, { headers: noStore });
  // unset / empty → off for everyone.
  if (!trimmed) return NextResponse.json({ graded: false }, { headers: noStore });

  // Named list → resolve this viewer's username. No valid token → signed-out → off.
  const did = await verifyRequest(req);
  if (!did) return NextResponse.json({ graded: false }, { headers: noStore });

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    // DID → users.id (UUID). users.privy_id stores the DID.
    const { data: userRow } = await supabase.from('users').select('id').eq('privy_id', did).maybeSingle();
    if (!userRow?.id) return NextResponse.json({ graded: false }, { headers: noStore });
    // users.id (UUID) → profiles.username.
    const { data: profile } = await supabase.from('profiles').select('username').eq('user_id', userRow.id).maybeSingle();
    const graded = gradedAllowlistAllows(profile?.username, list);
    return NextResponse.json({ graded }, { headers: noStore });
  } catch {
    return NextResponse.json({ graded: false }, { headers: noStore });
  }
}
