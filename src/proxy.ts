// ── Arrival gate (Brief ARR-3b) ────────────────────────────────────────────────────────────────
// The dynamic-param route /[username] gets baked into a static 404 at build time on Vercel even
// with the flag on and a fresh build (confirmed: a =1 build 404s /overtone while /arrival?u=overtone
// 200s under the SAME build). So the request-time gate lives here instead, on the Node runtime where
// server env (PUBLIC_PROFILES_ENABLED / _ALLOWLIST) is readable — Edge middleware could not read it.
//
// Only an ALLOWLISTED single-segment path is rewritten to /arrival?u=<username> (which is dynamic —
// searchParams force it per-request, so it never prerenders). Everything else passes through:
//   • reserved root routes (/welcome, /profile, …) → their real route (a reserved name is never on
//     the curated allowlist, so this is safe even before the single-segment check);
//   • a disallowed username (/anyotheruser) → /[username] → notFound()/baked 404 (today's behaviour).
import { NextResponse, type NextRequest } from 'next/server';
import { publicProfilesEnabled, publicProfileAllowed } from '@/lib/arrival/flag';

export const config = {
  // Skip Next internals, API routes, the /arrival target itself, and any path with a file extension.
  matcher: ['/((?!_next/|_vercel/|api/|arrival|.*\\.).*)'],
};

export default function proxy(req: NextRequest) {
  const seg = req.nextUrl.pathname.match(/^\/([^/]+)\/?$/)?.[1]; // single segment only
  if (!seg) return NextResponse.next();
  const username = decodeURIComponent(seg);
  if (!publicProfilesEnabled() || !publicProfileAllowed(username)) return NextResponse.next();
  const url = req.nextUrl.clone(); // keeps ?ref= for sign-up attribution
  url.pathname = '/arrival';
  url.searchParams.set('u', username);
  return NextResponse.rewrite(url);
}
