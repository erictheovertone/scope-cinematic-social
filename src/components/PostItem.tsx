"use client";

import { useState, useEffect, useRef, memo } from "react";
import { feedImage } from "@/lib/mediaUrl";
import { useRouter } from "next/navigation";
import FirstCutChip from "@/components/economy/FirstCutChip";
import PressPop from "@/components/PressPop";
import { usePrivy } from "@privy-io/react-auth";
import {
  likePost,
  unlikePost,
  getPostLikes,
  isPostLikedByUser,
  addComment,
  getPostComments,
} from "@/lib/postsService";
import { getUserByPrivyId, getProfile } from "@/lib/userService";
import CollectSheetGate from "@/components/economy/CollectSheetGate";
import { useEconomy } from "@/components/EconomyProvider";
import TickerMark from "@/components/economy/TickerMark";

// Post-to-post breathing room (was 32) — THE tunable; Eric eyeballs on device.
const FEED_POST_GAP_PX = 42; // Brief 2.1 (node 37:65): frame caption→next-byline whitespace ≈42px
import MediaRenderer from "@/components/MediaRenderer";
import GradedVideo from "@/components/finishing/GradedVideo";
import CommentList, { useCommentLikes, ReplyComposer, type UIComment } from "@/components/CommentList";
import MusicWaveButton from "@/components/music/MusicWaveButton";
import MusicTitleChip from "@/components/music/MusicTitleChip";
import { replyToComment } from "@/lib/commentInteractions";
import { supabase } from "@/lib/supabase/client";
import { getAspectRatio, ratioPadding } from "@/lib/aspectRatio";
import PillarboxFrame from "@/components/PillarboxFrame";

interface Post {
  id: string;
  user_id: string;
  username: string;
  caption: string;
  media_urls: string[];
  layout_id: string;
  aspect_ratio?: number | null;
  grid_layout?: string | null;
  created_at: string;
  profile_image_url?: string | null;
  is_minted?: boolean;
  contract_address?: string | null;
  token_id?: string | null;
  coin_address?: string | null;
  token_standard?: string | null;
  ticker?: string | null;
  media_type?: string;
  thumbnail_url?: string | null;
  poster_url?: string | null;
  autoplay_clip_url?: string | null;
  autoplay?: boolean;
  crop_x?: number;
  crop_y?: number;
  crop_width?: number;
  crop_height?: number;
  edit_params?: unknown;
}


interface PostItemProps {
  post: Post;
  /** Receives the post so the feed can pass a STABLE handler (memo holds). */
  onImageClick?: (post: Post) => void;
  /** Controlled inline-comments open state (one-at-a-time, owned by the feed).
   *  Falls back to internal state if the feed doesn't control it. */
  commentsOpen?: boolean;
  /** Receives the post id so the feed can pass a STABLE handler (memo holds). */
  onToggleComments?: (postId: string) => void;
  /** DESKTOP ONLY — wrap the card in the #030303/rgba(229,225,219,0.22) backdrop. Mobile never
   *  passes it → its floating-post feed is unchanged. */
  card?: boolean;
  /** Clamp the caption to 2 lines + a "… more" that opens the lightbox
   *  (onImageClick). Display-only; the stored caption is never cut. Passed by the
   *  desktop cards AND the mobile home feed. */
  clampCaption?: boolean;
  /** Above-the-fold cell (first 2–3 in the feed) → eager + high fetch priority so the
   *  first paint is instant. Below the fold stays lazy. */
  priority?: boolean;
  /** Brief F7 §3 — SANCTIONED house-rule exception (Eric's call): desktop home masonry
   *  ONLY. Grows the inner media wrapper to scale(1.02) on cell hover (PopIcon: layout
   *  box / border / hit geometry never change). Passed exclusively by DesktopHome so the
   *  scale exists NOWHERE else (profile grids reuse `card` but never pass this). */
  hoverGrow?: boolean;
}

const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

function PostItem({ post, onImageClick, commentsOpen, onToggleComments, card, clampCaption, priority, hoverGrow }: PostItemProps) {
  const router = useRouter();
  const { user } = usePrivy();
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [internalComments, setInternalComments] = useState(false);
  // Open state is controlled by the feed (one-at-a-time) when provided.
  const showComments = commentsOpen ?? internalComments;
  const toggleComments = onToggleComments ? () => onToggleComments(post.id) : (() => setInternalComments((v) => !v));
  // Internal wrapper so the feed's onImageClick prop can stay stable (post passed here).
  const openLightbox = onImageClick ? () => onImageClick(post) : undefined;
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<UIComment | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [viewerUsername, setViewerUsername] = useState("");
  const [viewerAvatar, setViewerAvatar] = useState<string | null>(null);
  const { likeStates, toggleLike } = useCommentLikes(comments, user?.id ?? null, viewerUsername);
  const [showCollectSheet, setShowCollectSheet] = useState(false);
  const [mc, setMc] = useState<string | null>(null);
  const economy = useEconomy();
  // Caption clamp (desktop cards only): detect whether 2 lines truncated it →
  // show the "… more" affordance. Display-only; the stored caption is untouched.
  const captionRef = useRef<HTMLParagraphElement>(null);
  const [captionClamped, setCaptionClamped] = useState(false);
  useEffect(() => {
    if (!clampCaption) return;
    const el = captionRef.current;
    if (el) setCaptionClamped(el.scrollHeight > el.clientHeight + 1);
  }, [clampCaption, post.caption]);

  useEffect(() => {
    if (!user) return;
    const loadViewer = async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        const profile = await getProfile(sbUser.id);
        if (profile?.username) setViewerUsername(profile.username);
        if (profile?.profile_image_url) setViewerAvatar(profile.profile_image_url);
      } catch (e) {
        console.error("PostItem viewer profile error:", e);
      }
    };
    loadViewer();
  }, [user?.id]);

  useEffect(() => {
    const load = async () => {
      try {
        const [l, c, liked] = await Promise.all([
          getPostLikes(post.id),
          getPostComments(post.id),
          user ? isPostLikedByUser(post.id, user.id) : Promise.resolve(false),
        ]);
        setLikes(l);
        setIsLiked(liked);
        // Enrich comments with commenter avatars (batched profiles read by username)
        // — the feed sheet shows real PFPs, level with the handle.
        const names = [...new Set((c as any[]).map((x) => x.username).filter(Boolean))];
        let avatarMap = new Map<string, string | null>();
        if (names.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles").select("username, profile_image_url").in("username", names);
          avatarMap = new Map((profiles || []).map((p) => [p.username, p.profile_image_url]));
        }
        setComments((c as any[]).map((x) => ({ ...x, profile_image_url: avatarMap.get(x.username) ?? null })));
      } catch (e) {
        console.error("Error loading post data:", e);
      }
    };
    load();
  }, [post.id, user?.id]);

  // Real MC for COIN posts via the boundary (Zora index; honest $0 pre-trades).
  // Re-reads when a trade on this post lands ('scope:market-moved') so the
  // tile reflects post-trade truth where the collector returns.
  const [marketRefreshKey, setMarketRefreshKey] = useState(0);
  useEffect(() => {
    const onMoved = (e: Event) => {
      if ((e as CustomEvent).detail?.postId === post.id) setMarketRefreshKey((k) => k + 1);
    };
    window.addEventListener('scope:market-moved', onMoved);
    return () => window.removeEventListener('scope:market-moved', onMoved);
  }, [post.id]);
  useEffect(() => {
    if (!post.coin_address || post.token_standard !== 'coin') return;
    let cancelled = false;
    let tries = 0;
    const MAX_TRIES = 6; // ~9s of retries before giving up on a stubborn read
    const attempt = () => {
      economy.getPostMarket(post.id)
        .then((m) => {
          if (cancelled) return;
          // UNRESOLVED (transient — a 429 burst left this read empty): retry
          // shortly, keep the loading "…", never render a misleading $0/"—".
          if (m.marketResolved === false && tries < MAX_TRIES) {
            tries++;
            setTimeout(attempt, 1500);
            return;
          }
          // RESOLVED: real MC, or "—" for a genuinely untraded coin (marketCap 0).
          setMc(m.mcUsd > 0 ? `$${m.mcUsd < 1 ? m.mcUsd.toFixed(2) : Math.round(m.mcUsd).toLocaleString()}` : '—');
        })
        .catch((e) => console.error('[PostItem] coin MC fetch error:', e));
    };
    attempt();
    return () => { cancelled = true; };
  }, [post.id, post.coin_address, post.token_standard, economy, marketRefreshKey]);

  // Legacy 1155 posts show NO market chrome: their old "MC" was supply × the
  // flat mint fee — a fake market figure from the pre-coin era. Coin posts get
  // the real MC via the boundary (effect above); legacy gets nothing.

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    // OPTIMISTIC: flip the UI now, fire the network in the background, revert on error.
    const wasLiked = isLiked;
    const prevLikes = likes;
    setIsLiked(!wasLiked);
    setLikes((prev) => wasLiked ? prev.filter((l) => l.user_id !== user.id) : [...prev, { user_id: user.id }]);
    try {
      if (wasLiked) await unlikePost(post.id, user.id);
      else await likePost(post.id, user.id, user.email ? String(user.email).split("@")[0] : "user");
    } catch (err) {
      console.error("Error toggling like:", err);
      setIsLiked(wasLiked);
      setLikes(prevLikes);
    }
  };

  const handleAddComment = async () => {
    if (!user || !newComment.trim()) return;
    // OPTIMISTIC: render the comment immediately, reconcile on success / mark failed.
    const text = newComment.trim();
    const tempId = `temp-${Date.now()}`;
    const optimistic = { id: tempId, content: text, username: viewerUsername || "user", user_id: user.id, profile_image_url: viewerAvatar, created_at: new Date().toISOString(), pending: true };
    setComments((prev) => [...prev, optimistic]);
    setNewComment("");
    try {
      const c = await addComment(post.id, user.id, viewerUsername || "user", text);
      setComments((prev) => prev.map((x) => (x.id === tempId ? { ...c, profile_image_url: viewerAvatar } : x)));
    } catch (e) {
      console.error("Error adding comment:", e);
      setComments((prev) => prev.map((x) => (x.id === tempId ? { ...x, pending: false, failed: true } : x)));
    }
  };

  // REPLIES → centered composer; optimistic nested insert (avatar carried).
  const submitReply = async (text: string) => {
    if (!user || !replyingTo) return;
    const parentId = replyingTo.parent_comment_id ? replyingTo.parent_comment_id : replyingTo.id;
    const tempId = `temp-${Date.now()}`;
    setComments((prev) => [...prev, { id: tempId, content: text, username: viewerUsername || "user", user_id: user.id, profile_image_url: viewerAvatar, parent_comment_id: parentId, created_at: new Date().toISOString(), pending: true }]);
    try {
      const c = await replyToComment(post.id, parentId, user.id, viewerUsername || "user", text);
      setComments((prev) => prev.map((x) => (x.id === tempId ? { ...c, profile_image_url: viewerAvatar } : x)));
    } catch (e) {
      console.error("Reply error:", e);
      setComments((prev) => prev.map((x) => (x.id === tempId ? { ...x, pending: false, failed: true } : x)));
      throw e;
    }
  };

  const is43 = (post.layout_id ?? '') === 'legacy';
  const paddingPercent = ratioPadding(getAspectRatio(post.layout_id ?? ''));

  // Metadata ROW — lifted OFF the media onto the black above it (layout nudge):
  // handle left, ticker+MC right, same type styles; the media stays clean.
  const metadataRow = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {post.profile_image_url && (
            <img src={feedImage(post.profile_image_url, 96)} style={{ width: '14px', height: '14px', borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <span
            className="tappable"
            onClick={(e) => { e.stopPropagation(); router.push('/profile/' + post.username); }}
            style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-8)', color: '#E5E1DB', cursor: 'pointer', textTransform: 'uppercase', display: 'inline-block' }}
          >
            @{post.username}
          </span>
        </div>
        {/* Brief W7 §2a — song title UNDER the handle (mirrors mobile feed), marquee, sentence case.
            Chrome zone (byline), NOT the media wrapper → never scales with hoverGrow. */}
        <MusicTitleChip post={post as { music_track_id?: string | null }} marquee uppercase={false} fontSize={11} weight={400} color="rgba(229,225,219,0.55)" glyphW={12} glyphH={9} windowPx={240} />
      </div>
      {/* Market chrome — coin posts only; legacy 1155 tiles show none. */}
      {post.token_standard === 'coin' && post.coin_address && (
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 'var(--fs-8)', color: '#E5E1DB', opacity: 0.85 }}>
          {post.ticker && <TickerMark ticker={post.ticker} size={11.5} />}
          <span>MC: {mc ?? '…'}</span>
        </span>
      )}
    </div>
  );

  // ── Brief 2.1 (node 37:65) — the DISCOVER mobile byline (only when !card) ──────
  // avatar 13×13 house ivory frame · [ at ] HANDLE (brackets 6px --font-light→55,
  // handle 8px 65 Medium, unit ~55%) · right: MC 8.5px 34% + $value 8.5px 71%.
  // Dash rule: unminted posts render NO MC/economics.
  // Brief F3: byline block = avatar · [ handle line, then SONG line ] (IG placement);
  // handle unit opacity 55%→66%; feed-local +4px scale (avatar 13→17, brackets 6→10,
  // handle 8→12, MC/value/dash 8.5→12.5).
  const metadataRowMobile = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, padding: '0 5px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <button className="tappable" onClick={(e) => { e.stopPropagation(); router.push('/profile/' + post.username); }} style={{ display: 'block', flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <span style={{ width: 17, height: 17, flexShrink: 0, border: '0.75px solid rgba(229,225,219,0.5)', overflow: 'hidden', display: 'block', background: '#222' }}>
            {post.profile_image_url && <img src={feedImage(post.profile_image_url, 96)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          </span>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
          <button className="tappable" onClick={(e) => { e.stopPropagation(); router.push('/profile/' + post.username); }} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, opacity: 0.66, background: 'none', border: 'none', padding: 0, cursor: 'pointer', minWidth: 0, maxWidth: '100%' }}>
            <span style={{ fontFamily: 'var(--font-light)', fontWeight: 400, fontSize: 10, color: 'var(--ink-100)', letterSpacing: 'var(--track-wide)', flexShrink: 0 }}>[ at ]</span>
            <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 12, color: 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.username}</span>
          </button>
          {/* SONG ROW — track title AS STORED (sentence case), 55 Roman ~11px ~55%,
              wave glyph, capped 28 chars/one line; renders ONLY when a track is
              attached (no reserved space otherwise). Resolves via the module-cached
              useTrackForPost — no new per-card fetch. */}
          <MusicTitleChip post={post as { music_track_id?: string | null }} uppercase={false} fontSize={11} weight={400} color="rgba(229,225,219,0.55)" glyphW={12} glyphH={9} marquee />
        </div>
      </div>
      {post.token_standard === 'coin' && post.coin_address ? (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 12.5, color: 'rgba(229,225,219,0.34)', letterSpacing: 'var(--track-body)' }}>MC</span>
          <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 12.5, color: 'rgba(229,225,219,0.71)', letterSpacing: 'var(--track-body)' }}>{mc ?? '…'}</span>
        </span>
      ) : (
        /* dash rule — unminted posts carry NO economics; a single dash holds the slot. */
        <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 12.5, color: 'rgba(229,225,219,0.34)', letterSpacing: 'var(--track-body)', flexShrink: 0 }}>—</span>
      )}
    </div>
  );

  const mediaContent = post.media_type === 'video' ? (
    // Feed video → GradedVideo. gridMode = the same direct in-view trigger the grid
    // uses (the coordinator round-trip didn't fire playback here). The feed shows
    // only 1–2 large posts at once, so attempt-all-in-view naturally caps it; the
    // device's decoder limit caps any overflow. Tap opens the standalone view.
    <GradedVideo
      url={post.media_urls?.[0]}
      posterUrl={(post as { stream_poster_url?: string | null }).stream_poster_url ?? post.poster_url ?? post.thumbnail_url}
      posterWidth={750}
      clipUrl={post.autoplay_clip_url}
      editParams={post.edit_params}
      autoplayFlag={post.autoplay !== false}
      fullPlayback={!card}
      gridMode
      processing={(post as { video_status?: string }).video_status === 'processing'}
      hlsUrl={(post as { video_status?: string; stream_playback_url?: string | null }).video_status === 'ready' ? (post as { stream_playback_url?: string | null }).stream_playback_url : null}
      priority={priority}
      minPlayRatio={0.5}
      cropX={post.crop_x ?? 0}
      cropY={post.crop_y ?? 0}
      cropWidth={post.crop_width ?? 1}
      cropHeight={post.crop_height ?? 1}
      showSoundToggle={true}
      style={{ width: '100%', height: '100%' }}
      onClick={openLightbox}
    />
  ) : (
    <MediaRenderer
      url={post.media_urls?.[0]}
      width={600}
      priority={priority}
      mediaType={post.media_type}
      caption={post.caption}
      thumbnailUrl={post.poster_url ?? post.thumbnail_url}
      autoplay={post.autoplay !== false}
      showSoundToggle={true}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      onClick={openLightbox}
    />
  );

  return (
    <div className="feed-card" onClick={card ? openLightbox : undefined} style={{ marginBottom: card ? 0 : FEED_POST_GAP_PX, ...(card ? { background: '#030303', border: '1px solid rgba(229,225,219,0.22)', borderRadius: 3, padding: '10px 10px 12px', boxSizing: 'border-box', cursor: onImageClick ? 'pointer' : undefined } : {}) }}>{/* Brief F7 §2 — desktop masonry: the whole bordered cell opens the lightbox, incl. the padding ring between artwork and border. Interactive zones (byline links, action row) stopPropagation below so they keep their own behaviour. */}

      {/* ── Metadata above the frame; the media below is clean ── */}
      {/* card (desktop feed) keeps the original byline byte-for-byte; the mobile
          home feed (!card) renders the Brief 2.1 Discover byline. */}
      {card ? <div onClick={(e) => e.stopPropagation()}>{metadataRow}</div> : metadataRowMobile}
      {/* Media: card is edge-of-card as before; !card insets 5px so the image
          aligns to the frame's content column (x=7 on 375: 2px container + 5px). */}
      <div style={card ? undefined : { padding: '0 5px' }}>
      {is43 ? (
        <PillarboxFrame
          onClick={openLightbox}
          cursor={onImageClick ? 'pointer' : 'default'}
        >
          {mediaContent}
        </PillarboxFrame>
      ) : (
        <div
          onClick={openLightbox}
          style={{
            position: 'relative',
            width: '100%',
            paddingTop: `${paddingPercent}%`,
            overflow: 'hidden',
            cursor: onImageClick ? "pointer" : "default",
            backgroundColor: '#222',
          }}
        >
          <div className={hoverGrow ? 'masonry-media-scale' : undefined} style={{ position: 'absolute', inset: 0 }}>
            {mediaContent}
          </div>
          <MusicWaveButton post={post as { music_track_id?: string | null; music_mode?: string | null; music_start_seconds?: number | null; media_type?: string | null }} />
        </div>
      )}
      </div>

      {/* ── Below-image row: like · comment · COLLECT ── */}
      {/* card (desktop) keeps the original action row; !card = Brief 2.1 mobile row. */}
      {card ? (
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", padding: "5px 2px 0", gap: 12 }}>
        <PressPop>
        <button
          className="tap-target-x6"
          onClick={handleLike}
          disabled={loading || !user}
          style={{ background: "transparent", border: "none", cursor: user ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4, padding: 0, color: isLiked ? "#E5E1DB" : "rgba(229,225,219,0.6)" }}
        >
          <svg width="18.7" height="18.7" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: "inherit" }}>{likes.length}</span>
        </button>
        </PressPop>

        <PressPop>
        <button
          className="tap-target-x6"
          onClick={(e) => { e.stopPropagation(); toggleComments(); }}
          style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, color: "rgba(229,225,219,0.6)" }}
        >
          <svg width="18.7" height="18.7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: "inherit" }}>{comments.length}</span>
        </button>
        </PressPop>

        {/* Right cluster — First Cut count (coin posts) sits to the LEFT of COLLECT. */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {post.token_standard === 'coin' && post.coin_address && (
            <FirstCutChip coinAddress={post.coin_address} postId={post.id} />
          )}
          <button
            className="tap-target-x6"
            onClick={(e) => { e.stopPropagation(); setShowCollectSheet(true); }}
            style={{
              background: "transparent",
              border: `1px solid ${showCollectSheet ? "#E5E1DB" : "rgba(229,225,219,0.7)"}`,
              cursor: "pointer",
              padding: "1px 5px",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: showCollectSheet ? "#E5E1DB" : "rgba(229,225,219,0.7)", lineHeight: 1 }}>COLLECT</span>
          </button>
        </div>
      </div>
      ) : (
      <div style={{ display: "flex", alignItems: "center", padding: "6px 5px 0", gap: 11 }}>
        <PressPop>
        <button
          className="tap-target-x6"
          onClick={handleLike}
          disabled={loading || !user}
          style={{ background: "transparent", border: "none", cursor: user ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4, padding: 0, color: isLiked ? "#E5E1DB" : "rgba(229,225,219,0.51)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span style={{ ...SKR, fontSize: 12.5, color: "inherit", letterSpacing: 'var(--track-body)' }}>{likes.length}</span>
        </button>
        </PressPop>

        <PressPop>
        <button
          className="tap-target-x6"
          onClick={(e) => { e.stopPropagation(); toggleComments(); }}
          style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, color: "rgba(229,225,219,0.51)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ ...SKR, fontSize: 12.5, color: "inherit", letterSpacing: 'var(--track-body)' }}>{comments.length}</span>
        </button>
        </PressPop>

        {/* Right cluster — FC count (coin posts) LEFT of COLLECT. FirstCutChip is a
            shared component (out of blast radius): the frame's "5 | 10" two-numeral
            format is FLAGGED for a nudge, not restyled here. */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9 }}>
          {post.token_standard === 'coin' && post.coin_address && (
            <FirstCutChip coinAddress={post.coin_address} postId={post.id} />
          )}
          <button
            className="tap-target-x6"
            onClick={(e) => { e.stopPropagation(); setShowCollectSheet(true); }}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: 'var(--track-display)', color: showCollectSheet ? "#E5E1DB" : "rgba(229,225,219,0.42)", lineHeight: 1 }}>COLLECT</span>{/* Brief M1 §1 — opacity 0.49 → 0.42 (−15%); font 14.5 → 13 (−1.5px) */}
          </button>
        </div>
      </div>
      )}

      {post.caption && (
        <div style={{ margin: card ? "5px 2px 0" : "7px 5px 0", maxWidth: card ? undefined : 158 }}>
          <p
            ref={captionRef}
            style={{ ...SKR, ...(card
              ? { fontSize: 'var(--fs-11)', color: "#E5E1DB", letterSpacing: "-0.1px", lineHeight: 1.5 }
              : { fontSize: 12.5, color: "rgba(229,225,219,0.75)", letterSpacing: 'var(--track-body)', lineHeight: 1.16 }), margin: 0,
              ...(clampCaption ? ({ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties) : {}) }}
          >
            {post.caption}
          </p>
          {/* display-only "more" → opens the full caption in the lightbox */}
          {clampCaption && captionClamped && openLightbox && (
            <button onClick={(e) => { e.stopPropagation(); openLightbox(); }} style={{ ...SKR, fontSize: 'var(--fs-10)', color: "rgba(229,225,219,0.45)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0 0" }}>
              … more
            </button>
          )}
        </div>
      )}

      <CollectSheetGate
        post={post}
        visible={showCollectSheet}
        onClose={() => setShowCollectSheet(false)}
      />

      {/* ── Inline comments — expands beneath the post with the SAME ripple-down
            reveal as the full-screen post view (ProfilePostViewer). The
            grid-template-rows 0fr→1fr transition animates the height so the feed
            reflows smoothly (no snap); each row ripples in via the shared
            `ripple-down` keyframe + 50ms stagger, cascading downward. Rows stay
            mounted so the height can animate; the ripple only fires while open. ── */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: showComments ? "1fr" : "0fr",
          transition: "grid-template-rows 0.32s cubic-bezier(0.16,0.84,0.3,1)",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, borderTop: "1px solid rgba(229,225,219,0.08)", paddingTop: 10 }}>
            {user && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  ref={commentInputRef}
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                  placeholder="add a comment..."
                  style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid rgba(229,225,219,0.15)", outline: "none", ...SKR, fontSize: 'max(16px, var(--fs-8))', color: "#E5E1DB", padding: "2px 0" }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={loading || !newComment.trim()}
                  style={{ background: "transparent", border: "none", cursor: "pointer", ...SKB, fontSize: 'var(--fs-8)', color: newComment.trim() ? "#E5E1DB" : "rgba(229,225,219,0.25)", padding: 0 }}
                >
                  post
                </button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <CommentList
                comments={comments}
                variant="feed"
                likeStates={likeStates}
                onToggleLike={toggleLike}
                onReply={(c) => setReplyingTo(c)}
                onProfile={(h) => router.push('/profile/' + h)}
                viewerDid={user?.id ?? null}
              />
            </div>
            {replyingTo && (
              <ReplyComposer
                parent={replyingTo}
                variant="mobile"
                onClose={() => setReplyingTo(null)}
                onSubmit={submitReply}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stage 4.2 — memoize the feed card. The parent (home feed) re-renders on every
// scroll frame (showFrame) and on any comment toggle; without this, the WHOLE list
// re-rendered each time. Compare only the post identity + its controlled open state
// and IGNORE the callback props' identity: the parent passes fresh inline arrows
// each render, but they're behaviorally stable (they close over a stable post + stable
// setters), so an older closure stays correct. → a scroll no longer re-renders cards;
// a comment toggle re-renders only the two affected cards.
export default memo(
  PostItem,
  (prev, next) => prev.post === next.post && prev.commentsOpen === next.commentsOpen && prev.card === next.card && prev.clampCaption === next.clampCaption && prev.hoverGrow === next.hoverGrow,
);
