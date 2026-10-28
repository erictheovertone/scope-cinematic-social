// ── /arrival?u=<username> — the Arrival renderer (Brief ARR-3b) ────────────────
// The dynamic-param route /[username] kept getting baked into a static 404 on Vercel at build
// time (the flag was on and the API worked, but the page served a prerendered not-found for every
// username). A STATIC route that reads a SEARCHPARAM is always dynamic — Next never prerenders it —
// so Arrival renders here instead, and the request-time gate (flag + allowlist) lives in the proxy,
// which rewrites /[username] → /arrival?u=<username> for allowed names and 404s the rest.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Arrival from '@/components/arrival/Arrival';
import { getPublicProfile } from '@/lib/arrival/publicProfile';
import { getArrivalLoginMethods } from '@/lib/arrival/loginMethods';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ u?: string; ref?: string | string[] }> };

// The proxy rewrites /<username> → /arrival?u=<username>, so the public URL's unfurl metadata is
// produced here. og:image points at the colocated /[username]/opengraph-image route (the 3-frame strip).
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const uname = ((await searchParams).u ?? '').trim();
  const profile = uname ? await getPublicProfile(uname) : null;
  if (!profile) return {};
  const name = profile.username.toLowerCase();
  const title = `${name} on Scope`;
  const description = `${profile.framesCount} frame${profile.framesCount === 1 ? '' : 's'} · scopeapp.world`;
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://scopeapp.world'),
    title,
    description,
    openGraph: { title, description, type: 'profile', siteName: 'Scope', url: `/${name}`, images: [`/${name}/opengraph-image`] },
    twitter: { card: 'summary_large_image', title, description, images: [`/${name}/opengraph-image`] },
  };
}

export default async function ArrivalPage({ searchParams }: Props) {
  const sp = await searchParams;
  const username = (sp.u ?? '').trim();
  const jar = await cookies();
  const [profile, loginMethods] = await Promise.all([username ? getPublicProfile(username) : Promise.resolve(null), getArrivalLoginMethods()]);

  // A logged-in visitor goes to the normal profile.
  if (jar.get('privy-session') || jar.get('privy-token')) redirect(`/profile/${encodeURIComponent(profile?.username ?? username)}`);

  // A genuinely-missing (but allowlisted) user — rare; the proxy already gated flag + allowlist.
  if (!profile) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#E5E1DB', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, letterSpacing: '0.04em' }}>
        <div style={{ width: 15, height: 15, borderRadius: '50%', background: '#FF0000', marginRight: 10 }} />Not found
      </div>
    );
  }

  const refTag = (Array.isArray(sp.ref) ? sp.ref[0] : sp.ref)?.slice(0, 64) ?? null;
  return <Arrival profile={profile} refTag={refTag} loginMethods={loginMethods} />;
}
