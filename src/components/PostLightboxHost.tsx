'use client';
// ── PostLightboxHost — the global host for openPostLightbox(postId) ──────────
//
// Mounted once in the provider tree. Listens for scope:open-post, fetches the
// full post row, and renders the ONE unified lightbox (PostModal). Lets the
// collect sheet's media be a tap-through to the post from anywhere (wallet
// holdings, feed, profile) without prop-drilling or import cycles.

import { useEffect, useState } from 'react';
import PostModal from '@/components/PostModal';
import { getPostById } from '@/lib/postsService';
import { OPEN_POST_EVENT } from '@/lib/postLightbox';

export default function PostLightboxHost() {
  const [post, setPost] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const handler = async (e: Event) => {
      const postId = (e as CustomEvent).detail?.postId as string | undefined;
      if (!postId) return;
      try {
        const p = await getPostById(postId);
        if (p) setPost(p as unknown as Record<string, unknown>);
      } catch (err) {
        console.error('[PostLightboxHost] load error:', err);
      }
    };
    window.addEventListener(OPEN_POST_EVENT, handler);
    return () => window.removeEventListener(OPEN_POST_EVENT, handler);
  }, []);

  if (!post) return null;
  return <PostModal post={post as any} onClose={() => setPost(null)} />;
}
