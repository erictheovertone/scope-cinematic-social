// ── GET /api/version — the running deployment's build SHA (Brief ARR-8 §6) ──────────────────────
// The app is a standalone PWA with NO service worker, and warm foreground returns never reload, so a
// member can run a stale client bundle for days after a deploy (Eric's 11/2 pre-ARR-7 Arrival). The
// client polls THIS route and reloads when the SHA moves. force-dynamic + no-store so it is never
// cached and always reflects whatever deployment serves it.
//
// Skew Protection note: the project versions ASSETS with ?dpl=<deploymentId>, but responses set no
// __vdpl cookie — dynamic requests are NOT pinned. A plain no-store fetch to this route (the client
// adds no ?dpl) reaches the LIVE deployment, so the SHA moves on deploy and the check works.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
  return NextResponse.json(
    { sha },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
  );
}
