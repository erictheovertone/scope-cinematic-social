// ── The PUBLIC profile — the only data a logged-out visitor ever sees (Brief ARR-1) ────────────
// Server-only. Reads with the service role, and the RETURN is an explicit allowlist built field by
// field: username, display name, avatar, bio, frames count, decks count, badges, and per-post media
// + aspect for the grid. Never the profile row; never contact_email, stripe_*, wallet, privy_id,
// payment or membership dates. Both /api/public-profile/[username] and the server-rendered
// /[username] Arrival page read through getPublicProfile — one layer, one allowlist.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, getAddress } from 'viem';
import { base } from 'viem/chains';
import { resolveLayout, legacyLayoutId } from '@/lib/layoutModel';
import { getAspectRatio } from '@/lib/aspectRatio';
import { resolveBadges, BADGE_DISPLAY_NAME, type BadgeKey } from '@/lib/economy/badges';
import { TOKENS_PER_PIECE } from '@/lib/economy/tokenomics';

export interface PublicFrame {
  /** Still image for the grid / theatre (the image itself, or the video's poster). */
  image: string;
  /** Playable video for the theatre, when the post is a video (HLS when ready, else the file). */
  video: string | null;
  /** CSS aspect ("2.39 / 1") of the post itself — the theatre + collage tiles. */
  aspect: string;
  /** ARR-2 — whether a baked rendition exists for this image (posts.media_has_renditions). The
   *  Arrival <img> requests a rendition ONLY when true; else it loads the master directly, so a
   *  legacy frame never 404s a `.{w}.webp` and the anon grid never decode-storms. */
  hasRenditions: boolean;
}

export interface PublicProfile {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  framesCount: number;
  decksCount: number;
  /** Earned badges, rarity order — key + user-facing name only. */
  badges: { key: BadgeKey; name: string }[];
  /** AUG-1 — an ACTIVE Augmented Pro member (brass frame + tag on the card). A derived boolean
   *  only: the tier column and the membership dates never leave this file. */
  augmented: boolean;
  /** The owner's grid layout (legacy layout id the grid readers understand) + column counts. */
  layoutId: string;
  mobileCols: number;
  desktopCols: number;
  frames: PublicFrame[];
}

/** Every key the public payload may carry — anon-smoke asserts the response against this. */
export const PUBLIC_PROFILE_KEYS = ['username', 'displayName', 'avatarUrl', 'bio', 'framesCount', 'decksCount', 'badges', 'augmented', 'layoutId', 'mobileCols', 'desktopCols', 'frames'] as const;
export const PUBLIC_FRAME_KEYS = ['image', 'video', 'aspect', 'hasRenditions'] as const;

const MAX_FRAMES = 60;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const BALANCE_OF_ABI = [{
  type: 'function', name: 'balanceOf', stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
}] as const;

/** First Cut, holding-gated exactly like the economy boundary's getBadges (awards ∩ held ≥ 1 piece).
 *  The wallet is read and used HERE only — it never leaves this function. */
async function firstCutCount(db: ReturnType<typeof admin>, userId: string, wallet: string | null): Promise<number> {
  let res = await db.from('first_cut_awards').select('coin_address').eq('user_id', userId).is('expired_at', null);
  if (res.error) res = await db.from('first_cut_awards').select('coin_address').eq('user_id', userId);
  const coins = (res.data ?? []).map((r: { coin_address?: string | null }) => (r.coin_address ?? '').toLowerCase()).filter(Boolean);
  if (!coins.length || !wallet) return coins.length;
  const client = createPublicClient({ chain: base, transport: http(process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || "https://mainnet.base.org") });
  const min = BigInt(TOKENS_PER_PIECE) * BigInt('1000000000000000000');
  const held = await Promise.all(coins.map(async (c) => {
    try {
      const bal = (await client.readContract({ address: getAddress(c), abi: BALANCE_OF_ABI, functionName: 'balanceOf', args: [getAddress(wallet)] })) as bigint;
      return bal >= min;
    } catch { return true; } // unresolved read → keep (never falsely hide), as the boundary does
  }));
  return held.filter(Boolean).length;
}

export async function getPublicProfile(rawUsername: string): Promise<PublicProfile | null> {
  const username = decodeURIComponent(rawUsername || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(username)) return null;
  const db = admin();

  // Explicit columns — the private ones are never even selected.
  const { data: p } = await db
    .from('profiles')
    .select('user_id, username, display_name, profile_image_url, bio, aspect_ratio, mobile_count, desktop_count, grid_layout, desktop_layout, is_founding_member, is_top_collector, is_in_house_creator, is_screening_room_holder, paid_member_until')
    .ilike('username', username.replace(/[%_]/g, (m) => `\\${m}`))
    .maybeSingle();
  if (!p?.username || !p.user_id) return null;
  const uid = String(p.user_id);

  // ARR-7 — decks.user_id holds the owner's Privy DID (posts.user_id is the Supabase UUID), so the
  // decks count keys on the DID read here. The DID, like the wallet, never leaves this file.
  const userRes = await db.from('users').select('wallet_address, privy_id').eq('id', uid).maybeSingle();
  const did = (userRes.data?.privy_id as string | null) ?? null;

  const [postsRes, framesCountRes, decksRes, tracksRes, tierRes] = await Promise.all([
    db.from('posts')
      .select('media_urls, media_type, layout_id, thumbnail_url, poster_url, stream_poster_url, stream_playback_url, video_status, media_has_renditions')
      .eq('user_id', uid).eq('is_deleted', false)
      .order('is_pinned', { ascending: false }).order('created_at', { ascending: false })
      .limit(MAX_FRAMES),
    db.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('is_deleted', false),
    did
      ? db.from('decks').select('id', { count: 'exact', head: true }).eq('user_id', did).neq('is_public', false)
      : Promise.resolve({ count: 0 }),
    db.from('tracks').select('id', { count: 'exact', head: true }).eq('composer_user_id', uid).eq('status', 'approved'),
    // AUG-1 — membership_tier in its OWN query: pre-migration the column doesn't exist, and adding
    // it to the main select above would null the whole profile (→ 404). Here an error → not augmented.
    db.from('profiles').select('membership_tier').eq('user_id', uid).maybeSingle(),
  ]);

  const fc = await firstCutCount(db, uid, (userRes.data?.wallet_address as string | null) ?? null).catch(() => 0);
  const paidUntil = p.paid_member_until ? new Date(p.paid_member_until as string) : null;
  const paidActive = !!paidUntil && paidUntil.getTime() > Date.now();
  // Same rule as tierOf (src/lib/tier.ts, client-only): augmented needs an active paid period.
  const augmented = paidActive && !tierRes.error && (tierRes.data as { membership_tier?: string | null } | null)?.membership_tier === 'augmented';
  const badges = resolveBadges({
    isAugmented: augmented,
    isFoundingMember: !!p.is_founding_member,
    isTopCollector: !!p.is_top_collector,
    isInHouseCreator: !!p.is_in_house_creator,
    isScreeningRoomHolder: !!p.is_screening_room_holder,
    isPaidMember: paidActive,
    firstCutCount: fc,
    composerTrackCount: tracksRes.count ?? 0,
  })
    .map((b) => b.key)
    .filter((k) => k !== 'free')
    .map((key) => ({ key, name: BADGE_DISPLAY_NAME[key] }));

  const rl = resolveLayout(p);
  const layoutId = legacyLayoutId(rl.aspect, rl.mobileCount);

  type Row = { media_urls: string[] | null; media_type: string | null; layout_id: string | null; thumbnail_url: string | null; poster_url: string | null; stream_poster_url: string | null; stream_playback_url: string | null; video_status: string | null; media_has_renditions: boolean | null };
  const frames: PublicFrame[] = ((postsRes.data ?? []) as Row[]).flatMap((r) => {
    const isVideo = r.media_type === 'video';
    const file = r.media_urls?.[0] ?? null;
    const image = isVideo ? (r.stream_poster_url ?? r.poster_url ?? r.thumbnail_url) : (file ?? r.thumbnail_url);
    if (!image) return [];
    const video = isVideo ? ((r.video_status === 'ready' ? r.stream_playback_url : null) ?? file) : null;
    // Posters (video) never have baked renditions; a photo's rendition flag comes from the row.
    return [{ image, video, aspect: getAspectRatio(r.layout_id || 'scope'), hasRenditions: !isVideo && !!r.media_has_renditions }];
  });

  // Built field by field — nothing from the row passes through by spread.
  return {
    username: String(p.username),
    displayName: (p.display_name as string | null) ?? null,
    avatarUrl: (p.profile_image_url as string | null) ?? null,
    bio: (p.bio as string | null) ?? null,
    framesCount: framesCountRes.count ?? frames.length,
    decksCount: decksRes.count ?? 0,
    badges,
    augmented,
    layoutId,
    mobileCols: layoutId === 'collage' ? 2 : rl.mobileCount,
    desktopCols: rl.desktopCount,
    frames,
  };
}
