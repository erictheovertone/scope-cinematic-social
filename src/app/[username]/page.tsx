// ── /[username] — the public profile (Brief ARR-1) ─────────────────────────────────────────────
// Behind PUBLIC_PROFILES_ENABLED (server env, default off). Off → notFound() for everyone, exactly
// today's behaviour. On: a visitor carrying a Privy session cookie is sent to the normal profile;
// anyone else gets the server-rendered Arrival page, fed ONLY by the allowlisted getPublicProfile.
// ?ref= rides through to sign-up for attribution.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Arrival from '@/components/arrival/Arrival';
import { publicProfilesEnabled, publicProfileAllowed } from '@/lib/arrival/flag';
import { getPublicProfile } from '@/lib/arrival/publicProfile';
import { getArrivalLoginMethods } from '@/lib/arrival/loginMethods';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ ref?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const uname = (await params).username;
  if (!publicProfilesEnabled() || !publicProfileAllowed(uname)) return {};
  const profile = await getPublicProfile(uname);
  if (!profile) return {};
  const name = profile.username.toLowerCase();
  const title = `${name} on Scope`;
  const description = `${profile.framesCount} frame${profile.framesCount === 1 ? '' : 's'} · scopeapp.world`;
  // og:image comes from the colocated opengraph-image route (the 3-frame strip).
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://scopeapp.world'),
    title,
    description,
    openGraph: { title, description, type: 'profile', siteName: 'Scope', url: `/${name}` },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function PublicProfilePage({ params, searchParams }: Props) {
  if (!publicProfilesEnabled()) notFound();
  const { username } = await params;
  if (!publicProfileAllowed(username)) notFound(); // ARR-2 — non-allowlisted → 404 as today
  const [profile, loginMethods] = await Promise.all([getPublicProfile(username), getArrivalLoginMethods()]);
  if (!profile) notFound();

  const jar = await cookies();
  if (jar.get('privy-session') || jar.get('privy-token')) redirect(`/profile/${encodeURIComponent(profile.username)}`);

  const ref = (await searchParams).ref;
  const refTag = (Array.isArray(ref) ? ref[0] : ref)?.slice(0, 64) ?? null;
  return <Arrival profile={profile} refTag={refTag} loginMethods={loginMethods} />;
}
