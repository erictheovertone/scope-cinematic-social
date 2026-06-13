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
  editGeometry?: unknown;
  editParams?: unknown;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
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
        autoplay: postData.autoplay !== false,
        // Additive — null/absent for legacy posts, never replaces layout_id.
        ...(postData.editGeometry !== undefined ? { edit_geometry: postData.editGeometry } : {}),
        // Look params (Brief 8B) — additive jsonb; stored versioned ({v:1,...}).
        ...(postData.editParams !== undefined ? { edit_params: postData.editParams } : {}),
        ...(postData.cropX !== undefined ? { crop_x: postData.cropX } : {}),
        ...(postData.cropY !== undefined ? { crop_y: postData.cropY } : {}),
        ...(postData.cropWidth !== undefined ? { crop_width: postData.cropWidth } : {}),
        ...(postData.cropHeight !== undefined ? { crop_height: postData.cropHeight } : {}),
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

export const getAllPosts = async (): Promise<(Post & { profile_image_url?: string | null })[]> => {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

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
