import { supabase } from './supabase/client'
import type { User, Profile } from './supabase'

// ── Session cache + in-flight dedup for profile/user reads ───────────────────
//
// The feed fetched the viewer's profile/user PER CARD (46 posts × re-render churn
// = ~2,000 identical requests). These rows barely change mid-session, so we cache
// the resolved value (session-lived — no TTL) and, crucially, return the SAME
// in-flight promise for concurrent callers so N simultaneous reads = 1 round-trip.
// Writes invalidate the key so edits still show. Only successful non-null results
// are cached (a null/error is retriable — never a stuck empty entry).
const profileCache = new Map<string, Profile>();
const profileInflight = new Map<string, Promise<Profile | null>>();
const userCache = new Map<string, User>();
const userInflight = new Map<string, Promise<User | null>>();

/** Bust a cached profile (call after any write to profiles.<user_id>). */
export const invalidateProfileCache = (userId: string): void => {
  profileCache.delete(userId); profileInflight.delete(userId);
};
/** Bust a cached user (call after a write to the users row). */
// THE PRO-UNLOCK FIX: purchases flip is_paid_member in the DB, but getProfile
// serves this module cache with no TTL — the post-purchase refetch was reading
// (and re-caching) the STALE pre-Pro profile, so gates never lifted without a
// reload. Every purchase-resolution path must call this BEFORE dispatching
// 'scope:pro-activated'.
export const invalidateMembership = async (privyId: string): Promise<void> => {
  try {
    const u = await getUserByPrivyId(privyId); // users row is static — cached read fine
    if (u?.id) invalidateProfileCache(u.id);
  } catch { /* refetch will still hit the cache-miss path next eviction */ }
};

export const invalidateUserCache = (privyId: string): void => {
  userCache.delete(privyId); userInflight.delete(privyId);
};

function sbErr(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as Record<string, unknown>;
  return [e.message, e.code, e.details, e.hint].filter(Boolean).join(' | ') || JSON.stringify(error);
}

export const syncUserWithSupabase = async (
  privyUser: { id: string; wallet?: { address: string } },
  // Brief W10a — the EMBEDDED wallet address (getEmbeddedAddress), resolved by the caller
  // which has useWallets(). Omitted → falls back to the primary (privyUser.wallet.address) for
  // back-compat, but the primary caller (UserSyncProvider) now always passes the embedded.
  walletAddress?: string | null,
): Promise<User | null> => {
  console.log('[syncUserWithSupabase] called for privy_id:', privyUser.id);

  try {
    const resolved = walletAddress !== undefined ? walletAddress : (privyUser.wallet?.address ?? null);
    // W10a — only write a REAL address; NEVER overwrite an existing good wallet_address with
    // null (the embedded can be transiently absent while Privy creates it). Omitting the column
    // preserves the current value on conflict (insert → DB null default).
    const payload: { privy_id: string; wallet_address?: string } = { privy_id: privyUser.id };
    if (resolved) payload.wallet_address = resolved;

    // Upsert on privy_id — idempotent, never fails on duplicate, always returns the row
    const { data, error } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'privy_id' })
      .select()
      .single();

    if (error) {
      console.error('[syncUserWithSupabase] upsert error:', sbErr(error));
      throw error;
    }

    console.log('[syncUserWithSupabase] upsert result — id:', data?.id, 'privy_id:', data?.privy_id);
    invalidateUserCache(privyUser.id); // fresh sync (e.g. wallet linked) → drop stale cache
    if (data) userCache.set(privyUser.id, data as User);
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
  /** profiles.location (nullable) — tolerant if the migration hasn't run. */
  location?: string
  /** profiles.short_bio (nullable, ≤80) — the DESKTOP display bio. */
  shortBio?: string
}) => {
  // ALL-CAPS IDENTITY (ratified): handles + display names store UPPERCASE — at
  // the app layer here AND a DB trigger (migrations/2026-06-13_uppercase_identity.sql)
  // so non-UI write paths can't bypass the invariant.
  const username = (profileData.username ?? '').toUpperCase()
  const displayName = (profileData.displayName ?? '').toUpperCase()

  // Record old handle before overwriting so old URLs redirect to the new one
  if (username) {
    const { data: current } = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', userId)
      .maybeSingle()
    if (current?.username && current.username !== username) {
      await supabase
        .from('handle_history')
        .upsert({ old_username: current.username, user_id: userId }, { onConflict: 'old_username' })
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      user_id: userId,
      display_name: displayName,
      username: username,
      bio: profileData.bio,
      profile_image_url: profileData.profileImageUrl,
      website_url: profileData.websiteUrl ?? null,
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw error
  // location — tolerant separate write (column may predate the migration)
  if (profileData.location !== undefined) {
    const { error: le } = await supabase.from('profiles').update({ location: profileData.location || null }).eq('user_id', userId)
    if (le) console.warn('[saveProfile] location write failed (migration pending?):', le.message)
  }
  if (profileData.shortBio !== undefined) {
    const { error: se } = await supabase.from('profiles').update({ short_bio: profileData.shortBio.slice(0, 80) || null }).eq('user_id', userId)
    if (se) console.warn('[saveProfile] short_bio write failed (migration pending?):', se.message)
  }
  invalidateProfileCache(userId)
  return data
}

export const saveGridLayout = async (userId: string, gridLayout: string): Promise<void> => {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, grid_layout: gridLayout }, { onConflict: 'user_id' })
  if (error) throw error
  invalidateProfileCache(userId)
}

export const getProfile = async (userId: string): Promise<Profile | null> => {
  const cached = profileCache.get(userId)
  if (cached) return cached
  const inflight = profileInflight.get(userId)
  if (inflight) return inflight

  const p = (async (): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      const val = (data as Profile) || null
      if (val) profileCache.set(userId, val)   // cache only real hits (null is retriable)
      return val
    } catch (error) {
      console.error('Error fetching profile:', sbErr(error))
      return null
    } finally {
      profileInflight.delete(userId)
    }
  })()
  profileInflight.set(userId, p)
  return p
}

/** Reset the recap cutoff to now (called on recap dismiss). Needs profiles.last_seen_at. */
export const setLastSeen = async (userId: string): Promise<void> => {
  try {
    await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('user_id', userId)
    invalidateProfileCache(userId)
  } catch (error) {
    console.error('Error setting last_seen_at:', sbErr(error))
  }
}

/** Persist the "show While You Were Away on return" setting. Needs profiles.show_recap. */
export const setShowRecap = async (userId: string, show: boolean): Promise<void> => {
  try {
    await supabase.from('profiles').update({ show_recap: show }).eq('user_id', userId)
    invalidateProfileCache(userId)
  } catch (error) {
    console.error('Error setting show_recap:', sbErr(error))
  }
}

/**
 * Single source of truth for "is this user Pro". A member is Pro while their
 * `paid_member_until` is in the future. Pass the profile loaded via the verified
 * path (getUserByPrivyId(did) → getProfile(users.id) → profile). Replaces the
 * inline copies that were scattered across profile/links/decks pages.
 */
export const isProMember = (profile: { paid_member_until?: string | null } | null | undefined): boolean => {
  const until = profile?.paid_member_until ? new Date(profile.paid_member_until) : null;
  return until ? until > new Date() : false;
};

export const getProfileByUsername = async (username: string): Promise<Profile | null> => {
  try {
    // Handles store UPPERCASE, but a URL can arrive in any case — match either
    // (exact, underscore-safe; covers the transition before the migration runs).
    const variants = [...new Set([username, username.toUpperCase(), username.toLowerCase()])]
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('username', variants)
      .limit(1)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return data || null
  } catch (error) {
    console.error('Error fetching profile by username:', sbErr(error))
    return null
  }
}

// Resolves a username that may be current or historical (after a handle change).
// Returns the profile + a redirectTo handle if the requested username is stale.
export const resolveProfileByUsername = async (
  username: string
): Promise<{ profile: Profile | null; redirectTo: string | null }> => {
  const profile = await getProfileByUsername(username)
  if (profile) return { profile, redirectTo: null }

  // Check handle history for a renamed user
  const histVariants = [...new Set([username, username.toUpperCase(), username.toLowerCase()])]
  const { data: history } = await supabase
    .from('handle_history')
    .select('user_id')
    .in('old_username', histVariants)
    .limit(1)
    .maybeSingle()

  if (!history) return { profile: null, redirectTo: null }

  const { data: current } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', history.user_id)
    .maybeSingle()

  if (!current?.username) return { profile: null, redirectTo: null }

  return { profile: current as Profile, redirectTo: current.username }
}

export const uploadImage = async (file: File, bucket: string = 'profile-images', privyUserId?: string): Promise<string> => {
  const fileExt = file.name.split('.').pop()
  const prefix = privyUserId ? privyUserId.replace(/[^a-zA-Z0-9-]/g, '_') : 'public'
  const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, { cacheControl: '31536000', upsert: false }) // 1yr — filenames are unique, safe to cache immutably

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName)
  return publicUrl
}

/**
 * Upload a post-media IMAGE, then bake its display renditions SERVER-SIDE (sharp,
 * via /api/renditions) at `{masterPath}.600.webp` / `.1600.webp` — the exact paths
 * feedImage derives, so nothing is stored in the DB. Server sharp replaces the old
 * CLIENT canvas.toBlob('image/webp'), which fell back to PNG on iOS and produced
 * renditions LARGER than the master. Renditions are BEST-EFFORT + fire-and-forget:
 * a failure just means that image rides the master via the global onError fallback.
 * Returns the MASTER url. Use for images shown through feedImage (post photos, video
 * posters); leave plain uploadImage for non-displayed assets (autoplay clips).
 */
export const uploadImageWithRenditions = async (
  file: File,
  bucket: string = 'post-media',
  privyUserId?: string,
): Promise<string> => {
  const masterUrl = await uploadImage(file, bucket, privyUserId);
  // FIRE-AND-FORGET — NEVER awaited. Rendition baking is an OPTIMIZATION and must not
  // block or gate the publish/mint. It used to be awaited: on the deployment the route
  // (sharp cold-start + fetch/upload) could stall past the function limit, and because
  // the MAIN-image call at handlePost is not itself try/caught, that stall/instability
  // took the whole publish down before the coin mint ever fired. Now the request is
  // dispatched and forgotten (keepalive → completes even if the flow finishes); any
  // failure is irrelevant — the image rides the master via the onError fallback until
  // the retry/backfill catches it. The mint path can no longer be blocked by this.
  try {
    void fetch('/api/renditions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterUrl }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* dispatch itself never throws */ }
  return masterUrl;
}

export const getUserByPrivyId = async (privyId: string): Promise<User | null> => {
  const cached = userCache.get(privyId)
  if (cached) return cached
  const inflight = userInflight.get(privyId)
  if (inflight) return inflight

  const p = (async (): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('privy_id', privyId)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      const val = (data as User) || null
      if (val) userCache.set(privyId, val)   // cache only real hits (null is retriable)
      return val
    } catch (error) {
      console.error('Error fetching user by Privy ID:', sbErr(error))
      return null
    } finally {
      userInflight.delete(privyId)
    }
  })()
  userInflight.set(privyId, p)
  return p
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
  type: 'like' | 'comment' | 'follow' | 'collect' | 'message' | 'reply' | 'comment_like'
  post_id: string | null
  post_image_url: string | null
  /** The post's immutable layout (set at creation) → its TRUE aspect ratio. Used
   *  to render the notification thumbnail at the real AR (via getAspectRatio),
   *  the same source the feed + Screening Room use. Resolved at read time. */
  post_layout_id?: string | null
  message: string | null
  is_read: boolean
  created_at: string
  /** Actor's CURRENT profile, resolved at read time from sender_id (see below).
   *  Prefer these over the baked sender_username/sender_avatar for display + nav. */
  actor_handle?: string | null
  actor_avatar?: string | null
}

export const getNotifications = async (privyUserId: string): Promise<AppNotification[]> => {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', privyUserId)
    .order('created_at', { ascending: false })
    .limit(50)
  const rows = (data || []) as AppNotification[]
  if (rows.length === 0) return rows

  // Resolve each referenced post's layout_id (its TRUE aspect ratio) in one batch
  // — so the thumbnail renders at the real AR, not a forced square.
  const postIds = [...new Set(rows.map(r => r.post_id).filter(Boolean))] as string[]
  const { data: postRows } = postIds.length
    ? await supabase.from('posts').select('id, layout_id').in('id', postIds)
    : { data: [] as { id: string; layout_id: string | null }[] }
  const layoutByPost = new Map((postRows || []).map(p => [p.id, p.layout_id]))

  // Resolve each actor's CURRENT profile (handle + avatar) from sender_id, so the
  // bell shows the real @handle + PFP — and repairs rows whose baked
  // sender_username was garbage (e.g. derived from a Privy email object →
  // "[object Object]"). sender_id is the actor's Privy DID on like/comment/follow;
  // translate DID → users.id → profiles.user_id. (Any sender_id already stored as
  // a uuid — a legacy path — falls through to a direct profiles lookup.)
  const senderIds = [...new Set(rows.map(r => r.sender_id).filter(Boolean))]
  const { data: users } = await supabase
    .from('users').select('id, privy_id').in('privy_id', senderIds)
  const uuidByDid = new Map((users || []).map(u => [u.privy_id, u.id]))
  const directUuids = senderIds.filter(s => !uuidByDid.has(s)) // sender_id stored as uuid
  const allUuids = [...new Set([...(users || []).map(u => u.id), ...directUuids])]
  const { data: profiles } = allUuids.length
    ? await supabase.from('profiles').select('user_id, username, profile_image_url').in('user_id', allUuids)
    : { data: [] as any[] }
  const profByUuid = new Map((profiles || []).map(p => [p.user_id, p]))

  return rows.map(r => {
    const uuid = r.sender_id ? (uuidByDid.get(r.sender_id) ?? r.sender_id) : null
    const p = uuid ? profByUuid.get(uuid) : null
    return {
      ...r,
      actor_handle: p?.username ?? null,
      actor_avatar: p?.profile_image_url ?? null,
      post_layout_id: r.post_id ? (layoutByPost.get(r.post_id) ?? null) : null,
    }
  })
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

/** Set THE primary link (one per user, service-enforced): clears the flag on
 *  all the user's links, sets it on one. Tolerant pre-migration. */
export const setPrimaryLink = async (privyUserId: string, linkId: string): Promise<boolean> => {
  try {
    const { error: clearErr } = await supabase.from('profile_links').update({ is_primary: false }).eq('user_id', privyUserId)
    if (clearErr) { console.warn('[links] primary clear failed (migration pending?):', clearErr.message); return false }
    const { error } = await supabase.from('profile_links').update({ is_primary: true }).eq('id', linkId).eq('user_id', privyUserId)
    if (error) { console.warn('[links] primary set failed:', error.message); return false }
    return true
  } catch { return false }
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
  thumbnail_url?: string | null // baked collage cover (deckCollage); null → (re)bake
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
    // Brief M5 §1 — also pull the poster fields so VIDEO posts (Stream: media_urls=[])
    // contribute a thumbnail (their graded poster) instead of nothing → video-only decks
    // render a collage. feedImage() handles both image renditions and Stream poster URLs.
    const { data: posts } = await supabase
      .from('posts').select('id, media_urls, stream_poster_url, poster_url, thumbnail_url').in('id', postIds)
    for (const p of posts || []) {
      const thumb = p.media_urls?.[0] ?? p.stream_poster_url ?? p.poster_url ?? p.thumbnail_url
      if (thumb) postMediaMap.set(p.id, thumb)
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

// Deck list WITHOUT thumbnail composites — for the add-to-deck picker, which only
// needs title + cover_image_url + item_count. Skips getUserDecks' posts-media .in()
// query (the amplifying one: it fans out over every item across every deck to build
// the live 9-up thumbnail_urls the picker never renders). Two light queries only.
export const getUserDecksBasic = async (privyUserId: string): Promise<(Deck & { item_count: number })[]> => {
  const { data: decks, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', privyUserId)
    .order('created_at', { ascending: false })
  if (error || !decks || decks.length === 0) return []

  const deckIds = decks.map((d: Deck) => d.id)
  const { data: items } = await supabase
    .from('deck_items')
    .select('deck_id')
    .in('deck_id', deckIds)

  const countMap = new Map<string, number>()
  for (const item of items || []) countMap.set(item.deck_id, (countMap.get(item.deck_id) || 0) + 1)

  return decks.map((d: Deck) => ({ ...d, item_count: countMap.get(d.id) || 0 }))
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
  // DECKS = OWN WORK ONLY (ratified): structurally enforced — a deck may only
  // contain posts authored by the deck's owner. (Decks curate what you MADE;
  // collected-grouping will curate what you OWN.) DB-level trigger guard
  // proposed in migrations/2026-06-13_deck_own_work_guard.sql.
  const [{ data: deck }, { data: post }] = await Promise.all([
    supabase.from('decks').select('user_id').eq('id', deckId).single(),
    supabase.from('posts').select('user_id').eq('id', postId).single(),
  ])
  if (!deck || !post) throw new Error('Deck or post not found')

  // OWNERSHIP — compare in ONE id space (Supabase UUID). The two columns live in
  // DIFFERENT spaces: decks.user_id holds the Privy DID (createDeck keys off user.id),
  // posts.user_id holds the Supabase UUID (= profiles.user_id). A raw DID !== UUID
  // compare ALWAYS failed — rejecting you from your own decks. Resolve the deck
  // owner's DID → users.id, then compare to post.user_id. The own-work-only rule is
  // preserved: someone else's post (a different UUID) is still rejected.
  let deckOwnerUuid: string | null = deck.user_id
  if (typeof deck.user_id === 'string' && deck.user_id.startsWith('did:')) {
    const { data: ownerRow } = await supabase
      .from('users').select('id').eq('privy_id', deck.user_id).single()
    deckOwnerUuid = ownerRow?.id ?? null
  }
  if (!deckOwnerUuid || deckOwnerUuid !== post.user_id) throw new Error('Decks hold your own work only')

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

  // Posts changed → clear the baked collage cover so it re-bakes on next display.
  // Tolerant pre-migration (column may not exist; the error is ignored).
  await supabase.from('decks').update({ thumbnail_url: null }).eq('id', deckId)
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

  await supabase.from('decks').update({ thumbnail_url: null }).eq('id', deckId) // re-bake trigger
  return data
}

export const removeFromDeck = async (deckId: string, itemId: string): Promise<void> => {
  const { error } = await supabase
    .from('deck_items')
    .delete()
    .eq('id', itemId)
    .eq('deck_id', deckId)
  if (error) throw error
  await supabase.from('decks').update({ thumbnail_url: null }).eq('id', deckId) // re-bake trigger
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
  updates: Partial<Pick<Deck, 'title' | 'description' | 'grid_layout' | 'cover_image_url' | 'thumbnail_url' | 'is_public' | 'camera' | 'lens' | 'additional_notes'>>,
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
    divider_line: string | null;
    holo_banner: boolean;
    more_from: string[]; // post_ids featured in the desktop lightbox MORE FROM shelf
    aspect_ratio: string; // SHARED layout AR (see layoutModel)
    mobile_count: number; // mobile grid columns (1|2)
    desktop_count: number; // desktop grid columns (3|4|5)
    grid_layout: string; // legacy mirror (kept in sync so un-migrated readers reflect AR)
    decks_count: number; // desktop decks grid columns (3|4|5), default 4
  }>
): Promise<void> => {
  // Identity is ALWAYS uppercase — enforce here so no write path bypasses it
  // (the DB trigger is the final guarantee; this keeps app state consistent).
  if (typeof fields.username === 'string') fields = { ...fields, username: fields.username.toUpperCase() }
  if (typeof fields.display_name === 'string') fields = { ...fields, display_name: fields.display_name.toUpperCase() }

  // Record old handle before overwriting so old URLs redirect to the new one
  if (fields.username) {
    const { data: current } = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', supabaseUserId)
      .maybeSingle()
    if (current?.username && current.username !== fields.username) {
      await supabase
        .from('handle_history')
        .upsert({ old_username: current.username, user_id: supabaseUserId }, { onConflict: 'old_username' })
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('user_id', supabaseUserId);
  if (error) throw error;
  invalidateProfileCache(supabaseUserId);
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

// ── Brief D7 §3 — CREATOR SEARCH (desktop home) ──────────────────────────────
// The desktop "SEARCH" control shipped as decorative chrome only — no input, no
// query, no results (never a regression; it was never wired). This is the query
// path: match username OR display_name (case-insensitive substring), capped.
export interface CreatorResult {
  user_id: string;
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
}

export async function searchCreators(query: string, limit = 8): Promise<CreatorResult[]> {
  // Sanitise to a safe subset — usernames/handles are alphanumeric; this also
  // neutralises PostgREST or()-filter breakers (commas, parens) and LIKE wildcards.
  const safe = query.trim().replace(/[^a-zA-Z0-9 ._-]/g, '');
  if (safe.length < 1) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, display_name, profile_image_url')
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .not('username', 'is', null)
    .limit(limit);
  if (error || !data) return [];
  return data as CreatorResult[];
}
