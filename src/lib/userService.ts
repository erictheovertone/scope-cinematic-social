import { supabase } from './supabase/client'
import type { User, Profile } from './supabase'

function sbErr(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as Record<string, unknown>;
  return [e.message, e.code, e.details, e.hint].filter(Boolean).join(' | ') || JSON.stringify(error);
}

export const syncUserWithSupabase = async (privyUser: { id: string; wallet?: { address: string } }): Promise<User | null> => {
  console.log('[syncUserWithSupabase] called for privy_id:', privyUser.id);

  try {
    // Upsert on privy_id — idempotent, never fails on duplicate, always returns the row
    const { data, error } = await supabase
      .from('users')
      .upsert(
        { privy_id: privyUser.id, wallet_address: privyUser.wallet?.address || null },
        { onConflict: 'privy_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[syncUserWithSupabase] upsert error:', sbErr(error));
      throw error;
    }

    console.log('[syncUserWithSupabase] upsert result — id:', data?.id, 'privy_id:', data?.privy_id);
    return data;
  } catch (error) {
    console.error('[syncUserWithSupabase] failed:', sbErr(error));
    return null;
  }
}

export const saveProfile = async (userId: string, profileData: {
  displayName: string
  username: string
  bio: string
  profileImageUrl?: string
  websiteUrl?: string
}) => {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      user_id: userId,
      display_name: profileData.displayName,
      username: profileData.username,
      bio: profileData.bio,
      profile_image_url: profileData.profileImageUrl,
      website_url: profileData.websiteUrl ?? null,
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

export const saveGridLayout = async (userId: string, gridLayout: string): Promise<void> => {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, grid_layout: gridLayout }, { onConflict: 'user_id' })
  if (error) throw error
}

export const getProfile = async (userId: string): Promise<Profile | null> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return data || null
  } catch (error) {
    console.error('Error fetching profile:', sbErr(error))
    return null
  }
}

export const getProfileByUsername = async (username: string): Promise<Profile | null> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return data || null
  } catch (error) {
    console.error('Error fetching profile by username:', sbErr(error))
    return null
  }
}

export const uploadImage = async (file: File, bucket: string = 'profile-images', privyUserId?: string): Promise<string> => {
  const fileExt = file.name.split('.').pop()
  const prefix = privyUserId ? privyUserId.replace(/[^a-zA-Z0-9-]/g, '_') : 'public'
  const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, { cacheControl: '3600', upsert: false })

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName)
  return publicUrl
}

export const getUserByPrivyId = async (privyId: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('privy_id', privyId)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return data || null
  } catch (error) {
    console.error('Error fetching user by Privy ID:', sbErr(error))
    return null
  }
}

export const getUserById = async (userId: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data || null
  } catch (error) {
    console.error('Error fetching user by ID:', sbErr(error))
    return null
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string
  recipient_id: string
  sender_id: string
  sender_username: string | null
  sender_avatar: string | null
  type: 'like' | 'comment' | 'follow' | 'collect'
  post_id: string | null
  post_image_url: string | null
  message: string | null
  is_read: boolean
  created_at: string
}

export const getNotifications = async (privyUserId: string): Promise<AppNotification[]> => {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', privyUserId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data || []) as AppNotification[]
}

export const markAllNotificationsRead = async (privyUserId: string): Promise<void> => {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', privyUserId)
    .eq('is_read', false)
}

export const getUnreadNotificationCount = async (privyUserId: string): Promise<number> => {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', privyUserId)
    .eq('is_read', false)
  return count ?? 0
}

// ── Follows ──────────────────────────────────────────────────────────────────

export const followUser = async (followerPrivyId: string, followingPrivyId: string): Promise<void> => {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerPrivyId, following_id: followingPrivyId })
  if (error) throw error

  // Fire-and-forget follow notification
  if (followerPrivyId === followingPrivyId) return
  ;(async () => {
    try {
      const { data: senderUser } = await supabase
        .from('users').select('id').eq('privy_id', followerPrivyId).single()
      if (!senderUser) {
        console.warn('Follow notification: sender user not found for privy_id:', followerPrivyId)
        return
      }
      const { data: senderProfile } = await supabase
        .from('profiles').select('username, profile_image_url').eq('user_id', senderUser.id).single()
      console.log('Creating follow notification — recipient:', followingPrivyId, ', sender:', followerPrivyId)
      const { data: notif, error: notifError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: followingPrivyId,
          sender_id: followerPrivyId,
          sender_username: senderProfile?.username ?? null,
          sender_avatar: senderProfile?.profile_image_url ?? null,
          type: 'follow',
          post_id: null,
          post_image_url: null,
          message: `@${senderProfile?.username ?? 'someone'} started following you`,
          is_read: false,
        })
        .select('id')
        .single()
      if (notifError) console.error('Follow notification insert error:', notifError)
      else console.log('Follow notification created:', notif?.id)
    } catch (e) {
      console.error('Follow notification exception:', e)
    }
  })()
}

export const unfollowUser = async (followerPrivyId: string, followingPrivyId: string): Promise<void> => {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerPrivyId)
    .eq('following_id', followingPrivyId)
  if (error) throw error
}

export const isFollowing = async (followerPrivyId: string, followingPrivyId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerPrivyId)
    .eq('following_id', followingPrivyId)
    .maybeSingle()
  if (error) return false
  return !!data
}

export const getFollowerCount = async (privyUserId: string): Promise<number> => {
  const { count } = await supabase
    .from('follows')
    .select('id', { count: 'exact', head: true })
    .eq('following_id', privyUserId)
  return count ?? 0
}

export const getFollowingCount = async (privyUserId: string): Promise<number> => {
  const { count } = await supabase
    .from('follows')
    .select('id', { count: 'exact', head: true })
    .eq('follower_id', privyUserId)
  return count ?? 0
}

export const getFollowers = async (privyUserId: string): Promise<Profile[]> => {
  const { data: followRows } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('following_id', privyUserId)
  if (!followRows?.length) return []

  const { data: users } = await supabase
    .from('users')
    .select('id')
    .in('privy_id', followRows.map(r => r.follower_id))
  if (!users?.length) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', users.map((u: any) => u.id))
  return profiles || []
}

export const getFollowing = async (privyUserId: string): Promise<Profile[]> => {
  const { data: followRows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', privyUserId)
  if (!followRows?.length) return []

  const { data: users } = await supabase
    .from('users')
    .select('id')
    .in('privy_id', followRows.map(r => r.following_id))
  if (!users?.length) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', users.map((u: any) => u.id))
  return profiles || []
}

// ── Decks ─────────────────────────────────────────────────────────────────────

export interface Deck {
  id: string
  user_id: string
  username: string | null
  title: string
  description: string | null
  grid_layout: string
  cover_image_url: string | null
  is_public: boolean
  camera?: string | null
  lens?: string | null
  additional_notes?: string | null
  created_at: string
  updated_at: string
}

export interface DeckItem {
  id: string
  deck_id: string
  post_id: string | null
  media_url: string | null
  position: number
  created_at: string
}

export interface DeckItemWithMedia extends DeckItem {
  post: {
    id: string
    media_urls: string[]
    caption: string
    username: string
    user_id: string
    layout_id: string | null
    created_at: string
  } | null
}

export interface DeckWithItems extends Deck {
  items: DeckItemWithMedia[]
  item_count: number
}

export const createDeck = async (
  privyUserId: string,
  username: string,
  title: string,
  description: string,
  gridLayout = '1x-super-wide',
): Promise<Deck> => {
  const { data, error } = await supabase
    .from('decks')
    .insert({
      user_id: privyUserId,
      username,
      title,
      description: description || null,
      grid_layout: gridLayout,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export const getUserDecks = async (privyUserId: string): Promise<(Deck & { item_count: number; thumbnail_urls: string[] })[]> => {
  const { data: decks, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', privyUserId)
    .order('created_at', { ascending: false })
  if (error || !decks || decks.length === 0) return []

  const deckIds = decks.map((d: Deck) => d.id)
  const { data: items } = await supabase
    .from('deck_items')
    .select('deck_id, post_id, media_url, position')
    .in('deck_id', deckIds)
    .order('position', { ascending: true })

  const countMap = new Map<string, number>()
  const deckItemsMap = new Map<string, { post_id: string | null; media_url: string | null }[]>()
  for (const item of items || []) {
    countMap.set(item.deck_id, (countMap.get(item.deck_id) || 0) + 1)
    if (!deckItemsMap.has(item.deck_id)) deckItemsMap.set(item.deck_id, [])
    deckItemsMap.get(item.deck_id)!.push({ post_id: item.post_id, media_url: item.media_url })
  }

  // Batch-fetch post media_urls for items that don't have a direct media_url
  const postIds = [...new Set(
    (items || []).filter(i => i.post_id && !i.media_url).map(i => i.post_id as string)
  )]
  const postMediaMap = new Map<string, string>()
  if (postIds.length > 0) {
    const { data: posts } = await supabase
      .from('posts').select('id, media_urls').in('id', postIds)
    for (const p of posts || []) {
      if (p.media_urls?.[0]) postMediaMap.set(p.id, p.media_urls[0])
    }
  }

  return decks.map((d: Deck) => {
    const deckItems = deckItemsMap.get(d.id) || []
    const thumbnail_urls = deckItems
      .slice(0, 9)
      .map(i => i.media_url || (i.post_id ? postMediaMap.get(i.post_id) ?? null : null))
      .filter((u): u is string => !!u)
    return { ...d, item_count: countMap.get(d.id) || 0, thumbnail_urls }
  })
}

export const getDecksByUsername = async (username: string): Promise<(Deck & { item_count: number })[]> => {
  const profile = await getProfileByUsername(username)
  if (!profile) return []
  const user = await getUserById(profile.user_id)
  if (!user) return []
  const all = await getUserDecks(user.privy_id)
  return all.filter(d => d.is_public)
}

export const getDeckById = async (deckId: string): Promise<DeckWithItems | null> => {
  const { data: deck, error } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .single()
  if (error || !deck) return null

  const { data: items } = await supabase
    .from('deck_items')
    .select('*')
    .eq('deck_id', deckId)
    .order('position', { ascending: true })

  if (!items || items.length === 0) return { ...deck, items: [], item_count: 0 }

  const postIds = items
    .filter((i: DeckItem) => i.post_id)
    .map((i: DeckItem) => i.post_id as string)

  const postMap = new Map<string, any>()
  if (postIds.length > 0) {
    const { data: posts } = await supabase
      .from('posts')
      .select('id, media_urls, caption, username, user_id, layout_id, created_at')
      .in('id', postIds)
    for (const p of posts || []) postMap.set(p.id, p)
  }

  const enriched: DeckItemWithMedia[] = items.map((item: DeckItem) => ({
    ...item,
    media_url:
      item.media_url ||
      (item.post_id ? (postMap.get(item.post_id)?.media_urls?.[0] ?? null) : null),
    post: item.post_id ? (postMap.get(item.post_id) ?? null) : null,
  }))

  return { ...deck, items: enriched, item_count: items.length }
}

export const addPostToDeck = async (deckId: string, postId: string): Promise<DeckItem> => {
  const { data: duplicate } = await supabase
    .from('deck_items')
    .select('id')
    .eq('deck_id', deckId)
    .eq('post_id', postId)
    .maybeSingle()
  if (duplicate) throw new Error('This post is already in this deck')

  const { data: existing } = await supabase
    .from('deck_items')
    .select('position')
    .eq('deck_id', deckId)
    .order('position', { ascending: false })
    .limit(1)
  const nextPos = (existing?.[0]?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('deck_items')
    .insert({ deck_id: deckId, post_id: postId, position: nextPos })
    .select()
    .single()
  if (error) throw error

  // Set cover if deck has none
  const { data: deckRow } = await supabase
    .from('decks')
    .select('cover_image_url')
    .eq('id', deckId)
    .single()
  if (!deckRow?.cover_image_url) {
    const { data: post } = await supabase
      .from('posts')
      .select('media_urls')
      .eq('id', postId)
      .single()
    if (post?.media_urls?.[0]) {
      await supabase
        .from('decks')
        .update({ cover_image_url: post.media_urls[0] })
        .eq('id', deckId)
    }
  }

  return data
}

export const addMediaToDeck = async (deckId: string, mediaUrl: string): Promise<DeckItem> => {
  const { data: existing } = await supabase
    .from('deck_items')
    .select('position')
    .eq('deck_id', deckId)
    .order('position', { ascending: false })
    .limit(1)
  const nextPos = (existing?.[0]?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('deck_items')
    .insert({ deck_id: deckId, media_url: mediaUrl, position: nextPos })
    .select()
    .single()
  if (error) throw error

  const { data: deckRow } = await supabase
    .from('decks')
    .select('cover_image_url')
    .eq('id', deckId)
    .single()
  if (!deckRow?.cover_image_url) {
    await supabase.from('decks').update({ cover_image_url: mediaUrl }).eq('id', deckId)
  }

  return data
}

export const removeFromDeck = async (deckId: string, itemId: string): Promise<void> => {
  const { error } = await supabase
    .from('deck_items')
    .delete()
    .eq('id', itemId)
    .eq('deck_id', deckId)
  if (error) throw error
}

export const deleteDeck = async (deckId: string): Promise<void> => {
  const { error } = await supabase.from('decks').delete().eq('id', deckId)
  if (error) throw error
}

// ── Profile Links ────────────────────────────────────────────────────

export interface ProfileLink {
  id: string;
  user_id: string;
  title: string | null;
  url: string;
  thumbnail_url: string | null;
  video_url: string | null;
  is_video: boolean;
  position: number;
  description: string | null;
  custom_thumbnail_url: string | null;
  created_at: string;
}

export const getProfileLinks = async (privyUserId: string): Promise<ProfileLink[]> => {
  try {
    const { data, error } = await supabase
      .from('profile_links')
      .select('*')
      .eq('user_id', privyUserId)
      .order('position', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching profile links:', sbErr(error));
    return [];
  }
};

export const saveProfileLinks = async (
  privyUserId: string,
  links: Omit<ProfileLink, 'id' | 'created_at'>[],
): Promise<void> => {
  // Delete existing then insert fresh (simplest for ordered list)
  const { error: delError } = await supabase
    .from('profile_links')
    .delete()
    .eq('user_id', privyUserId);
  if (delError) throw delError;

  if (links.length === 0) return;
  const rows = links.map((l, i) => ({ ...l, user_id: privyUserId, position: i }));
  const { error: insError } = await supabase.from('profile_links').insert(rows);
  if (insError) throw insError;
};

export const deleteProfileLink = async (linkId: string): Promise<void> => {
  const { error } = await supabase.from('profile_links').delete().eq('id', linkId);
  if (error) throw error;
};

export const updateDeck = async (
  deckId: string,
  updates: Partial<Pick<Deck, 'title' | 'description' | 'grid_layout' | 'cover_image_url' | 'is_public' | 'camera' | 'lens' | 'additional_notes'>>,
): Promise<Deck> => {
  const { data, error } = await supabase
    .from('decks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', deckId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateProfileFields = async (
  supabaseUserId: string,
  fields: Partial<{
    display_name: string;
    username: string;
    bio: string;
    profile_image_url: string;
    kit_camera: string;
    kit_lens: string;
    kit_favorite_tool: string;
    contact_email: string;
    contact_email_public: boolean;
  }>
): Promise<void> => {
  const { error } = await supabase
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('user_id', supabaseUserId);
  if (error) throw error;
};

export const addProfileLink = async (
  privyUserId: string,
  link: { url: string; title?: string | null; position: number }
): Promise<ProfileLink> => {
  const { data, error } = await supabase
    .from('profile_links')
    .insert([{
      user_id: privyUserId,
      url: link.url,
      title: link.title ?? null,
      position: link.position,
      is_video: false,
      thumbnail_url: null,
      video_url: null,
      description: null,
      custom_thumbnail_url: null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
};
