import { supabase } from './supabase/client';

// The IMAGE thumbnail for a post (notifications, previews): video posts use the
// baked graded poster (never the .mp4, which renders blank as <img>); photos
// use their baked image.
function notifThumb(p: { media_type?: string | null; poster_url?: string | null; thumbnail_url?: string | null; media_urls?: string[] | null }): string | null {
  if (p?.media_type === 'video') return p.poster_url ?? p.thumbnail_url ?? null;
  return p?.media_urls?.[0] ?? p?.thumbnail_url ?? null;
}

interface Post {
  id: string;
  user_id: string;
  username: string;
  caption: string;
  media_urls: string[];
  layout_id: string;
  aspect_ratio: number | null;
  created_at: string;
  updated_at: string;
  contract_address?: string | null;
  token_id?: string | null;
  tx_hash?: string | null;
  is_minted?: boolean;
  // Phase 1 coin fields (additive; legacy 1155 posts leave these null).
  coin_address?: string | null;
  ticker?: string | null;
  coin_tx_hash?: string | null;
  coin_currency?: string | null;
  coin_created_at?: string | null;
  token_standard?: string | null; // 'erc1155' (legacy) | 'coin'
  media_type?: string;
  thumbnail_url?: string | null;
  autoplay?: boolean;
  crop_x?: number;
  crop_y?: number;
  crop_width?: number;
  crop_height?: number;
  // Video pipeline (V2/V3) — Cloudflare Stream. video_status: processing|ready|failed for
  // Stream-backed videos; NULL for images + legacy (pre-pipeline) videos.
  video_status?: string | null;
  stream_uid?: string | null;
  stream_playback_url?: string | null; // HLS manifest (ready)
  stream_poster_url?: string | null;   // Stream auto-thumbnail (ready)
}

interface Like {
  id: string;
  post_id: string;
  user_id: string;
  username: string;
  created_at: string;
}

interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export const createPost = async (postData: {
  userId: string;
  username: string;
  caption: string;
  mediaUrls: string[];
  layoutId: string;
  aspectRatio?: number;
  mediaType?: string;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  autoplayClipUrl?: string | null;
  autoplay?: boolean;
  // Brief M10 — Mirage snippet window (seconds). Optional creative control; null → Mirage
  // plays from 0. Metadata only (NO baked clip). New columns: snippet_start / snippet_length.
  snippetStart?: number | null;
  snippetLength?: number | null;
  editGeometry?: unknown;
  editParams?: unknown;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  // Music (M2) — playback-layer flags ONLY. Additive columns on the SAME insert
  // that already runs before any mint, so an attached track can never block publish.
  musicTrackId?: string | null;
  musicMode?: string | null;
  // Video pipeline (V2) — Cloudflare Stream. Set for NEW video posts only: the raw
  // video lives in Stream (streamUid), the row publishes as 'processing', and the
  // Stream webhook flips it to 'ready' + fills the playback/poster URLs. Additive,
  // on the same pre-mint insert → encoding never blocks publish (fire-and-forget).
  streamUid?: string | null;
  videoStatus?: string | null;
}): Promise<Post> => {
  const { data, error } = await supabase
    .from('posts')
    .insert([
      {
        user_id: postData.userId,
        username: postData.username,
        caption: postData.caption,
        media_urls: postData.mediaUrls,
        layout_id: postData.layoutId,
        media_type: postData.mediaType || 'image',
        thumbnail_url: postData.thumbnailUrl || null,
        // Graded poster frame (video) — geometry + look baked at publish. Shown
        // wherever the video is NOT actively playing (grid/feed/thumbnails).
        ...(postData.posterUrl !== undefined ? { poster_url: postData.posterUrl } : {}),
        // Baked 3–5s graded MUTED clip — the autoplay material (looped as a plain
        // <video> on grid/feed/scroll; no live pipeline).
        ...(postData.autoplayClipUrl !== undefined ? { autoplay_clip_url: postData.autoplayClipUrl } : {}),
        // Brief M10 — Mirage snippet window (metadata, seconds). Additive; null/absent for
        // legacy posts and posts without a chosen window → Mirage plays from 0.
        ...(postData.snippetStart !== undefined ? { snippet_start: postData.snippetStart } : {}),
        ...(postData.snippetLength !== undefined ? { snippet_length: postData.snippetLength } : {}),
        autoplay: postData.autoplay !== false,
        // Additive — null/absent for legacy posts, never replaces layout_id.
        ...(postData.editGeometry !== undefined ? { edit_geometry: postData.editGeometry } : {}),
        // Look params (Brief 8B) — additive jsonb; stored versioned ({v:1,...}).
        ...(postData.editParams !== undefined ? { edit_params: postData.editParams } : {}),
        ...(postData.cropX !== undefined ? { crop_x: postData.cropX } : {}),
        ...(postData.cropY !== undefined ? { crop_y: postData.cropY } : {}),
        ...(postData.cropWidth !== undefined ? { crop_width: postData.cropWidth } : {}),
        ...(postData.cropHeight !== undefined ? { crop_height: postData.cropHeight } : {}),
        // Music (M2) — the featured library track + its layering mode. Playback
        // flags only; the post's own media/audio is never baked or stripped.
        ...(postData.musicTrackId !== undefined ? { music_track_id: postData.musicTrackId } : {}),
        ...(postData.musicMode !== undefined ? { music_mode: postData.musicMode } : {}),
        // Video pipeline (V2) — Stream store-of-record + processing status.
        ...(postData.streamUid !== undefined ? { stream_uid: postData.streamUid } : {}),
        ...(postData.videoStatus !== undefined ? { video_status: postData.videoStatus } : {}),
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('[createPost] Supabase error:', JSON.stringify(error));
    throw error;
  }

  return data;
};

// Feed page size — the home feed loads one page, then appends more on scroll.
// Brief M13 — ~20 per Eric's spec (was 10).
export const FEED_PAGE_SIZE = 20;

export const getAllPosts = async (
  page = 0,
  pageSize = FEED_PAGE_SIZE,
): Promise<(Post & { profile_image_url?: string | null })[]> => {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(from, to);   // paginate — was: load ALL posts in one query

  if (error || !posts) {
    console.error('Error fetching posts:', error);
    return [];
  }

  console.log('[getAllPosts] first post:', JSON.stringify(posts?.[0]));

  // Batch-fetch profiles by stable user_id so display + routing use the live handle
  const userIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean))];
  if (userIds.length === 0) return posts;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, username, profile_image_url, grid_layout')
    .in('user_id', userIds);

  const profileMap = new Map(
    (profiles || []).map((p) => [p.user_id, p])
  );

  return posts.map((post) => {
    const prof = profileMap.get(post.user_id);
    return {
      ...post,
      username: prof?.username ?? post.username,
      profile_image_url: prof?.profile_image_url ?? null,
      grid_layout: prof?.grid_layout ?? null,
    };
  });
};

// ── Brief M13 — CURSOR-paginated Discover feed (replaces getAllPosts' offset range).
// Keyset on (created_at, id) DESC so pages never skip or duplicate as new posts arrive
// (offset does both). WHERE is is_deleted=false ONLY — no following / media_type /
// video_status filter, so every account's newest work (incl. processing + legacy
// videos) is reachable. select('*') + {...post} preserves EVERY card field (Stream,
// track title, coin, crop). Returns the page plus the cursor for the next fetch (null
// when the feed is exhausted → the caller shows the end state).
export interface FeedCursor { created_at: string; id: string }

export const getFeedPage = async (
  cursor: FeedCursor | null = null,
  pageSize = FEED_PAGE_SIZE,
): Promise<{ posts: (Post & { profile_image_url?: string | null })[]; nextCursor: FeedCursor | null }> => {
  let query = supabase
    .from('posts')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })   // deterministic tiebreaker → stable keyset
    .limit(pageSize);
  if (cursor) {
    // (created_at, id) < (cursor.created_at, cursor.id) for DESC order. Timestamp is
    // quoted so its ':' / '+' can't be misread by the PostgREST filter parser.
    query = query.or(
      `created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt.${cursor.id})`,
    );
  }
  const { data: posts, error } = await query;
  if (error || !posts) {
    console.error('Error fetching feed page:', error);
    return { posts: [], nextCursor: null };
  }

  // Batch-fetch author profiles by stable user_id (same as getAllPosts).
  const userIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean))];
  let profileMap = new Map<string, { username?: string; profile_image_url?: string | null; grid_layout?: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, profile_image_url, grid_layout')
      .in('user_id', userIds);
    profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
  }

  const enriched = posts.map((post) => {
    const prof = profileMap.get(post.user_id);
    return {
      ...post,
      username: prof?.username ?? post.username,
      profile_image_url: prof?.profile_image_url ?? null,
      grid_layout: prof?.grid_layout ?? null,
    };
  });

  const last = posts[posts.length - 1];
  // A full page implies there may be more; a short page is the end of the feed.
  const nextCursor = posts.length === pageSize && last ? { created_at: last.created_at, id: last.id } : null;
  return { posts: enriched, nextCursor };
};

export const getUserPosts = async (userId: string): Promise<Post[]> => {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user posts:', error);
    return [];
  }

  return data || [];
};

// ── Fetch specific posts by id, returned IN the requested order (the caller's
//    curation order — e.g. the MORE FROM shelf's settings-selected sequence).
//    Deleted posts are dropped so a stale selection self-heals. ──
export const getPostsByIds = async (ids: string[]): Promise<Post[]> => {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .in('id', ids)
    .eq('is_deleted', false);
  if (error) { console.error('Error fetching posts by ids:', error); return []; }
  const byId = new Map((data ?? []).map((p) => [String(p.id), p]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean) as Post[];
};

// ── Pin to the top of the profile grid (getUserPosts already sorts is_pinned desc,
//    then recency). Max 2 pins per user — enforced HERE (service layer) so the UI
//    can't bypass it. Pinned order among the two = recency (created_at desc). ──
export const MAX_PINNED_POSTS = 2;

export const pinPost = async (
  postId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> => {
  // Count the user's OTHER currently-pinned posts (this one is being pinned now).
  const { count, error: countErr } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_pinned', true)
    .eq('is_deleted', false)
    .neq('id', postId);
  if (countErr) return { ok: false, error: 'Could not pin — try again.' };
  if ((count ?? 0) >= MAX_PINNED_POSTS) {
    return { ok: false, error: `Max ${MAX_PINNED_POSTS} pinned posts — unpin one first.` };
  }
  const { error } = await supabase.from('posts').update({ is_pinned: true }).eq('id', postId);
  if (error) return { ok: false, error: 'Could not pin — try again.' };
  return { ok: true };
};

export const unpinPost = async (postId: string): Promise<{ ok: boolean; error?: string }> => {
  const { error } = await supabase.from('posts').update({ is_pinned: false }).eq('id', postId);
  if (error) return { ok: false, error: 'Could not unpin — try again.' };
  return { ok: true };
};

export const getPostsByUsername = async (username: string): Promise<Post[]> => {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('username', username)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching posts by username:', error);
    return [];
  }

  console.log(`getPostsByUsername("${username}") → ${data?.length ?? 0} posts`);
  return data || [];
};

export const getPostById = async (id: string): Promise<Post | null> => {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching post:', error);
    return null;
  }

  return data;
};

// Likes functionality
export const likePost = async (postId: string, userId: string, username: string): Promise<Like> => {
  const { data, error } = await supabase
    .from('likes')
    .insert([{ post_id: postId, user_id: userId, username }])
    .select()
    .single();

  if (error) {
    console.error('Error liking post:', error);
    throw error;
  }

  // Fire-and-forget like notification
  ;(async () => {
    try {
      const { data: post } = await supabase
        .from('posts').select('user_id, media_urls, poster_url, thumbnail_url, media_type').eq('id', postId).single()
      if (!post) return
      // recipient_id stores the OWNER's Privy DID — the bell reads by DID
      // (getNotifications queries recipient_id == user.id) and follow notifs use
      // the DID too. posts.user_id is a Supabase uuid, so translate uuid →
      // users.privy_id; storing the raw uuid here leaves the bell permanently empty.
      const { data: ownerUser } = await supabase
        .from('users').select('privy_id').eq('id', post.user_id).single()
      const recipientDid = ownerUser?.privy_id
      if (!recipientDid || recipientDid === userId) return // skip self-notifications
      const { data: senderProfile } = await supabase
        .from('profiles').select('profile_image_url').eq('username', username).single()
      console.log('Creating like notification — recipient:', recipientDid, ', sender:', userId)
      const { data: notif, error: notifError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: recipientDid,
          sender_id: userId,
          sender_username: username,
          sender_avatar: senderProfile?.profile_image_url ?? null,
          type: 'like',
          post_id: postId,
          // Thumbnail must be an IMAGE: for video posts media_urls[0] is the
          // .mp4 (renders blank as <img>) — use the baked poster/thumbnail.
          post_image_url: notifThumb(post),
          message: `@${username} liked your post`,
          is_read: false,
        })
        .select('id')
        .single()
      if (notifError) console.error('Like notification insert error:', notifError)
      else console.log('Like notification created:', notif?.id)
    } catch (e) {
      console.error('Like notification exception:', e)
    }
  })()

  return data;
};

// ── Market notification writer (the MARKET tab's first writers) ───────────────
// The notifications MARKET tab reads any type outside the social set — these
// 'collect' / 'sell' rows are what populate it. Called AFTER a receipt-true
// confirmed trade only (tx mined + pieces verified) — never on optimistic state.
// FIRE-AND-FORGET: the trade already succeeded; a failed insert logs and moves
// on, it must never disturb the trade UX. `pieces` arrives already converted to
// fragments by the receipt path (the one 100k-tokens-per-piece source).
// SELLS DON'T NOTIFY (ratified) — the kind narrows to 'collect'; the sell
// call site was removed. FC ledger/economics don't ride notifications.
export const notifyMarketTrade = (
  postId: string,
  kind: 'collect',
  actorPrivyId: string,
  pieces: number,
  usdAmount?: number,
): void => {
  ;(async () => {
    try {
      if (!actorPrivyId || !(pieces > 0)) return
      const { data: post } = await supabase
        .from('posts').select('user_id, ticker, media_urls, poster_url, thumbnail_url, media_type').eq('id', postId).single()
      if (!post) return
      // Same uuid → DID translation as likePost: recipient_id MUST be the
      // creator's Privy DID (the bell reads by DID; a raw uuid never shows).
      const { data: ownerUser } = await supabase
        .from('users').select('privy_id').eq('id', post.user_id).single()
      const recipientDid = ownerUser?.privy_id
      if (!recipientDid || recipientDid === actorPrivyId) return // skip self-trades (e.g. mint-flow backing)
      const { data: actorUser } = await supabase
        .from('users').select('id').eq('privy_id', actorPrivyId).single()
      const { data: actorProfile } = actorUser
        ? await supabase.from('profiles').select('username, profile_image_url').eq('user_id', actorUser.id).single()
        : { data: null }
      const username = actorProfile?.username ?? 'someone'
      const amount = post.ticker
        ? `${pieces} [ ${post.ticker} ]`
        : `${pieces} ${pieces === 1 ? 'fragment' : 'fragments'}`
      const value = kind === 'collect' && usdAmount != null && usdAmount > 0 ? ` · ~$${usdAmount.toFixed(2)}` : ''
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: recipientDid,
          sender_id: actorPrivyId,
          sender_username: username,
          sender_avatar: actorProfile?.profile_image_url ?? null,
          type: kind,
          post_id: postId,
          post_image_url: notifThumb(post),
          message: `@${username} ${kind === 'collect' ? 'collected' : 'sold'} ${amount}${value}`,
          is_read: false,
        })
      if (notifError) console.error('[market-notif] insert error (trade unaffected):', notifError)
    } catch (e) {
      console.error('[market-notif] exception (trade unaffected):', e)
    }
  })()
}

export const unlikePost = async (postId: string, userId: string): Promise<void> => {
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error unliking post:', error);
    throw error;
  }
};

export const getPostLikes = async (postId: string): Promise<Like[]> => {
  const { data, error } = await supabase
    .from('likes')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching post likes:', error);
    return [];
  }

  return data || [];
};

export const isPostLikedByUser = async (postId: string, userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error checking if post is liked:', error);
    return false;
  }

  return !!data;
};

// Comments functionality
export const addComment = async (
  postId: string,
  userId: string,
  username: string,
  content: string
): Promise<Comment> => {
  const { data, error } = await supabase
    .from('comments')
    .insert([{ post_id: postId, user_id: userId, username, content }])
    .select()
    .single();

  if (error) {
    console.error('Error adding comment:', error);
    throw error;
  }

  // Fire-and-forget comment notification
  ;(async () => {
    try {
      const { data: post } = await supabase
        .from('posts').select('user_id, media_urls, poster_url, thumbnail_url, media_type').eq('id', postId).single()
      if (!post) return
      // recipient_id stores the OWNER's Privy DID (see likePost) — translate
      // posts.user_id (uuid) → users.privy_id so the bell (read by DID) matches.
      const { data: ownerUser } = await supabase
        .from('users').select('privy_id').eq('id', post.user_id).single()
      const recipientDid = ownerUser?.privy_id
      if (!recipientDid || recipientDid === userId) return // skip self-notifications
      const { data: senderProfile } = await supabase
        .from('profiles').select('profile_image_url').eq('username', username).single()
      const preview = content.length > 40 ? content.slice(0, 40) + '…' : content
      console.log('Creating comment notification — recipient:', recipientDid, ', sender:', userId)
      const { data: notif, error: notifError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: recipientDid,
          sender_id: userId,
          sender_username: username,
          sender_avatar: senderProfile?.profile_image_url ?? null,
          type: 'comment',
          post_id: postId,
          // Thumbnail must be an IMAGE: for video posts media_urls[0] is the
          // .mp4 (renders blank as <img>) — use the baked poster/thumbnail.
          post_image_url: notifThumb(post),
          message: `@${username} commented: ${preview}`,
          is_read: false,
        })
        .select('id')
        .single()
      if (notifError) console.error('Comment notification insert error:', notifError)
      else console.log('Comment notification created:', notif?.id)
    } catch (e) {
      console.error('Comment notification exception:', e)
    }
  })()

  return data;
};

export const getPostComments = async (postId: string): Promise<Comment[]> => {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching post comments:', error);
    return [];
  }

  return data || [];
};

export const getPostsPaginated = async (
  page: number,
  limit = 30,
): Promise<(Post & { profile_image_url?: string | null })[]> => {
  const from = page * limit;
  const to = from + limit - 1;

  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error || !posts) {
    console.error('Error fetching paginated posts:', error);
    return [];
  }

  const userIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean))];
  if (userIds.length === 0) return posts;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, username, profile_image_url, grid_layout')
    .in('user_id', userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.user_id, p]),
  );

  return posts.map((post) => {
    const prof = profileMap.get(post.user_id);
    return {
      ...post,
      username: prof?.username ?? post.username,
      profile_image_url: prof?.profile_image_url ?? null,
      grid_layout: prof?.grid_layout ?? null,
    };
  });
};

export const updatePostMintData = async (
  postId: string,
  data: {
    contract_address: string;
    token_id: string;
    tx_hash: string;
    is_minted: boolean;
  }
): Promise<void> => {
  const { error } = await supabase
    .from('posts')
    .update(data)
    .eq('id', postId);

  if (error) {
    console.error('[updatePostMintData] Supabase error:', JSON.stringify(error));
    throw error;
  }
  console.log('[updatePostMintData] updated post:', postId, data.contract_address);
};

// ── Phase 1 coin writes ───────────────────────────────────────────────────────

// Optimistic breadcrumb: persist the createCoin tx hash BEFORE confirmation so
// the reconciliation path always has a thread, even if the post-mining write
// fails (proposal §5.5 / amendment C). Idempotent.
// Music (M2) — pure flag updates for the post-publish EDIT MUSIC action (swap /
// change mode / remove). Playback-layer only; the post's own media is untouched.
// Returns { ok } so the caller can surface a quiet error without throwing.
export const updatePostMusic = async (
  postId: string,
  musicTrackId: string | null,
  musicMode: 'bed' | 'music_only' | null,
  musicStartSeconds?: number | null, // omit (undefined) to leave the clip offset untouched
): Promise<{ ok: boolean }> => {
  const patch: Record<string, unknown> = { music_track_id: musicTrackId, music_mode: musicMode };
  if (musicStartSeconds !== undefined) patch.music_start_seconds = musicStartSeconds;
  const { error } = await supabase.from('posts').update(patch).eq('id', postId);
  if (error) { console.error('[updatePostMusic] error:', JSON.stringify(error)); return { ok: false }; }
  return { ok: true };
};

export const updatePostCoinTxHash = async (postId: string, txHash: string): Promise<void> => {
  const { error } = await supabase
    .from('posts')
    .update({ coin_tx_hash: txHash })
    .eq('id', postId);
  if (error) console.error('[updatePostCoinTxHash] error:', JSON.stringify(error));
};

// Sibling of updatePostMintData for the coin path. Marks the post a 'coin' and
// records its address/ticker/currency. Called after the coin confirms.
export const updatePostCoinData = async (
  postId: string,
  data: {
    coin_address: string;
    ticker: string;
    coin_tx_hash: string;
    coin_currency: string;
    /** Creator's wallet — denormalized for the awarding-layer jobs (Step A). */
    creator_address?: string;
  }
): Promise<void> => {
  const { error } = await supabase
    .from('posts')
    .update({
      coin_address: data.coin_address,
      ticker: data.ticker,
      coin_tx_hash: data.coin_tx_hash,
      coin_currency: data.coin_currency,
      token_standard: 'coin',
      coin_created_at: new Date().toISOString(),
      ...(data.creator_address ? { creator_address: data.creator_address } : {}),
    })
    .eq('id', postId);

  if (error) {
    console.error('[updatePostCoinData] Supabase error:', JSON.stringify(error));
    throw error;
  }
  console.log('[updatePostCoinData] coin saved:', postId, data.coin_address);
};

export const deleteComment = async (commentId: string, userId: string): Promise<void> => {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
};

// ── MINTED-POST RETENTION POLICY ──────────────────────────────────────────────
// A minted post row (coin_address set) is the app's ONLY index to an on-chain
// asset: holdings, earnings, activity tickers, and the screening room all
// resolve coins through it. Hard-deleting one strands real tokens invisibly.
// POLICY: soft-delete (is_deleted = true) is the only allowed removal — restore
// is flipping the flag back. hardDeletePost below is the ONE sanctioned
// hard-delete path and REFUSES minted posts; never call supabase.delete() on
// `posts` directly.
export async function hardDeletePost(postId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: post, error: readErr } = await supabase
    .from('posts')
    .select('id, coin_address')
    .eq('id', postId)
    .eq('user_id', userId)
    .maybeSingle();
  if (readErr || !post) return { ok: false, error: 'Post not found (or not yours).' };
  if (post.coin_address) {
    console.error('[hardDeletePost] REFUSED — minted post (on-chain index):', postId, post.coin_address);
    return { ok: false, error: 'Minted posts can’t be permanently deleted — they index an on-chain asset. Hide it instead.' };
  }
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', userId)
    .is('coin_address', null); // re-checked at the query layer — belt and braces
  if (error) {
    console.error('[hardDeletePost] error:', error);
    return { ok: false, error: 'Delete failed — try again.' };
  }
  return { ok: true };
}

export async function softDeletePost(postId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('posts')
    .update({ is_deleted: true })
    .eq('id', postId)
    .eq('user_id', userId)
    .select('id');

  if (error) {
    console.error('[softDeletePost] error:', error);
    return false;
  }
  // No rows updated means the ownership filter matched nothing (e.g. wrong
  // user_id). Treat that as a failure instead of a false success, otherwise
  // the post disappears locally but persists in the DB and reappears on refetch.
  if (!data || data.length === 0) {
    console.error('[softDeletePost] no rows updated — ownership mismatch for post:', postId, 'user:', userId);
    return false;
  }
  console.log('[softDeletePost] post hidden:', postId);
  return true;
}
