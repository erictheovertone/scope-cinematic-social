// ── POST /api/renditions ──────────────────────────────────────────────────────
// Body: { masterUrl }. Bakes the 600/1600 WebP renditions for a just-uploaded
// post-media master using sharp (server-side — reliable WebP, unlike the client
// canvas which fell back to bloated PNGs). Fire-and-forget from the publish flow;
// a failure just means that image rides the master via the onError fallback.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bakeRenditionsFromUrl } from '@/lib/renditionsServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { masterUrl?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const masterUrl = body.masterUrl;
  if (!masterUrl || !masterUrl.includes('/storage/v1/object/public/post-media/')) {
    return NextResponse.json({ error: 'masterUrl must be a post-media public object URL' }, { status: 400 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const results = await bakeRenditionsFromUrl(supabase, masterUrl);
  // Brief P0 §2b — flag the post so the CLIENT requests a rendition only once the 600
  // display tier actually exists. Until then (or if baking failed) the post rides its
  // master directly: no 404'd `.webp`, so no fallback-to-master decode storm on the
  // post scroll. Best-effort; the onError fallback still covers a stale/missing flag.
  const ok600 = results.some((r) => r.width === 600 && r.ok);
  let flagged = false;
  if (ok600) {
    try {
      const { error } = await supabase.from('posts').update({ media_has_renditions: true }).contains('media_urls', [masterUrl]);
      flagged = !error;
    } catch { /* flag is best-effort */ }
  }
  return NextResponse.json({ results, flagged });
}
