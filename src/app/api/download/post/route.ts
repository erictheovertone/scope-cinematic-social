// ── GET /api/download/post?id= — the baked master of a post, Augmented only (AUG-1 §3) ───────────
import { gatedDownload } from '@/lib/downloadGate';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  return gatedDownload(req, 'post', id, async (supabase, postId) => {
    const { data } = await supabase
      .from('posts').select('media_urls, caption, username, is_deleted').eq('id', postId).maybeSingle();
    if (!data || data.is_deleted) return null;
    return { fileUrl: (data.media_urls as string[] | null)?.[0] ?? null, filename: `${data.username ?? 'scope'} ${postId.slice(0, 8)}` };
  });
}
