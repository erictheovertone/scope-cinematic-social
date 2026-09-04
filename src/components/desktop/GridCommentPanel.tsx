'use client';

// ── GridCommentPanel (Brief D8 §2b) — the floating comment panel for the desktop ─
// profile grid hover. Anchored beside a cell (right by default, flips left for the
// rightmost column / shell overflow). REUSES the existing comment engine —
// CommentList + ReplyComposer + useCommentLikes (the same components the desktop
// lightbox renders), plus the existing service handlers (getPostComments /
// addComment / replyToComment). No new comments UI; only the thin fetch + composer
// glue is local (a deliberate choice over refactoring the working lightbox, whose
// comment-count + focus-ref are entangled — see the brief report). Comment/reply
// LOGIC is the existing handlers.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { getPostComments, addComment } from '@/lib/postsService';
import { replyToComment } from '@/lib/commentInteractions';
import CommentList, { ReplyComposer, useCommentLikes, type UIComment } from '@/components/CommentList';

const SKB: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export interface GridPanelViewer { uuid: string; name: string; avatar: string | null }

export const GRID_PANEL_WIDTH = 320;

export default function GridCommentPanel({
  postId, viewer, userDid, left, top, side, onClose, onCountChange,
}: {
  postId: string;
  viewer: GridPanelViewer | null;
  userDid: string | null;
  left: number;
  top: number;
  side: 'left' | 'right';
  onClose: () => void;
  /** Reports the live comment count so the cell's hover gradient can update. */
  onCountChange?: (n: number) => void;
}) {
  const router = useRouter();
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [comments, setComments] = useState<{ id?: string; username?: string; content?: string; created_at?: string; parent_comment_id?: string | null; profile_image_url?: string | null }[]>([]);
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<UIComment | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { likeStates, toggleLike: toggleCommentLike } = useCommentLikes(comments as UIComment[], userDid, viewer?.name ?? null);

  useEffect(() => { setMounted(true); }, []);

  // Fetch comments + real commenter avatars (one batched profiles read) — mirrors the
  // lightbox's comments branch, scoped to this post.
  useEffect(() => {
    let dead = false;
    if (!postId) return;
    getPostComments(postId).then(async (c) => {
      if (dead) return;
      setComments(c as typeof comments);
      const names = [...new Set((c as { username?: string }[]).map((x) => x.username).filter(Boolean))] as string[];
      if (names.length) {
        const { supabase } = await import('@/lib/supabase/client');
        const { data } = await supabase.from('profiles').select('username, profile_image_url').in('username', names);
        if (!dead) setAvatars(new Map((data ?? []).filter((p) => p.profile_image_url).map((p) => [p.username as string, p.profile_image_url as string])));
      }
    }).catch(() => {});
    return () => { dead = true; };
  }, [postId]);

  // Report the count only when it actually changes — onCountChange is a fresh closure
  // each parent render, so a ref guard prevents a setState→render→setState loop.
  const lastCount = useRef(-1);
  useEffect(() => {
    if (comments.length !== lastCount.current) { lastCount.current = comments.length; onCountChange?.(comments.length); }
  }, [comments.length, onCountChange]);

  // Dismiss: Escape, or a mousedown outside the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  const submitComment = async () => {
    const text = newComment.trim();
    if (!text || !userDid || !viewer) return;
    setNewComment('');
    setComments((prev) => [...prev, { id: `tmp-${prev.length}`, username: viewer.name, content: text, created_at: new Date().toISOString() }]);
    try { await addComment(postId, userDid, viewer.name, text); } catch { /* keep optimistic */ }
  };

  const submitReply = async (text: string) => {
    if (!userDid || !viewer || !replyingTo) return;
    const parentId = replyingTo.parent_comment_id ? replyingTo.parent_comment_id : replyingTo.id;
    setComments((prev) => [...prev, { id: `tmp-${prev.length}`, username: viewer.name, content: text, created_at: new Date().toISOString(), parent_comment_id: parentId, profile_image_url: viewer.avatar ?? undefined } as typeof prev[number]]);
    try { await replyToComment(postId, parentId as string, userDid, viewer.name, text); } catch (e) { throw e; }
  };

  const enterTransform = useMemo(() => (side === 'right' ? 'translateX(-6px)' : 'translateX(6px)'), [side]);

  return createPortal(
    <div
      ref={panelRef}
      id="grid-comment-panel"
      data-swipe-exclude
      style={{
        position: 'fixed', left, top, width: GRID_PANEL_WIDTH, maxHeight: '70vh', zIndex: 400,
        display: 'flex', flexDirection: 'column', background: 'var(--canvas)',
        border: '0.5px solid rgba(229,225,219,0.3)', borderRadius: 3, overflow: 'hidden',
        boxShadow: '0 16px 44px rgba(0,0,0,0.6)',
        opacity: mounted ? 1 : 0, transform: mounted || reduced ? 'translateX(0)' : enterTransform,
        transition: reduced ? 'none' : 'opacity 150ms ease, transform 150ms cubic-bezier(0.16,0.84,0.3,1)',
      }}
    >
      {/* header — COMMENTS (N) + close */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px 9px', borderBottom: '0.5px solid rgba(229,225,219,0.12)', flexShrink: 0 }}>
        <p style={{ ...SKB, fontSize: 11, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)', margin: 0 }}>COMMENTS ( {comments.length} )</p>
        <button onClick={onClose} aria-label="Close comments" style={{ background: 'transparent', border: 'none', cursor: 'pointer', ...SKR, fontSize: 16, color: 'rgba(229,225,219,0.5)', lineHeight: 1, padding: 2 }}>×</button>
      </div>

      {/* scroll body — the reused CommentList engine */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px' }}>
        {comments.length === 0 ? (
          <p style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.4)', margin: '10px 2px', letterSpacing: 'var(--track-body)' }}>No comments yet.</p>
        ) : (
          <CommentList
            comments={comments as UIComment[]}
            variant="desktop"
            desktopLightbox={false}
            likeStates={likeStates}
            onToggleLike={toggleCommentLike}
            onReply={(c) => setReplyingTo(c)}
            onProfile={(h) => router.push('/profile/' + h)}
            viewerDid={userDid}
            avatarUrl={(c) => (c.username ? avatars.get(c.username) ?? null : null) ?? c.profile_image_url ?? null}
          />
        )}
      </div>

      {/* composer */}
      <div style={{ padding: '8px 12px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(229,225,219,0.05)', padding: '0 8px' }}>
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); e.stopPropagation(); }}
            placeholder="Add a comment..."
            aria-label="Add a comment"
            style={{ ...SKR, flex: 1, fontSize: 13, color: '#E5E1DB', background: 'transparent', border: 'none', outline: 'none', WebkitAppearance: 'none', appearance: 'none', padding: '8px 2px', letterSpacing: 'var(--track-body)', caretColor: '#E5E1DB' }}
          />
          <button onClick={submitComment} aria-label="Send" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.7)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </button>
        </div>
      </div>

      {replyingTo && (
        <ReplyComposer parent={replyingTo} variant="desktop" onClose={() => setReplyingTo(null)} onSubmit={submitReply} />
      )}
    </div>,
    document.body,
  );
}
