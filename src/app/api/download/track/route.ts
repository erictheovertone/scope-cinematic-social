// ── GET /api/download/track?id= — the composer's delivered file, Augmented only (AUG-1 §3) ───────
// Every music download carries the sync license (the client shows /legal/sync-license with it).
import { gatedDownload } from '@/lib/downloadGate';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  return gatedDownload(req, 'track', id, async (supabase, trackId) => {
    const { data } = await supabase
      .from('tracks').select('file_url, title, status').eq('id', trackId).maybeSingle();
    if (!data || data.status !== 'approved') return null;
    return { fileUrl: data.file_url as string, filename: data.title as string };
  });
}
