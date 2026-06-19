"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FirstCutChip from "@/components/economy/FirstCutChip";
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
import MediaRenderer from "@/components/MediaRenderer";
import GradedVideo from "@/components/finishing/GradedVideo";
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
  onImageClick?: () => void;
  /** Controlled inline-comments open state (one-at-a-time, owned by the feed).
   *  Falls back to internal state if the feed doesn't control it. */
  commentsOpen?: boolean;
  onToggleComments?: () => void;
}

const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function PostItem({ post, onImageClick, commentsOpen, onToggleComments }: PostItemProps) {
  const router = useRouter();
  const { user } = usePrivy();
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [internalComments, setInternalComments] = useState(false);
  // Open state is controlled by the feed (one-at-a-time) when provided.
  const showComments = commentsOpen ?? internalComments;
  const toggleComments = onToggleComments ?? (() => setInternalComments((v) => !v));
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewerUsername, setViewerUsername] = useState("");
  const [showCollectSheet, setShowCollectSheet] = useState(false);
  const [mc, setMc] = useState<string | null>(null);
  const economy = useEconomy();

  useEffect(() => {
    if (!user) return;
    const loadViewer = async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        const profile = await getProfile(sbUser.id);
        if (profile?.username) setViewerUsername(profile.username);
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
        setComments(c);
        setIsLiked(liked);
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
    setLoading(true);
    try {
      if (isLiked) {
        await unlikePost(post.id, user.id);
        setLikes((prev) => prev.filter((l) => l.user_id !== user.id));
        setIsLiked(false);
      } else {
        const l = await likePost(post.id, user.id, user.email ? String(user.email).split("@")[0] : "user");
        setLikes((prev) => [...prev, l]);
        setIsLiked(true);
      }
    } catch (e) {
      console.error("Error toggling like:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!user || !newComment.trim()) return;
    setLoading(true);
    try {
      const c = await addComment(
        post.id,
        user.id,
        viewerUsername || "user",
        newComment.trim()
      );
      setComments((prev) => [...prev, c]);
      setNewComment("");
    } catch (e) {
      console.error("Error adding comment:", e);
    } finally {
      setLoading(false);
    }
  };

  const is43 = (post.layout_id ?? '') === 'legacy';
  const paddingPercent = ratioPadding(getAspectRatio(post.layout_id ?? ''));

  const mediaOverlays = (
    <>
      <div style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 10 }}>
        {post.profile_image_url && (
          <img src={post.profile_image_url} style={{ width: '14px', height: '14px', borderRadius: '50%', objectFit: 'cover' }} />
        )}
        <span
          onClick={(e) => { e.stopPropagation(); router.push('/profile/' + post.username); }}
          style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: '8px', color: 'white', cursor: 'pointer', textShadow: '0 1px 2px rgba(0,0,0,1)', textTransform: 'uppercase' }}
        >
          @{post.username}
        </span>
      </div>
      {/* Market chrome — coin posts only; legacy 1155 tiles show none. */}
      {post.token_standard === 'coin' && post.coin_address && (
        <span style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: '8px', color: 'white', textShadow: '0 1px 2px rgba(0,0,0,1)', zIndex: 10, opacity: 0.85 }}>
          {post.ticker && <TickerMark ticker={post.ticker} size={8} />}
          <span>MC: {mc ?? '…'}</span>
        </span>
      )}
    </>
  );

  const mediaContent = post.media_type === 'video' ? (
    // Feed video → GradedVideo. gridMode = the same direct in-view trigger the grid
    // uses (the coordinator round-trip didn't fire playback here). The feed shows
    // only 1–2 large posts at once, so attempt-all-in-view naturally caps it; the
    // device's decoder limit caps any overflow. Tap opens the standalone view.
    <GradedVideo
      url={post.media_urls?.[0]}
      posterUrl={post.poster_url ?? post.thumbnail_url}
      clipUrl={post.autoplay_clip_url}
      editParams={post.edit_params}
      autoplayFlag={post.autoplay !== false}
      gridMode
      cropX={post.crop_x ?? 0}
      cropY={post.crop_y ?? 0}
      cropWidth={post.crop_width ?? 1}
      cropHeight={post.crop_height ?? 1}
      showSoundToggle={true}
      style={{ width: '100%', height: '100%' }}
      onClick={onImageClick}
    />
  ) : (
    <MediaRenderer
      url={post.media_urls?.[0]}
      mediaType={post.media_type}
      caption={post.caption}
      thumbnailUrl={post.poster_url ?? post.thumbnail_url}
      autoplay={post.autoplay !== false}
      showSoundToggle={true}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      onClick={onImageClick}
    />
  );

  return (
    <div style={{ marginBottom: 32 }}>

      {/* ── Image with overlaid avatar + username ── */}
      {is43 ? (
        <PillarboxFrame
          onClick={onImageClick}
          cursor={onImageClick ? 'pointer' : 'default'}
          overlays={mediaOverlays}
        >
          {mediaContent}
        </PillarboxFrame>
      ) : (
        <div
          onClick={onImageClick}
          style={{
            position: 'relative',
            width: '100%',
            paddingTop: `${paddingPercent}%`,
            overflow: 'hidden',
            cursor: onImageClick ? "pointer" : "default",
            backgroundColor: '#222',
          }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            {mediaContent}
          </div>
          {mediaOverlays}
        </div>
      )}

      {/* ── Below-image row: like · comment · COLLECT ── */}
      <div style={{ display: "flex", alignItems: "center", padding: "5px 2px 0", gap: 12 }}>
        <button
          onClick={handleLike}
          disabled={loading || !user}
          style={{ background: "transparent", border: "none", cursor: user ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4, padding: 0, color: isLiked ? "#FF0000" : "rgba(255,255,255,0.6)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span style={{ ...SKR, fontSize: 7, color: "inherit" }}>{likes.length}</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); toggleComments(); }}
          style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, color: "rgba(255,255,255,0.6)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ ...SKR, fontSize: 7, color: "inherit" }}>{comments.length}</span>
        </button>

        {/* Right cluster — First Cut count (coin posts) sits to the LEFT of COLLECT. */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {post.token_standard === 'coin' && post.coin_address && (
            <FirstCutChip coinAddress={post.coin_address} postId={post.id} />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowCollectSheet(true); }}
            style={{
              background: "transparent",
              border: `1px solid ${showCollectSheet ? "#FF0000" : "rgba(255,255,255,0.7)"}`,
              cursor: "pointer",
              padding: "1px 5px",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ ...SKB, fontSize: 7, color: showCollectSheet ? "#FF0000" : "rgba(255,255,255,0.7)", lineHeight: 1 }}>COLLECT</span>
          </button>
        </div>
      </div>

      {post.caption && (
        <p style={{ ...SKR, fontSize: 11, color: "white", letterSpacing: "-0.1px", lineHeight: 1.5, margin: "5px 2px 0" }}>
          {post.caption}
        </p>
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
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
            {user && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                  placeholder="add a comment..."
                  style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.15)", outline: "none", ...SKR, fontSize: 8, color: "white", padding: "2px 0" }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={loading || !newComment.trim()}
                  style={{ background: "transparent", border: "none", cursor: "pointer", ...SKB, fontSize: 8, color: newComment.trim() ? "white" : "rgba(255,255,255,0.25)", padding: 0 }}
                >
                  post
                </button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {comments.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    animation: showComments ? "ripple-down 0.2s ease-out both" : "none",
                    animationDelay: showComments ? `${i * 50}ms` : "0ms",
                  }}
                >
                  {/* Handle → commenter's profile (by handle). */}
                  <span
                    onClick={c.username ? (e) => { e.stopPropagation(); router.push('/profile/' + c.username); } : undefined}
                    style={{ ...SKB, fontSize: 7, color: "white", marginRight: 6, textTransform: 'uppercase', cursor: c.username ? "pointer" : "default" }}
                  >@{c.username}</span>
                  <span style={{ ...SKR, fontSize: 10, color: "rgba(255,255,255,0.6)" }}>{c.content}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
