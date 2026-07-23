"use client";

import { useState, useEffect, useRef } from "react";
import { feedImage } from "@/lib/mediaUrl";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import PressPop from "@/components/PressPop";
import {
  likePost, unlikePost, getPostLikes, isPostLikedByUser,
  addComment, getPostComments,
} from "@/lib/postsService";
import { getUserByPrivyId, getProfile } from "@/lib/userService";
import DeckPickerSheet from "@/components/DeckPickerSheet";
import CollectSheetGate from "@/components/economy/CollectSheetGate";
import { isUntradeableCoin } from "@/lib/economy/pairing";
import CreateCoinSheet from "@/components/economy/CreateCoinSheet";
import { isCoinPost, useEconomy } from "@/components/EconomyProvider";
import FirstCutChip from "@/components/economy/FirstCutChip";
import TickerMark from "@/components/economy/TickerMark";
import DeletePostSheet from "@/components/DeletePostSheet";
import CommentList, { useCommentLikes, ReplyComposer, type UIComment } from "@/components/CommentList";
import { replyToComment } from "@/lib/commentInteractions";
import MusicWaveButton from "@/components/music/MusicWaveButton";
import MusicTitleChip from "@/components/music/MusicTitleChip";
import MediaRenderer from "@/components/MediaRenderer";
import GradedVideo from "@/components/finishing/GradedVideo";
import TheatreMode from "@/components/TheatreMode";
import { useRotateToTheatre } from "@/lib/useRotateToTheatre";
import { supabase } from "@/lib/supabase/client";
import { getAspectRatio } from "@/lib/aspectRatio";
import PillarboxFrame from "@/components/PillarboxFrame";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface Post {
  id: string;
  user_id?: string;
  username: string;
  caption: string;
  media_urls: string[];
  layout_id?: string | null;
  created_at: string;
  profile_image_url?: string | null;
  is_minted?: boolean;
  contract_address?: string | null;
  token_id?: string | null;
}

// ── Single post card within the scrollable viewer ───────────────────

interface ItemProps {
  post: Post;
  ownerUsername: string;
  ownerAvatarUrl?: string | null;
  viewerUsername: string;
  viewerAvatar: string | null;
  /** Navigate to a profile by handle; defaults to the post owner when omitted. */
  onNavigateToProfile: (handle?: string) => void;
  /** Open this post in the standalone post view (the SAME PostModal as the feed). */
  onOpenPost: (post: Post) => void;
  isOwnProfile?: boolean;
  onDeletePress?: (postId: string) => void;
}

function PostViewerItem({
  post, ownerUsername, ownerAvatarUrl, viewerUsername, viewerAvatar, onNavigateToProfile, onOpenPost, isOwnProfile, onDeletePress,
}: ItemProps) {
  const { user } = usePrivy();
  const economy = useEconomy();
  // Real MC for coin posts via the SAME hardened boundary the feed uses (was a
  // static "MC: —" here — the read was never wired on the profile post-scroll).
  const [mc, setMc] = useState<string | null>(null);
  const [mcKey, setMcKey] = useState(0);
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<UIComment | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const { likeStates, toggleLike } = useCommentLikes(comments, user?.id ?? null, viewerUsername);
  const [showCollectSheet, setShowCollectSheet] = useState(false);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [showCreateCoin, setShowCreateCoin] = useState(false);
  const [deckToast, setDeckToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

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
        // Batch-enrich comments with avatars
        const names = [...new Set((c as any[]).map(x => x.username).filter(Boolean))];
        let avatarMap = new Map<string, string | null>();
        if (names.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles").select("username, profile_image_url").in("username", names);
          avatarMap = new Map((profiles || []).map(p => [p.username, p.profile_image_url]));
        }
        setComments((c as any[]).map(x => ({ ...x, profile_image_url: avatarMap.get(x.username) ?? null })));
      } catch (e) {
        console.error("PostViewerItem load error:", e);
      }
    };
    load();
  }, [post.id, user?.id]);

  // Re-read MC when a trade on THIS post lands (post-trade truth, parity w/ feed).
  useEffect(() => {
    const onMoved = (e: Event) => { if ((e as CustomEvent).detail?.postId === post.id) setMcKey((k) => k + 1); };
    window.addEventListener('scope:market-moved', onMoved);
    return () => window.removeEventListener('scope:market-moved', onMoved);
  }, [post.id]);

  // Real MC via the hardened /api/market boundary (retry on transient empty reads;
  // never render a misleading $0 — "…" while loading, "—" for a truly untraded coin).
  useEffect(() => {
    const coin = (post as { coin_address?: string | null }).coin_address;
    const std = (post as { token_standard?: string | null }).token_standard;
    if (!coin || std !== 'coin') return;
    let cancelled = false; let tries = 0; const MAX_TRIES = 6;
    const attempt = () => {
      economy.getPostMarket(post.id)
        .then((m) => {
          if (cancelled) return;
          if (m.marketResolved === false && tries < MAX_TRIES) { tries++; setTimeout(attempt, 1500); return; }
          setMc(m.mcUsd > 0 ? `$${m.mcUsd < 1 ? m.mcUsd.toFixed(2) : Math.round(m.mcUsd).toLocaleString()}` : '—');
        })
        .catch((e) => console.error('[ProfilePostViewer] coin MC fetch error:', e));
    };
    attempt();
    return () => { cancelled = true; };
  }, [post, economy, mcKey]);

  const handleLike = async () => {
    if (!user) return;
    // OPTIMISTIC: flip now, network in background, revert on error.
    const wasLiked = isLiked;
    const prevLikes = likes;
    setIsLiked(!wasLiked);
    setLikes(p => wasLiked ? p.filter(l => l.user_id !== user.id) : [...p, { user_id: user.id }]);
    try {
      if (wasLiked) await unlikePost(post.id, user.id);
      else await likePost(post.id, user.id, viewerUsername || "user");
    } catch (e) {
      console.error("Like error:", e);
      setIsLiked(wasLiked);
      setLikes(prevLikes);
    }
  };

  const handleAddComment = async () => {
    if (!user || !newComment.trim()) return;
    // OPTIMISTIC: render immediately, reconcile on success / mark failed.
    const text = newComment.trim();
    const tempId = `temp-${Date.now()}`;
    setComments(p => [...p, { id: tempId, content: text, username: viewerUsername || "user", user_id: user.id, profile_image_url: viewerAvatar, created_at: new Date().toISOString(), pending: true }]);
    setNewComment("");
    try {
      const c = await addComment(post.id, user.id, viewerUsername || "user", text);
      setComments(p => p.map(x => x.id === tempId ? { ...c, profile_image_url: viewerAvatar } : x));
    } catch (e) {
      console.error("Comment error:", e);
      setComments(p => p.map(x => x.id === tempId ? { ...x, pending: false, failed: true } : x));
    }
  };

  // REPLIES → centered composer; optimistic nested insert (avatar carried).
  const submitReply = async (text: string) => {
    if (!user || !replyingTo) return;
    const parentId = replyingTo.parent_comment_id ? replyingTo.parent_comment_id : replyingTo.id;
    const tempId = `temp-${Date.now()}`;
    setComments(p => [...p, { id: tempId, content: text, username: viewerUsername || "user", user_id: user.id, profile_image_url: viewerAvatar, parent_comment_id: parentId, created_at: new Date().toISOString(), pending: true }]);
    try {
      const c = await replyToComment(post.id, parentId, user.id, viewerUsername || "user", text);
      setComments(p => p.map(x => x.id === tempId ? { ...c, profile_image_url: viewerAvatar } : x));
    } catch (e) {
      console.error("Reply error:", e);
      setComments(p => p.map(x => x.id === tempId ? { ...x, pending: false, failed: true } : x));
      throw e;
    }
  };

  const handleCollect = () => {
    setShowCollectSheet(true);
  };

  return (
    <div>

      {/* ── IMAGE ── */}
      {(() => {
        const is43 = (post.layout_id ?? '') === 'legacy';
        const mediaEl = post.media_urls?.[0] ? (
          (post as any).media_type === 'video' ? (
            // Profile scroll video → GradedVideo, gridMode = the grid's direct in-view
            // trigger (one snapped post in view → it plays graded). The wrapper's
            // onClick opens the standalone view (taps bubble).
            <GradedVideo
              url={post.media_urls?.[0] ?? ''}
              posterUrl={(post as any).stream_poster_url ?? (post as any).poster_url ?? (post as any).thumbnail_url}
              clipUrl={(post as any).autoplay_clip_url}
              editParams={(post as any).edit_params}
              autoplayFlag={(post as any).autoplay !== false}
              gridMode
              processing={(post as any).video_status === 'processing'}
              hlsUrl={(post as any).video_status === 'ready' ? ((post as any).stream_playback_url ?? null) : null}
              cropX={(post as any).crop_x ?? 0}
              cropY={(post as any).crop_y ?? 0}
              cropWidth={(post as any).crop_width ?? 1}
              cropHeight={(post as any).crop_height ?? 1}
              showSoundToggle={true}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <MediaRenderer
              url={post.media_urls[0]}
              width={1280}
              mediaType={(post as any).media_type}
              caption={post.caption || ""}
              thumbnailUrl={(post as any).poster_url ?? (post as any).thumbnail_url}
              autoplay={true}
              showSoundToggle={true}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          )
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#111" }} />
        );
        // Metadata ROW — lifted OFF the media onto the black above it (matches
        // the feed's treatment): handle left, ticker+MC right; media stays clean.
        const metadataRow = (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, padding: "0 2px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div
                className="tappable"
                onClick={(e) => { e.stopPropagation(); onNavigateToProfile(); }}
                style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", opacity: 0.85 }}
              >
                <img src={ownerAvatarUrl || undefined} style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "#333" }} />
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "#E5E1DB", lineHeight: 1, textTransform: "uppercase" }}>
                  @{ownerUsername}
                </span>
              </div>
              {/* Brief W7 §2b/c — song title UNDER the handle, marquee, sentence case. Shared
                  viewer → covers BOTH own + public profile post-scroll in one mount. */}
              <MusicTitleChip post={post as { music_track_id?: string | null }} marquee uppercase={false} fontSize={11} weight={400} color="rgba(229,225,219,0.55)" glyphW={12} glyphH={9} windowPx={200} />
            </div>
            {/* Market chrome — coin posts only (ticker + real MC via the boundary),
                matching the feed. Legacy/non-coin posts show none. */}
            {isCoinPost(post as { coin_address?: string | null; token_standard?: string | null }) && (post as { coin_address?: string | null }).coin_address && (
              <span
                style={{ display: "flex", alignItems: "baseline", gap: 5, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 'var(--fs-8)', color: "#E5E1DB", lineHeight: 1, opacity: 0.85, textTransform: "uppercase" }}
              >
                {(post as { ticker?: string | null }).ticker && <TickerMark ticker={(post as { ticker?: string }).ticker as string} size={11.5} />}
                <span>MC: {mc ?? "…"}</span>
              </span>
            )}
          </div>
        );
        return (
          <>
            {metadataRow}
            {/* Media is NOT tappable here — the post-scroll already shows it full-size;
                the old tap opened a redundant single-post PostModal (killed). */}
            {is43 ? (
              <PillarboxFrame>
                {mediaEl}
              </PillarboxFrame>
            ) : (
              <div style={{ position: "relative", width: "100%", aspectRatio: getAspectRatio(post.layout_id ?? ''), overflow: "hidden", background: "#0a0a0a" }}>
                {mediaEl}
                <MusicWaveButton post={post as { music_track_id?: string | null; music_mode?: string | null; music_start_seconds?: number | null; media_type?: string | null }} />
              </div>
            )}
          </>
        );
      })()}

      {/* ── ACTION ROW — marginTop: 2px ── */}
      <div style={{ marginTop: 2, padding: "0 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>

        {/* Left: like · comment · share (no bookmark: the heart is feeling, COLLECT is conviction) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PressPop>
          <button
            onClick={handleLike}
            disabled={loading || !user}
            style={{ background: "transparent", border: "none", cursor: user ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
          >
            <svg width="16.7" height="16.7" viewBox="0 0 24 24" fill="none" style={{ opacity: isLiked ? 1 : 0.7 }}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill={isLiked ? "#E5E1DB" : "none"} stroke={isLiked ? "#E5E1DB" : "#E5E1DB"} strokeWidth="1.8"
              />
            </svg>
            <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: isLiked ? "#E5E1DB" : "#E5E1DB", opacity: isLiked ? 1 : 0.7 }}>{likes.length}</span>
          </button>
          </PressPop>

          <PressPop>
          <button
            onClick={() => setShowComments(v => !v)}
            style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
          >
            <svg width="16.7" height="16.7" viewBox="0 0 24 24" fill="none" stroke="#E5E1DB" strokeWidth="1.8" style={{ opacity: 0.7 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "#E5E1DB", opacity: 0.7 }}>{comments.length}</span>
          </button>
          </PressPop>


          {/* Share button removed from the profile post-scroll (own AND public). */}
        </div>

        {/* Right: add to deck · collect */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {deckToast && (
            <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.04em" }}>Added to {deckToast}</span>
          )}
          {/* First Cut counter — the SMALL icon + count, identical to the home
              feed (all scrolls use this treatment; the full ledger row is
              Lightbox-only). Whip-into-counter lands here. Left of COLLECT. */}
          {isCoinPost(post as { coin_address?: string | null; token_standard?: string | null }) && (post as { coin_address?: string | null }).coin_address && (
            <FirstCutChip coinAddress={(post as { coin_address?: string }).coin_address as string} postId={(post as { id?: string }).id as string} />
          )}
          <button
            onClick={handleCollect}
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
            <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: showCollectSheet ? "#E5E1DB" : "rgba(229,225,219,0.7)", lineHeight: 1, textTransform: "uppercase" }}>{isUntradeableCoin(post as { coin_address?: string | null; coin_currency?: string | null }) ? "LEGACY" : "COLLECT"}</span>
          </button>

          {isOwnProfile && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="21.5" height="21.5" viewBox="0 0 18 18" fill="none">
                  <circle cx="3" cy="9" r="1.5" fill="#E5E1DB" opacity="0.7" />
                  <circle cx="9" cy="9" r="1.5" fill="#E5E1DB" opacity="0.7" />
                  <circle cx="15" cy="9" r="1.5" fill="#E5E1DB" opacity="0.7" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  {/* Click-away backdrop */}
                  <div
                    onClick={() => setMenuOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 120 }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 6px)",
                      right: 0,
                      zIndex: 121,
                      minWidth: 132,
                      background: "#0a0a0a",
                      border: "1px solid rgba(229,225,219,0.12)",
                    }}
                  >
                    <button
                      onClick={() => { setMenuOpen(false); setShowDeckPicker(true); }}
                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid rgba(229,225,219,0.08)", cursor: "pointer", padding: "11px 14px" }}
                    >
                      <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em" }}>ADD TO DECK</span>
                    </button>
                    {/* Coin-pending: offer the idempotent "Create coin" retry.
                        Excludes legacy 1155-minted posts — those remain
                        collectibles without coins (§9), only true coin-pending
                        posts (no coin AND not 1155-minted) get the retry. */}
                    {!isCoinPost(post as { coin_address?: string | null; token_standard?: string | null }) && !(post as { is_minted?: boolean }).is_minted && (
                      <button
                        onClick={() => { setMenuOpen(false); setShowCreateCoin(true); }}
                        style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid rgba(229,225,219,0.08)", cursor: "pointer", padding: "11px 14px" }}
                      >
                        <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em" }}>CREATE COIN</span>
                      </button>
                    )}
                    <button
                      onClick={() => { setMenuOpen(false); onDeletePress?.(post.id); }}
                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "11px 14px" }}
                    >
                      <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em" }}>DELETE</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {showDeckPicker && user && (
          <DeckPickerSheet
            postId={post.id}
            onClose={() => setShowDeckPicker(false)}
            onAdded={(deckTitle) => { setShowDeckPicker(false); setDeckToast(deckTitle); setTimeout(() => setDeckToast(""), 2500); }}
          />
        )}
      </div>

      <CollectSheetGate
        post={post}
        visible={showCollectSheet}
        onClose={() => setShowCollectSheet(false)}
      />

      {isOwnProfile && (
        <CreateCoinSheet
          post={post as any}
          visible={showCreateCoin}
          onClose={() => setShowCreateCoin(false)}
          onDone={() => { setTimeout(() => setShowCreateCoin(false), 1400); }}
        />
      )}

      {/* ── CAPTION — marginTop: 3, marginBottom: 16 (separator) ── */}
      <div style={{ padding: "0 4px", marginTop: 2, marginBottom: 51 /* 31 + 20 air — tune with FEED_POST_GAP_PX */ }}>
        {post.caption ? (
          <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: "#E5E1DB", margin: 0, lineHeight: 1.4 }}>
            {post.caption}
          </p>
        ) : null}

        {/* Comments */}
        {showComments && (
          <div style={{ marginTop: 8 }}>
            {comments.length === 0 ? (
              <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(229,225,219,0.25)", margin: 0, textTransform: "uppercase" }}>NO COMMENTS YET</p>
            ) : (
              <CommentList
                comments={comments}
                variant="scroll"
                likeStates={likeStates}
                onToggleLike={toggleLike}
                onReply={(c) => setReplyingTo(c)}
                onProfile={(h) => onNavigateToProfile(h)}
                viewerDid={user?.id ?? null}
              />
            )}
            {user && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid rgba(229,225,219,0.07)", paddingTop: 8, marginTop: 4 }}>
                <input
                  ref={commentInputRef}
                  className="pm-input"
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddComment()}
                  placeholder="add a comment..."
                  style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid rgba(229,225,219,0.15)", outline: "none", ...SKR, fontSize: 'max(16px, var(--fs-9))', color: "#E5E1DB", padding: "2px 0" }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={loading || !newComment.trim()}
                  style={{ background: "transparent", border: "none", cursor: newComment.trim() ? "pointer" : "default", ...SKB, fontSize: 'var(--fs-9)', color: newComment.trim() ? "#E5E1DB" : "rgba(229,225,219,0.2)", padding: 0, textTransform: "uppercase" }}
                >
                  POST
                </button>
              </div>
            )}
          </div>
        )}
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
  );
}

// ── Viewer shell ─────────────────────────────────────────────────────

interface ProfilePostViewerProps {
  posts: any[];
  initialIndex?: number;
  ownerUsername: string;
  ownerAvatarUrl?: string | null;
  onClose: () => void;
  isOwnProfile?: boolean;
  onDeleted?: (postId: string) => void;
}

export default function ProfilePostViewer({
  posts: initialPosts, initialIndex = 0, ownerUsername, ownerAvatarUrl, onClose, isOwnProfile, onDeleted,
}: ProfilePostViewerProps) {
  const router = useRouter();
  const { user } = usePrivy();
  const [visible, setVisible] = useState(false);
  const [supabaseUserId, setSupabaseUserId] = useState<string>("");
  const [viewerUsername, setViewerUsername] = useState("");
  const [viewerAvatar, setViewerAvatar] = useState<string | null>(null);
  const [localPosts, setLocalPosts] = useState(initialPosts);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deletePostId, setDeletePostId] = useState<string>('');
  const [showTheatre, setShowTheatre] = useState(false);
  const [theatreStart, setTheatreStart] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<(HTMLDivElement | null)[]>([]);
  const theatreIndexRef = useRef(0); // theatre's live index, for scroll-restore on exit

  // Theatre entry — scoped to THIS profile's posts, starting on whichever post is
  // currently nearest the scroll position (per the desktop theatre-eye pattern).
  const openTheatre = () => {
    const container = scrollRef.current;
    let idx = 0;
    if (container) {
      const st = container.scrollTop;
      let best = Infinity;
      postRefs.current.forEach((el, i) => {
        if (!el) return;
        const d = Math.abs(el.offsetTop - st);
        if (d < best) { best = d; idx = i; }
      });
    }
    setTheatreStart(idx);
    theatreIndexRef.current = idx;
    setShowTheatre(true);
  };

  // ROTATE-TO-THEATRE — while the post-scroll is mounted, rotating to LANDSCAPE enters
  // theatre (scoped to this profile's posts, at the currently-viewed post). Brief M3a:
  // the mechanism now lives in the shared useRotateToTheatre hook (also wired to the SR
  // post view); the eye stays the tap path. `enteredViaRotation` is owned by the hook.
  const { enteredViaRotation } = useRotateToTheatre({ isOpen: showTheatre, blocked: showDeleteSheet, onEnter: openTheatre });

  // When a ROTATION-entered theatre closes (TheatreMode fires its own portrait exit),
  // land the post-scroll on whichever post was last viewed in theatre, then clear the
  // flag. Eye-entered closes leave the flag false → the scroll stays put (unchanged).
  useEffect(() => {
    if (showTheatre || !enteredViaRotation.current) return;
    enteredViaRotation.current = false;
    const el = postRefs.current[theatreIndexRef.current];
    if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop;
  }, [showTheatre]);

  // Slide-up entrance
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Scroll to the tapped post after entrance
  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      const el = postRefs.current[initialIndex];
      const container = scrollRef.current;
      if (el && container) container.scrollTop = el.offsetTop;
    });
  }, [visible, initialIndex]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Load viewer's own profile for comment authorship
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        setSupabaseUserId(sbUser.id);
        const profile = await getProfile(sbUser.id);
        if (profile?.username) setViewerUsername(profile.username);
        if (profile?.profile_image_url) setViewerAvatar(profile.profile_image_url);
      } catch (e) {
        console.error("Viewer profile error:", e);
      }
    };
    load();
  }, [user?.id]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 340);
  };

  const goToProfile = (handle?: string) => {
    handleClose();
    setTimeout(() => router.push(`/profile/${handle || ownerUsername}`), 340);
  };

  return (
    // bg-black class satisfies the globals.css selector guard for fixed divs
    <div
      className="bg-black"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        backgroundColor: "#000000",
        display: "flex",
        flexDirection: "column",
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      {/* Scoped placeholder style */}
      <style>{`.pm-input::placeholder { color: rgba(229,225,219,0.35); }`}</style>

      {/* Back bar — BACK (left) · Scope logomark (center, static, never scrolls with
          content) · THEATRE eye (right, enters theatre for this profile's posts). */}
      <div style={{ flexShrink: 0, height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", borderBottom: "1px solid rgba(229,225,219,0.06)" }}>
        <button onClick={handleClose} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, padding: 0 }}>
          <svg width="16.5" height="16.5" viewBox="0 0 13 13" fill="none">
            <path d="M8.5 1.5L3.5 6.5l5 5" stroke="#E5E1DB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", letterSpacing: "-0.1px", textTransform: "uppercase" }}>BACK</span>
        </button>
        <img src="/logomark-plain-white.png" alt="Scope" style={{ height: 14, width: "auto", objectFit: "contain", display: "block", opacity: 0.9 }} />
        <button onClick={() => { enteredViaRotation.current = false; openTheatre(); }} aria-label="Theatre" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
          <img src="/theatre-mode-eye-solo.png" alt="" style={{ height: 17, width: "auto", display: "block", opacity: 0.85 }} />
        </button>
      </div>

      {/* Scroll container with vertical snap */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          paddingTop: 34, // top breathing room (14 + 20 this round) — first post clears the header
          // @ts-ignore
          WebkitOverflowScrolling: "touch",
        }}
      >
        {localPosts.map((post, i) => (
          <div
            key={post.id}
            ref={el => { postRefs.current[i] = el; }}
            style={{ scrollSnapAlign: "start" }}
          >
            <PostViewerItem
              post={post}
              ownerUsername={ownerUsername}
              ownerAvatarUrl={ownerAvatarUrl}
              viewerUsername={viewerUsername}
              viewerAvatar={viewerAvatar}
              onNavigateToProfile={goToProfile}
              onOpenPost={() => {}}
              isOwnProfile={isOwnProfile}
              onDeletePress={(postId) => { setDeletePostId(postId); setShowDeleteSheet(true); }}
            />
          </div>
        ))}
      </div>

      <DeletePostSheet
        visible={showDeleteSheet}
        postId={deletePostId}
        userId={supabaseUserId}
        onClose={() => setShowDeleteSheet(false)}
        onDeleted={(deletedPostId) => {
          const newPosts = localPosts.filter(p => p.id !== deletedPostId);
          setLocalPosts(newPosts);
          onDeleted?.(deletedPostId);
          if (newPosts.length === 0) onClose();
        }}
      />


      {/* Theatre — landscape full-screen viewing of this profile's posts. */}
      {showTheatre && (
        <TheatreMode
          posts={localPosts as unknown as Record<string, unknown>[]}
          startIndex={theatreStart}
          source="profile"
          exitOnPortrait={enteredViaRotation.current}
          onIndexChange={(i) => { theatreIndexRef.current = i; }}
          onClose={() => setShowTheatre(false)}
        />
      )}
    </div>
  );
}
