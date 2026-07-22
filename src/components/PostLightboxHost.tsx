'use client';
// ── PostLightboxHost — the global host for openPostLightbox(postId) ──────────
//
// Mounted once in the provider tree. Listens for scope:open-post, fetches the
// full post row, and renders the ONE unified lightbox (PostModal). Lets the
// collect sheet's media be a tap-through to the post from anywhere (wallet
// holdings, feed, profile) without prop-drilling or import cycles.

import { useEffect, useRef, useState } from 'react';
import PostModal from '@/components/PostModal';
import TheatreMode from '@/components/TheatreMode';
import { getPostById } from '@/lib/postsService';
import { OPEN_POST_EVENT, type PostLightboxContext } from '@/lib/postLightbox';
import { useRotateToTheatre } from '@/lib/useRotateToTheatre';
import { useIsDesktop } from '@/lib/useIsDesktop';

export default function PostLightboxHost() {
  const [post, setPost] = useState<Record<string, unknown> | null>(null);
  const [ctx, setCtx] = useState<PostLightboxContext | null>(null); // Brief M3c §3 — queue context
  const [showTheatre, setShowTheatre] = useState(false);
  const isDesktop = useIsDesktop();
  const theatreIdx = useRef(0); // live theatre index → return the lightbox to the swiped post

  // Brief M3a — rotate-to-theatre for the post view opened from anywhere via
  // openPostLightbox (Screening Room, wallet holdings, collect tap-through). Shares the
  // SAME hook as the profile post-scroll. Gated to non-desktop so a desktop window RESIZE
  // can't mis-fire (this host is globally mounted). Rotating back to portrait exits
  // theatre; the PostModal stays mounted underneath → return-to-origin (the SR post view).
  const { enteredViaRotation } = useRotateToTheatre({
    enabled: !isDesktop && !!post,
    isOpen: showTheatre,
    onEnter: () => setShowTheatre(true),
  });

  // Brief M3b — mark the DOM while a post view is up so the Screening Room's OWN main
  // rotate hook (mounted underneath) yields: an opened post rotates into THIS host's
  // theatre (now queue-aware, §3), not a second SR lineup theatre. Two hooks, one wins.
  useEffect(() => {
    if (!post) return;
    document.documentElement.dataset.postLightboxOpen = '1';
    return () => { delete document.documentElement.dataset.postLightboxOpen; };
  }, [post]);

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { postId?: string; ctx?: PostLightboxContext } | undefined;
      const postId = detail?.postId;
      if (!postId) return;
      try {
        const p = await getPostById(postId);
        if (p) { setShowTheatre(false); setCtx(detail?.ctx ?? null); setPost(p as unknown as Record<string, unknown>); }
      } catch (err) {
        console.error('[PostLightboxHost] load error:', err);
      }
    };
    window.addEventListener(OPEN_POST_EVENT, handler);
    return () => window.removeEventListener(OPEN_POST_EVENT, handler);
  }, []);

  if (!post) return null;

  // Brief M3c §3 — theatre swipes the whole queue when a context was supplied (SR lineup),
  // else the single opened post (wallet / collect tap-through, unchanged). On exit, land
  // the lightbox on whichever post was last viewed in theatre (origin + position continuity).
  const theatrePosts = ctx?.posts?.length ? ctx.posts : [post];
  const theatreStart = ctx ? (ctx.startIndex ?? 0) : 0;
  const closeTheatre = () => {
    setShowTheatre(false);
    if (ctx?.posts?.length) { const p = ctx.posts[theatreIdx.current]; if (p) setPost(p); }
  };

  return (
    <>
      <PostModal post={post as any} onClose={() => { setShowTheatre(false); setCtx(null); setPost(null); }} />
      {showTheatre && (
        <TheatreMode
          posts={theatrePosts}
          ranks={ctx?.ranks}
          startIndex={theatreStart}
          source={ctx?.source ?? 'feed'}
          exitOnPortrait={enteredViaRotation.current}
          onIndexChange={(i) => { theatreIdx.current = i; }}
          onClose={closeTheatre}
        />
      )}
    </>
  );
}
