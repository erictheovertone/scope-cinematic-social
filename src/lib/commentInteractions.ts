// ── src/lib/commentInteractions.ts — comment likes + one-level replies ────────
//
// CLIENT-SIDE by design (reported to Eric, this is the cleaner path): comments
// and likes are PUBLIC and already written from the browser via the anon key
// under permissive RLS (see postsService.addComment / likePost). Comment likes
// and replies are exactly as public, so they follow the SAME posture — no server
// route, no service-role key. Routing them server-side would diverge from the
// established comment pattern for zero privacy gain. (DMs are the opposite case:
// private → server-only. See src/lib/dm.ts.)
//
// IDENTITY CONVENTION (matches likes/comments): `userId` here is the actor's
// Privy DID (user.id), and comments.user_id / comment_likes.user_id store that
// DID. A comment's author is therefore addressable for notifications directly by
// comment.user_id (already a DID — no uuid translation needed, unlike post
// owners).

import { supabase } from './supabase/client';

// Image thumbnail for a notification (video → baked poster, never the .mp4).
function notifThumb(p: { media_type?: string | null; poster_url?: string | null; thumbnail_url?: string | null; media_urls?: string[] | null }): string | null {
  if (p?.media_type === 'video') return p.poster_url ?? p.thumbnail_url ?? null;
  return p?.media_urls?.[0] ?? p?.thumbnail_url ?? null;
}

export interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;               // actor's Privy DID
  username: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
}

/** Batch like-state for a set of comments: total likes + whether `userId` liked. */
export interface CommentLikeState {
  count: number;
  likedByMe: boolean;
}

// ── Likes ─────────────────────────────────────────────────────────────────────

/**
 * Like a comment (idempotent — a duplicate is swallowed). Writes a SOCIAL
 * notification to the comment's author unless it's a self-like. Returns the
 * optimistic shape { liked: true }.
 */
export const likeComment = async (
  commentId: string,
  userId: string,
  username: string,
): Promise<{ liked: true }> => {
  const { error } = await supabase
    .from('comment_likes')
    .insert({ comment_id: commentId, user_id: userId });
  // 23505 = unique_violation → already liked; treat as success (idempotent).
  if (error && error.code !== '23505') {
    console.error('Error liking comment:', error);
    throw error;
  }

  // Fire-and-forget notification to the comment's author.
  // NOTE (F5-6a2): comment_like notifications have NEVER landed while the sibling
  // `reply` path lands fine. The two inserts are column-identical, so the defect is a
  // runtime VALUE/constraint the fire-and-forget swallow hid. TEMPORARY instrumentation
  // added at BOTH failure surfaces (comment lookup + the insert's returned error, which
  // Supabase returns rather than throws) so a single repro names the culprit. Remove/
  // downgrade the [comment_like notif] logs once the fix is confirmed. The IIFE stays
  // detached — logging only; the like itself is never blocked.
  ;(async () => {
    try {
      const { data: comment, error: lookupErr } = await supabase
        .from('comments').select('user_id, post_id, content').eq('id', commentId).single();
      if (lookupErr || !comment) {
        console.error('[comment_like notif] comment lookup failed', { commentId, lookupErr });
        return;
      }
      const authorDid = comment.user_id;               // already a DID
      if (!authorDid || authorDid === userId) return;  // skip self
      const { data: post } = await supabase
        .from('posts').select('media_urls, poster_url, thumbnail_url, media_type').eq('id', comment.post_id).single();
      const { data: senderProfile } = await supabase
        .from('profiles').select('profile_image_url').eq('username', username).single();
      const { error: notifErr } = await supabase.from('notifications').insert({
        recipient_id: authorDid,
        sender_id: userId,
        sender_username: username,
        sender_avatar: senderProfile?.profile_image_url ?? null,
        type: 'comment_like',
        post_id: comment.post_id,
        post_image_url: post ? notifThumb(post) : null,
        message: `@${username} liked your comment`,
        is_read: false,
      });
      if (notifErr) console.error('[comment_like notif] insert failed', { notifErr, recipient_id: authorDid, post_id: comment.post_id });
    } catch (e) {
      console.error('[comment_like notif] exception', e);
    }
  })();

  return { liked: true };
};

/** Unlike a comment. Returns the optimistic shape { liked: false }. */
export const unlikeComment = async (
  commentId: string,
  userId: string,
): Promise<{ liked: false }> => {
  const { error } = await supabase
    .from('comment_likes')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', userId);
  if (error) {
    console.error('Error unliking comment:', error);
    throw error;
  }
  return { liked: false };
};

/**
 * Batch like state for comments. Returns a Map keyed by comment_id. `userId` may
 * be null (logged-out preview) → likedByMe always false.
 */
export const getCommentLikeStates = async (
  commentIds: string[],
  userId: string | null,
): Promise<Map<string, CommentLikeState>> => {
  const out = new Map<string, CommentLikeState>();
  if (commentIds.length === 0) return out;
  const { data } = await supabase
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', commentIds);
  for (const id of commentIds) out.set(id, { count: 0, likedByMe: false });
  for (const row of data ?? []) {
    const s = out.get(row.comment_id) ?? { count: 0, likedByMe: false };
    s.count += 1;
    if (userId && row.user_id === userId) s.likedByMe = true;
    out.set(row.comment_id, s);
  }
  return out;
};

// ── Replies (one level) ─────────────────────────────────────────────────────

/**
 * Reply to a comment. ONE LEVEL ONLY: the parent must be a top-level comment
 * (parent_comment_id IS NULL) — replying to a reply throws. Writes a SOCIAL
 * notification to the parent comment's author unless it's a self-reply. Returns
 * the inserted reply row (optimistic-append shape).
 */
export const replyToComment = async (
  postId: string,
  parentCommentId: string,
  userId: string,
  username: string,
  content: string,
): Promise<CommentRow> => {
  const trimmed = content.trim();
  if (trimmed.length === 0) throw new Error('empty reply');

  // One-level guard: the parent must exist AND itself be top-level.
  const { data: parent, error: parentErr } = await supabase
    .from('comments').select('id, user_id, parent_comment_id').eq('id', parentCommentId).single();
  if (parentErr || !parent) throw new Error('parent comment not found');
  if (parent.parent_comment_id !== null) throw new Error('replies cannot be replied to (one level only)');

  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, user_id: userId, username, content: trimmed, parent_comment_id: parentCommentId })
    .select('id, post_id, user_id, username, content, parent_comment_id, created_at')
    .single();
  if (error || !data) {
    console.error('Error replying to comment:', error);
    throw error ?? new Error('reply failed');
  }

  // Fire-and-forget notification to the parent comment's author.
  ;(async () => {
    try {
      const authorDid = parent.user_id;               // already a DID
      if (!authorDid || authorDid === userId) return; // skip self
      const { data: post } = await supabase
        .from('posts').select('media_urls, poster_url, thumbnail_url, media_type').eq('id', postId).single();
      const { data: senderProfile } = await supabase
        .from('profiles').select('profile_image_url').eq('username', username).single();
      const preview = trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
      await supabase.from('notifications').insert({
        recipient_id: authorDid,
        sender_id: userId,
        sender_username: username,
        sender_avatar: senderProfile?.profile_image_url ?? null,
        type: 'reply',
        post_id: postId,
        post_image_url: post ? notifThumb(post) : null,
        message: `@${username} replied: ${preview}`,
        is_read: false,
      });
    } catch (e) {
      console.error('Reply notification exception:', e);
    }
  })();

  return data as CommentRow;
};
