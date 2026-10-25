// ── /api/post-media/delete — server-side deletion of a post's media object ───
//
// WHY SERVER-SIDE (Brief SEC-0 §2c, finding SEC-F2): the 'post-media' bucket
// carried a blanket anon DELETE policy (USING bucket_id only) — ANY anonymous
// caller with the public anon key could wipe EVERY image/video on the platform.
// That policy is dropped. The one legitimate browser delete — PostModal
// replacing a post's poster image — moves here. The service-role key bypasses
// storage RLS by design (the app's server-side-key posture; see stacks/hero-upload).
//
// GUARD: the claimed user must OWN the post, and `path` must be an object THIS
// post actually references (its current poster/media) — never a free-form object
// elsewhere in the bucket. Full cryptographic identity lands with SEC-1; this is
// the Phase-0 claimed-owner + DB-relation guard, consistent with the codebase.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const objPath = (u: string | null | undefined): string =>
  u ? (u.split('/post-media/')[1] ?? '').split('?')[0] : '';

export async function POST(req: NextRequest) {
  const { userId, postId, path } = await req.json().catch(() => ({} as Record<string, string>));
  if (!userId || !postId || !path) {
    return NextResponse.json({ error: 'userId, postId, path required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Ownership guard — the post must exist and belong to the claimed user.
  const { data: post } = await supabase
    .from('posts')
    .select('user_id, thumbnail_url, media_urls')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });
  if (post.user_id !== userId) return NextResponse.json({ error: 'not your post' }, { status: 403 });

  // The target must be an object this post references (its old poster, swapped out
  // just before the posts.thumbnail_url update, or one of its media) — not arbitrary.
  const refs = new Set<string>();
  if (post.thumbnail_url) refs.add(objPath(post.thumbnail_url));
  for (const u of (post.media_urls ?? []) as string[]) refs.add(objPath(u));
  const target = String(path).split('?')[0];
  if (!target || !refs.has(target)) {
    return NextResponse.json({ error: 'path is not an object of this post' }, { status: 403 });
  }

  const { error } = await supabase.storage.from('post-media').remove([target]);
  if (error) {
    console.error('[post-media/delete] remove failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
