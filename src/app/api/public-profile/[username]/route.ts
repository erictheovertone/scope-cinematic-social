// ── GET /api/public-profile/[username] — the logged-out profile payload (Brief ARR-1) ──────────
// The allowlisted PublicProfile and nothing else (see src/lib/arrival/publicProfile.ts). 404 when
// the PUBLIC_PROFILES_ENABLED flag is off or the username doesn't resolve.
import { NextResponse } from 'next/server';
import { publicProfilesEnabled, publicProfileAllowed } from '@/lib/arrival/flag';
import { getPublicProfile } from '@/lib/arrival/publicProfile';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  if (!publicProfilesEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { username } = await params;
  if (!publicProfileAllowed(username)) return NextResponse.json({ error: 'not found' }, { status: 404 }); // ARR-2
  const profile = await getPublicProfile(username);
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(profile, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}
