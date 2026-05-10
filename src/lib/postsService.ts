import { supabase } from './supabase/client';

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
  media_type?: string;
  thumbnail_url?: string | null;
  autoplay?: boolean;
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
  autoplay?: boolean;
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
        autoplay: postData.autoplay !== false,
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

  // Batch-fetch profile images for all unique usernames in one query
  const usernames = [...new Set(posts.map((p) => p.username).filter(Boolean))];
  if (usernames.length === 0) return posts;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('username, profile_image_url, grid_layout')
    .in('username', usernames);

  const avatarMap = new Map(
    (profiles || []).map((p) => [p.username, p.profile_image_url as string | null])
  );
  const gridLayoutMap = new Map(
    (profiles || []).map((p) => [p.username, p.grid_layout as string | null])
  );

  return posts.map((post) => ({
    ...post,
    profile_image_url: avatarMap.get(post.username) ?? null,
    grid_layout: gridLayoutMap.get(post.username) ?? null,
  }));
};

export const getUserPosts = async (userId: string): Promise<Post[]> => {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
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
        .from('posts').select('user_id, media_urls').eq('id', postId).single()
      if (!post || post.user_id === userId) return
      const { data: senderProfile } = await supabase
        .from('profiles').select('profile_image_url').eq('username', username).single()
      console.log('Creating like notification — recipient:', post.user_id, ', sender:', userId)
      const { data: notif, error: notifError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: post.user_id,
          sender_id: userId,
          sender_username: username,
          sender_avatar: senderProfile?.profile_image_url ?? null,
          type: 'like',
          post_id: postId,
          post_image_url: post.media_urls?.[0] ?? null,
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
        .from('posts').select('user_id, media_urls').eq('id', postId).single()
      if (!post || post.user_id === userId) return
      const { data: senderProfile } = await supabase
        .from('profiles').select('profile_image_url').eq('username', username).single()
      const preview = content.length > 40 ? content.slice(0, 40) + '…' : content
      console.log('Creating comment notification — recipient:', post.user_id, ', sender:', userId)
      const { data: notif, error: notifError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: post.user_id,
          sender_id: userId,
          sender_username: username,
          sender_avatar: senderProfile?.profile_image_url ?? null,
          type: 'comment',
          post_id: postId,
          post_image_url: post.media_urls?.[0] ?? null,
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

  const usernames = [...new Set(posts.map((p) => p.username).filter(Boolean))];
  if (usernames.length === 0) return posts;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('username, profile_image_url, grid_layout')
    .in('username', usernames);

  const avatarMap = new Map(
    (profiles ?? []).map((p) => [p.username, p.profile_image_url as string | null]),
  );
  const gridLayoutMap = new Map(
    (profiles ?? []).map((p) => [p.username, p.grid_layout as string | null]),
  );

  return posts.map((post) => ({
    ...post,
    profile_image_url: avatarMap.get(post.username) ?? null,
    grid_layout: gridLayoutMap.get(post.username) ?? null,
  }));
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
  const { error } = await supabase
    .from('posts')
    .update({ is_deleted: true })
    .eq('id', postId)
    .eq('user_id', userId);

  if (error) {
    console.error('[softDeletePost] error:', error);
    return false;
  }
  console.log('[softDeletePost] post hidden:', postId);
  return true;
}
