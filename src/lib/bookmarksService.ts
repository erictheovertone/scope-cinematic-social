import { supabase } from './supabase/client';

export async function addBookmark(userId: string, postId: string) {
  const { data, error } = await supabase
    .from('bookmarks')
    .insert({ user_id: userId, post_id: postId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeBookmark(userId: string, postId: string) {
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId);
  if (error) throw error;
}

export async function isBookmarked(userId: string, postId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .maybeSingle();
  return !!data;
}

export async function getUserBookmarks(userId: string): Promise<any[]> {
  const { data: bms, error } = await supabase
    .from('bookmarks')
    .select('post_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!bms || bms.length === 0) return [];

  const postIds = bms.map((b: any) => b.post_id);

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .in('id', postIds);
  if (!posts || posts.length === 0) return [];

  // Preserve bookmark order
  const postMap = new Map(posts.map((p: any) => [p.id, p]));
  const ordered = postIds.map((id: string) => postMap.get(id)).filter(Boolean);

  // Attach profile data (avatar + grid_layout)
  const usernames = [...new Set(ordered.map((p: any) => p.username))] as string[];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('username, profile_image_url, grid_layout')
    .in('username', usernames);

  const avatarMap = new Map((profiles ?? []).map((p: any) => [p.username, p.profile_image_url ?? null]));
  const gridMap   = new Map((profiles ?? []).map((p: any) => [p.username, p.grid_layout ?? null]));

  return ordered.map((post: any) => ({
    ...post,
    profile_image_url: avatarMap.get(post.username) ?? null,
    grid_layout:       gridMap.get(post.username)   ?? null,
  }));
}
