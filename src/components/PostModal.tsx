"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { feedImage } from "@/lib/mediaUrl";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  likePost,
  unlikePost,
  getPostLikes,
  isPostLikedByUser,
  addComment,
  getPostComments,
  pinPost,
  unpinPost,
} from "@/lib/postsService";
import { getUserByPrivyId, getProfile } from "@/lib/userService";
import DeckPickerSheet from "@/components/DeckPickerSheet";
import PressPop from "@/components/PressPop";
import CollectSheetGate from "@/components/economy/CollectSheetGate";
import { isUntradeableCoin } from "@/lib/economy/pairing";
import { supabase } from "@/lib/supabase/client";
import { getAspectRatio } from "@/lib/aspectRatio";
import MediaRenderer from "@/components/MediaRenderer";
import GradedVideo from "@/components/finishing/GradedVideo";
import { useEconomy, isCoinPost } from "@/components/EconomyProvider";
import TickerMark from "@/components/economy/TickerMark";
import FirstCutLedger from "@/components/economy/FirstCutLedger";
import DeletePostSheet from "@/components/DeletePostSheet";
import ReframeOverlay from "@/components/ReframeOverlay";

interface Post {
  id: string;
  user_id?: string;
  username: string;
  caption: string;
  media_urls: string[];
  layout_id?: string;
  created_at: string;
  profile_image_url?: string | null;
  is_minted?: boolean;
  contract_address?: string | null;
  token_id?: string | null;
  media_type?: string;
  thumbnail_url?: string | null;
  poster_url?: string | null;
  autoplay?: boolean;
  is_pinned?: boolean;
  coin_address?: string | null;
  token_standard?: string | null;
  ticker?: string | null;
  crop_x?: number;
  crop_y?: number;
  crop_width?: number;
  crop_height?: number;
  edit_params?: unknown;
}

// THE ONE LIGHTBOX — serves the feed, decks, notifications, Mirage, the
// profile viewers, and both profile grids. Conditional sections, never
// parallel implementations: any lightbox change lands everywhere at once.
// The owner section renders strictly when viewer == author.
interface PostModalProps {
  post: Post;
  onClose: () => void;
  /** Explicit ownership (own-profile grid passes true); otherwise detected by
      comparing the viewer's Supabase id to post.user_id. */
  isOwner?: boolean;
  supabaseUserId?: string;
  onDeleted?: (postId: string) => void;
  /** Profile-grid extras (optional — absent on feed entries). */
  onScrollDown?: () => void;
  onTheaterMode?: () => void;
  /** Stacking override — surfaces above z100 (the full-screen program view)
      pass a higher base so the lightbox layers over them. */
  zIndex?: number;
  /** Program/collection scope: counter + prev/next stepping (rubber-band at
      the ends — arrows hide, swipes no-op; no wrap). */
  nav?: { index: number; total: number; onStep: (dir: 1 | -1) => void };
  layoutId?: string;
}

const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function PostModal({ post, onClose, isOwner, supabaseUserId, onDeleted, onScrollDown, onTheaterMode, layoutId, zIndex = 100, nav }: PostModalProps) {
  const router = useRouter();
  const { user } = usePrivy();
  const economy = useEconomy();

  // Slide-up entrance
  const [visible, setVisible] = useState(false);

  // Data
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  // UI
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [collectToast, setCollectToast] = useState(false);
  const [showCollectSheet, setShowCollectSheet] = useState(false);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [deckToast, setDeckToast] = useState("");

  // Viewer's own Supabase profile (for comment submission + owner detection)
  const [viewerUsername, setViewerUsername] = useState<string>("");
  const [viewerAvatar, setViewerAvatar] = useState<string | null>(null);
  const [viewerSbId, setViewerSbId] = useState<string | null>(null);

  // Market chrome — coin posts only, through the boundary (legacy 1155 = none).
  const [mcLabel, setMcLabel] = useState<string | null>(null);

  // Owner section state (ported intact from the profile lightbox)
  const [pinned, setPinned] = useState(post.is_pinned || false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [autoplayOn, setAutoplayOn] = useState(post.autoplay !== false);
  const [replacingThumb, setReplacingThumb] = useState(false);
  const [showReframe, setShowReframe] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  // viewer == author — explicit prop wins; otherwise resolved Supabase ids.
  const ownerView = isOwner ?? (!!viewerSbId && post.user_id === viewerSbId);
  const ownerSbId = supabaseUserId || viewerSbId || '';

  // Trigger entrance animation on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Load viewer's own Supabase profile so comments use the real username
  useEffect(() => {
    if (!user) return;
    const loadViewer = async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        setViewerSbId(sbUser.id);
        const profile = await getProfile(sbUser.id);
        if (profile?.username) setViewerUsername(profile.username);
        if (profile?.profile_image_url) setViewerAvatar(profile.profile_image_url);
      } catch (e) {
        console.error("PostModal viewer profile error:", e);
      }
    };
    loadViewer();
  }, [user?.id]);

  // Load likes + comments (with commenter avatars)
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

        // Batch-fetch profile images for all unique commenter usernames
        const usernames = [...new Set((c as any[]).map((x) => x.username).filter(Boolean))];
        let avatarMap = new Map<string, string | null>();
        if (usernames.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("username, profile_image_url")
            .in("username", usernames);
          avatarMap = new Map((profiles || []).map((p) => [p.username, p.profile_image_url]));
        }
        setComments((c as any[]).map((x) => ({ ...x, profile_image_url: avatarMap.get(x.username) ?? null })));
      } catch (e) {
        console.error("PostModal load error:", e);
      }
    };
    load();
  }, [post.id, user?.id]);

  // MC in dollars (derived rule) via the boundary — coin posts only. Legacy
  // 1155 posts get NO market chrome at all. Re-reads on 'scope:market-moved'
  // so the lightbox shows post-trade truth after a collect.
  const [marketRefreshKey, setMarketRefreshKey] = useState(0);
  useEffect(() => {
    const onMoved = (e: Event) => {
      if ((e as CustomEvent).detail?.postId === post.id) setMarketRefreshKey((k) => k + 1);
    };
    window.addEventListener('scope:market-moved', onMoved);
    return () => window.removeEventListener('scope:market-moved', onMoved);
  }, [post.id]);
  useEffect(() => {
    if (!isCoinPost(post)) { setMcLabel(null); return; }
    let cancelled = false;
    let tries = 0;
    const MAX_TRIES = 6;
    const attempt = () => {
      economy.getPostMarket(post.id)
        .then((m) => {
          if (cancelled) return;
          // Unresolved (transient 429 miss) → retry shortly, keep loading.
          if (m.marketResolved === false && tries < MAX_TRIES) {
            tries++;
            setTimeout(attempt, 1500);
            return;
          }
          // Resolved: real MC, or "—" for a genuinely untraded coin (marketCap 0).
          setMcLabel(m.mcUsd > 0 ? `$${m.mcUsd < 1 ? m.mcUsd.toFixed(2) : Math.round(m.mcUsd).toLocaleString()}` : '—');
        })
        .catch(() => {});
    };
    attempt();
    return () => { cancelled = true; };
  }, [post.id, post.coin_address, post.token_standard, economy, marketRefreshKey]);

  const navTouch = useRef<{ x: number; y: number } | null>(null);

  // Animated close
  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 340);
  };

  const goToProfile = (handle?: string) => {
    handleClose();
    setTimeout(() => router.push(`/profile/${handle || post.username}`), 340);
  };

  // Video must display EXACTLY as posted — the feed/profile render videos at plain
  // cover (no crop), so the standalone must not re-apply the stored crop as a CSS
  // scale transform (which zooms it). Images keep their stored crop.
  const mediaUrl0 = post.media_urls?.[0] ?? '';
  const isVideoPost = post.media_type === 'video' ||
    ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(mediaUrl0.split('?')[0].split('.').pop()?.toLowerCase() || '');

  const handleLike = async () => {
    if (!user) return;
    // OPTIMISTIC: flip now, network in background, revert on error.
    const wasLiked = isLiked;
    const prevLikes = likes;
    setIsLiked(!wasLiked);
    setLikes((p) => wasLiked ? p.filter((l) => l.user_id !== user.id) : [...p, { user_id: user.id }]);
    try {
      if (wasLiked) await unlikePost(post.id, user.id);
      else await likePost(post.id, user.id, user.email ? String(user.email).split("@")[0] : "user");
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
    setComments((p) => [...p, { id: tempId, content: text, username: viewerUsername || "user", user_id: user.id, profile_image_url: viewerAvatar, created_at: new Date().toISOString(), pending: true }]);
    setNewComment("");
    try {
      const c = await addComment(post.id, user.id, viewerUsername || "user", text);
      setComments((p) => p.map((x) => x.id === tempId ? { ...c, profile_image_url: viewerAvatar } : x));
    } catch (e) {
      console.error("Comment error:", e);
      setComments((p) => p.map((x) => x.id === tempId ? { ...x, pending: false, failed: true } : x));
    }
  };

  const handleCollect = () => {
    setShowCollectSheet(true);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ url }); } catch (_) {}
    } else {
      try { await navigator.clipboard.writeText(url); } catch (_) {}
    }
  };

  // PORTALED to document.body: the lightbox previously rendered in-tree —
  // inside scrolling/transformed ancestors (the documented globals.css class:
  // a transform on an ancestor BREAKS a fixed pin), so its chrome could land
  // off-screen (the missing-dismiss report). At body level the pin is real.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {/* Scoped placeholder colour */}
      <style>{`.pm-input::placeholder { color: rgba(255,255,255,0.35); }`}</style>

      {/*
        Outer div needs bg-black in className so the globals.css rule
        `div[style*="position: fixed"]:not([class*="bg-black"])` doesn't hide it.
      */}
      <div
        className="bg-black"
        data-swipe-exclude
        onTouchStart={(e) => { if (nav) { const t = e.touches[0]; navTouch.current = { x: t.clientX, y: t.clientY }; } }}
        onTouchEnd={(e) => {
          const s0 = navTouch.current; navTouch.current = null;
          if (!nav || !s0) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s0.x, dy = t.clientY - s0.y;
          if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.5) nav.onStep(dx < 0 ? 1 : -1); // ends no-op inside onStep
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex,
          backgroundColor: "#000000",
          display: "flex",
          flexDirection: "column",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* ── Back bar ── (safe-area: clears the PWA black-translucent status bar so the
            back control is never buried under the notch; inset-relative, no reposition) */}
        <div
          style={{
            flexShrink: 0,
            height: "calc(44px + env(safe-area-inset-top, 0px))",
            paddingTop: "env(safe-area-inset-top, 0px)",
            position: "relative",
            display: "flex",
            alignItems: "center",
            paddingLeft: 14,
            paddingRight: 14,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            onClick={handleClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: 0,
            }}
          >
            <svg width="14.5" height="14.5" viewBox="0 0 13 13" fill="none">
              <path d="M8.5 1.5L3.5 6.5l5 5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", letterSpacing: "-0.1px" }}>BACK</span>
          </button>
          {/* THEATRE entry — the eye, alone in the bar's right slot (BACK owns the
              left; nothing else lives up here, so no crowding). Enters theatre AT
              this post; replaces the old THEATER text button in the action row. */}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            {onTheaterMode && (
              <button
                onClick={() => onTheaterMode()}
                aria-label="Theatre mode"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4 }}
              >
                <img src="/theatre-mode-eye-framed-v2.png" alt="" style={{ height: 22, width: "auto", display: "block", opacity: 0.92 }} />
              </button>
            )}
            {/* × dismiss — explicit, ≥44px target, both lightbox variants */}
            <button
              onClick={handleClose}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, marginRight: -10 }}
            >
              <span style={{ ...SKR, fontSize: 'var(--fs-15)', color: "rgba(255,255,255,0.75)", lineHeight: 1 }}>×</span>
            </button>
          </span>
        </div>

        {/* ── Scrollable body ── */}
        <div
          onClick={() => { if (ownerMenuOpen) setOwnerMenuOpen(false); }} // tap-out collapses the owner reveal
          style={{
            flex: 1,
            overflowY: "auto",
            // @ts-ignore
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* ONE GROUP — media + the data block center vertically TOGETHER
              (no void: the data block sits directly beneath the media with
              normal spacing, never pinned to the screen bottom). */}
          <div style={{ minHeight: "calc(100vh - 44px)", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", paddingBottom: onScrollDown ? 72 : 0 }}>
            {/* ── Program nav — a slim row DIRECTLY ABOVE the media frame, in the
                black: ‹ left · counter center · › right (one line, never over
                the media). An arrow vanishes at its end — the rubber-band. ── */}
            {nav && (
              <div style={{ width: "92%", margin: "0 auto 6px", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 26 }}>
                <button onClick={() => nav.onStep(-1)} disabled={nav.index === 0} aria-label="Previous" style={{ background: "transparent", border: "none", cursor: nav.index === 0 ? "default" : "pointer", padding: 4, lineHeight: 0, visibility: nav.index === 0 ? "hidden" : "visible" }}>
                  {/* Inline SVG — the PNG asset's hairline stroke collapsed to ~0.2px at
                      this size and antialiased to grey-53 (measured); a vector stroke
                      rasterizes at native size = true white. */}
                  <svg width="11" height="17" viewBox="0 0 11 17" fill="none" style={{ display: "block", filter: "drop-shadow(0 0 2px rgba(255,255,255,0.6))" }}><path d="M8.5 2.5l-6 6 6 6" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.5)", letterSpacing: "0.18em", fontVariantNumeric: "tabular-nums" }}>
                  {nav.index + 1} / {nav.total}
                </span>
                <button onClick={() => nav.onStep(1)} disabled={nav.index === nav.total - 1} aria-label="Next" style={{ background: "transparent", border: "none", cursor: nav.index === nav.total - 1 ? "default" : "pointer", padding: 4, lineHeight: 0, visibility: nav.index === nav.total - 1 ? "hidden" : "visible" }}>
                  <svg width="11" height="17" viewBox="0 0 11 17" fill="none" style={{ display: "block", filter: "drop-shadow(0 0 2px rgba(255,255,255,0.6))" }}><path d="M2.5 2.5l6 6-6 6" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            )}
            <div style={{ width: "92%", margin: "0 auto", aspectRatio: getAspectRatio(post.layout_id ?? ''), overflow: "hidden", background: "#0a0a0a" }}>
              {post.media_urls?.[0] ? (
                isVideoPost ? (
                  // Standalone view → always play GRADED (look applied live via the pipeline).
                  <GradedVideo
                    url={post.media_urls[0]}
                    posterUrl={post.poster_url ?? post.thumbnail_url}
                    editParams={post.edit_params}
                    cropX={post.crop_x ?? 0} cropY={post.crop_y ?? 0} cropWidth={post.crop_width ?? 1} cropHeight={post.crop_height ?? 1}
                    forcePlay
                    showSoundToggle
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <MediaRenderer
                    url={post.media_urls[0]}
                    width={1280}
                    mediaType={post.media_type}
                    caption={post.caption || ""}
                    thumbnailUrl={post.poster_url ?? post.thumbnail_url}
                    autoplay={post.autoplay !== false}
                    showSoundToggle
                    cropX={post.crop_x ?? 0}
                    cropY={post.crop_y ?? 0}
                    cropWidth={post.crop_width ?? 1}
                    cropHeight={post.crop_height ?? 1}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                )
              ) : (
                <div style={{ width: "100%", height: "100%", background: "#0a0a0a" }} />
              )}
            </div>
            {/* Profile-grid extra: tap-through to the scroll viewer. */}
            {onScrollDown && (
              <button
                onClick={() => { setVisible(false); setTimeout(onScrollDown, 300); }}
                style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 12 }}
              >
                <svg width="21.5" height="21.5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12l7 7 7-7" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em" }}>SCROLL</span>
              </button>
            )}

          <div style={{ padding: "14px 16px 0" }}>

            {/* Avatar + @username | MC */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <div
                onClick={() => goToProfile()}
                style={{
                  width: 24, height: 24, borderRadius: "50%", overflow: "hidden",
                  background: "#333", flexShrink: 0, marginRight: 8,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {post.profile_image_url ? (
                  <img src={feedImage(post.profile_image_url, 96)} alt={post.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", textTransform: "uppercase" }}>
                    {post.username?.[0] ?? "?"}
                  </span>
                )}
              </div>

              <span
                onClick={() => goToProfile()}
                style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", letterSpacing: "-0.14px", cursor: "pointer", textTransform: "uppercase" }}
              >
                @{post.username}
              </span>

              {/* Market chrome — coin posts only; legacy 1155 shows none. */}
              {isCoinPost(post) && (
                <span style={{ display: "flex", alignItems: "baseline", gap: 6, marginLeft: "auto" }}>
                  {post.ticker && <TickerMark ticker={post.ticker} size={9.5} />}
                  <span style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.4)", letterSpacing: "-0.14px" }}>
                    MC: {mcLabel ?? "…"}
                  </span>
                </span>
              )}
            </div>

            {/* Caption */}
            {post.caption ? (
              <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: "white", letterSpacing: "-0.1px", lineHeight: 1.55, margin: "0 0 14px" }}>
                {post.caption}
              </p>
            ) : null}

            {/* ADD TO DECK + COLLECT — the small First Cut counter is NOT here on
                full post views; the canonical counter is the FIRST CUT ledger row
                below (which is also the whip target). */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginBottom: 16 }}>
              {deckToast && (
                <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.55)", animation: "theater-fade-in 0.2s ease-out both" }}>
                  Added to {deckToast}
                </span>
              )}
              {user && ownerView && (
                <button
                  onClick={() => setShowDeckPicker(true)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.6)", letterSpacing: "-0.1px" }}>
                    ADD TO DECK
                  </span>
                </button>
              )}
              <button
                onClick={handleCollect}
                style={{
                  background: "transparent",
                  border: showCollectSheet ? "1px solid #FF0000" : "1px solid rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  padding: "5px 10px",
                }}
              >
                {/* Plain COLLECT — the price lives in the collect sheet, in
                    dollars. (The old "· 0.001 ETH" was the 1155 flat mint fee.)
                    Legacy ETH-paired coins read LEGACY and open to the sheet's
                    non-tradeable note rather than a misleading COLLECT. */}
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: showCollectSheet ? "#FF0000" : "rgba(255,255,255,0.7)", letterSpacing: "-0.1px" }}>
                  {isUntradeableCoin(post as { coin_address?: string | null; coin_currency?: string | null }) ? "LEGACY" : "COLLECT"}
                </span>
              </button>
            </div>

            {/* First Cut ledger — the post's founding collectors (coin posts) */}
            {isCoinPost(post) && post.coin_address && (
              <div style={{ marginBottom: 16 }}>
                <FirstCutLedger coinAddress={post.coin_address} postId={post.id} onHolderTap={(u) => router.push("/profile/" + u)} />
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", marginBottom: 12 }} />

            {/* Like + comments toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
              {/* Like */}
              <PressPop>
              <button
                onClick={handleLike}
                disabled={loading || !user}
                style={{
                  background: "transparent", border: "none",
                  cursor: user ? "pointer" : "default",
                  display: "flex", alignItems: "center", gap: 5, padding: 0,
                  color: isLiked ? "#FF0000" : "rgba(255,255,255,0.55)",
                }}
              >
                <svg width="15.5" height="15.5" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                    fill={isLiked ? "#FF0000" : "none"}
                    stroke={isLiked ? "#FF0000" : "white"}
                    strokeWidth="2"
                  />
                </svg>
                <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: "inherit" }}>{likes.length}</span>
              </button>
              </PressPop>

              {/* Comments toggle */}
              <button
                onClick={() => setShowComments((v) => !v)}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.4)", letterSpacing: "-0.1px" }}>
                  {showComments ? "hide comments" : `tap to see comments (${comments.length})`}
                </span>
              </button>

              {/* No bookmark/save: Scope has no free keep-mechanism — the
                  heart is feeling, COLLECT is conviction (ratified). */}

              {/* Share */}
              <PressPop>
              <button
                onClick={handleShare}
                style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
              >
                <svg width="15.5" height="15.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>
              </PressPop>

              {/* ••• — owner controls reveal (ripple-down). Non-owners have no
                  extra actions today (share is already in the row) → hidden. */}
              {ownerView && (
                <button
                  onClick={(e) => { e.stopPropagation(); setOwnerMenuOpen((v) => !v); }}
                  style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0, marginLeft: "auto" }}
                >
                  <svg width="17.5" height="17.5" viewBox="0 0 24 24" fill="none">
                    <circle cx="5" cy="12" r="1.4" fill={ownerMenuOpen ? "#FF0000" : "rgba(255,255,255,0.6)"} />
                    <circle cx="12" cy="12" r="1.4" fill={ownerMenuOpen ? "#FF0000" : "rgba(255,255,255,0.6)"} />
                    <circle cx="19" cy="12" r="1.4" fill={ownerMenuOpen ? "#FF0000" : "rgba(255,255,255,0.6)"} />
                  </svg>
                </button>
              )}
            </div>

            {/* Comments — ripple down on reveal */}
            {showComments && (
              <div style={{ marginBottom: 16 }}>
                {comments.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.25)", animation: "ripple-down 0.2s ease-out both" }}>
                    no comments yet
                  </p>
                ) : (
                  comments.map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 8,
                        animation: "ripple-down 0.2s ease-out both",
                        animationDelay: `${i * 50}ms`,
                      }}
                    >
                      {/* Avatar → commenter's profile (by handle). stopPropagation
                          so the tap doesn't bubble to the modal/row. */}
                      <div
                        onClick={c.username ? (e) => { e.stopPropagation(); goToProfile(c.username); } : undefined}
                        style={{
                          width: 16, height: 16, borderRadius: "50%", background: "#2a2a2a",
                          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          overflow: "hidden", cursor: c.username ? "pointer" : "default",
                        }}
                      >
                        {c.profile_image_url ? (
                          <img src={feedImage(c.profile_image_url, 96)} alt={c.username} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: "white", textTransform: "uppercase", lineHeight: 1 }}>
                            {c.username?.[0] ?? "?"}
                          </span>
                        )}
                      </div>
                      <div style={{ lineHeight: 1.1 }}>
                        {/* Handle → commenter's profile (by handle). */}
                        <span
                          onClick={c.username ? (e) => { e.stopPropagation(); goToProfile(c.username); } : undefined}
                          style={{ ...SKB, fontSize: 'var(--fs-8)', color: "white", marginRight: 5, textTransform: "uppercase", cursor: c.username ? "pointer" : "default" }}
                        >@{c.username}</span>
                        <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.6)" }}>{c.content}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Comment input */}
            {user && (
              <div
                style={{
                  display: "flex", gap: 10, alignItems: "center",
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                  paddingTop: 12, paddingBottom: 80,
                }}
              >
                <input
                  className="pm-input"
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                  placeholder="add a comment..."
                  style={{
                    flex: 1, background: "transparent", border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.15)",
                    outline: "none", ...SKR, fontSize: 'max(16px, var(--fs-9))', color: "white", padding: "2px 0",
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={loading || !newComment.trim()}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    cursor: newComment.trim() ? "pointer" : "default",
                    ...SKB, fontSize: 'var(--fs-9)',
                    color: newComment.trim() ? "white" : "rgba(255,255,255,0.2)",
                    transition: "color 0.15s ease",
                  }}
                >
                  post
                </button>
              </div>
            )}

            {/* ── OWNER SECTION — strictly viewer == author, revealed by the
                ••• kebab with the ripple-down stagger (the established ripple
                language; tap-out or ••• again collapses). ── */}
            {ownerView && ownerMenuOpen && (
              <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 0 90px", display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-7)', color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.18em", margin: 0, animation: "ripple-down 0.2s ease-out both" }}>OWNER</p>

                {/* Pin to grid — max 2 (enforced in pinPost service). */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "50ms" }}>
                    <div>
                      <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>PIN</p>
                      <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.4)", margin: 0 }}>{pinned ? "Pinned to the top of your grid" : "Pin to the top of your grid (max 2)"}</p>
                    </div>
                    <button
                      onClick={async () => {
                        setPinError(null);
                        if (pinned) {
                          setPinned(false);   // optimistic
                          const r = await unpinPost(post.id);
                          if (!r.ok) { setPinned(true); setPinError(r.error ?? "Could not unpin."); }
                        } else {
                          if (!ownerSbId) return;
                          const r = await pinPost(post.id, ownerSbId);   // service enforces max 2
                          if (r.ok) setPinned(true);
                          else setPinError(r.error ?? "Could not pin.");
                        }
                      }}
                      style={{ background: "transparent", border: `1px solid ${pinned ? "rgba(255,0,0,0.5)" : "rgba(255,255,255,0.2)"}`, cursor: "pointer", padding: "5px 10px" }}
                    >
                      <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: pinned ? "#FF0000" : "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{pinned ? "PINNED" : "PIN"}</span>
                    </button>
                  </div>
                  {pinError && (
                    <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "#FF0000", margin: "6px 0 0" }}>{pinError}</p>
                  )}
                </div>

                {/* Autoplay toggle (video) */}
                {isVideoPost && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "100ms" }}>
                    <div>
                      <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>AUTOPLAY ON GRID</p>
                      <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.4)", margin: 0 }}>{autoplayOn ? "Playing automatically" : "Shows thumbnail with play button"}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const v = !autoplayOn;
                        setAutoplayOn(v);
                        await supabase.from("posts").update({ autoplay: v }).eq("id", post.id);
                      }}
                      style={{
                        width: 28, height: 28,
                        background: autoplayOn ? "rgba(255,0,0,0.15)" : "rgba(255,255,255,0.08)",
                        border: `1px solid ${autoplayOn ? "rgba(255,0,0,0.5)" : "rgba(255,255,255,0.2)"}`,
                        cursor: "pointer", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {autoplayOn ? (
                        <svg width="11.5" height="11.5" viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="#FF0000"/><rect x="14" y="4" width="4" height="16" fill="#FF0000"/></svg>
                      ) : (
                        <svg width="11.5" height="11.5" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="rgba(255,255,255,0.45)"/></svg>
                      )}
                    </button>
                  </div>
                )}

                {/* Replace thumbnail */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "150ms" }}>
                  <div>
                    <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>THUMBNAIL</p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.4)", margin: 0 }}>{replacingThumb ? "Uploading..." : "Replace poster image"}</p>
                  </div>
                  <button
                    onClick={() => thumbInputRef.current?.click()}
                    style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", padding: "5px 10px" }}
                  >
                    <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{replacingThumb ? "..." : "REPLACE"}</span>
                  </button>
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !ownerSbId) return;
                      setReplacingThumb(true);
                      try {
                        const ext = file.name.split(".").pop();
                        const path = `${ownerSbId}/${Date.now()}-thumb.${ext}`;
                        await supabase.storage.from("post-media").upload(path, file, { upsert: true, cacheControl: "31536000" });
                        const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(path);
                        const newThumbUrl = urlData.publicUrl;
                        if (post.thumbnail_url) {
                          const oldPath = post.thumbnail_url.split("/post-media/")[1];
                          if (oldPath) await supabase.storage.from("post-media").remove([oldPath]);
                        }
                        await supabase.from("posts").update({ thumbnail_url: newThumbUrl }).eq("id", post.id);
                      } catch (err) {
                        console.error("Thumb replace error:", err);
                      } finally {
                        setReplacingThumb(false);
                      }
                    }}
                  />
                </div>

                {/* Re-frame */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "200ms" }}>
                  <div>
                    <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>RE-FRAME</p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.4)", margin: 0 }}>Adjust crop on grid</p>
                  </div>
                  <button
                    onClick={() => setShowReframe(true)}
                    style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", padding: "5px 10px" }}
                  >
                    <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>REFRAME</span>
                  </button>
                </div>

                {/* Delete */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "250ms" }}>
                  <div>
                    <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#FF0000", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>DELETE</p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.4)", margin: 0 }}>Remove from your profile</p>
                  </div>
                  <button
                    onClick={() => setShowDeleteSheet(true)}
                    style={{ background: "transparent", border: "1px solid rgba(255,0,0,0.5)", cursor: "pointer", padding: "5px 10px" }}
                  >
                    <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "#FF0000", textTransform: "uppercase", letterSpacing: "0.08em" }}>DELETE</span>
                  </button>
                </div>
              </div>
            )}

          </div>
          </div>
        </div>
      </div>

      {showDeckPicker && user && (
        <DeckPickerSheet
          postId={post.id}
          onClose={() => setShowDeckPicker(false)}
          onAdded={(deckTitle) => {
            setShowDeckPicker(false);
            setDeckToast(deckTitle);
            setTimeout(() => setDeckToast(""), 2500);
          }}
        />
      )}

      <CollectSheetGate
        post={post}
        visible={showCollectSheet}
        onClose={() => setShowCollectSheet(false)}
      />

      {/* Owner sheets — mounted only for the author. */}
      {ownerView && (
        <DeletePostSheet
          visible={showDeleteSheet}
          postId={post.id}
          userId={ownerSbId}
          onClose={() => setShowDeleteSheet(false)}
          onDeleted={(deletedPostId) => {
            setShowDeleteSheet(false);
            onDeleted?.(deletedPostId);
            handleClose();
          }}
        />
      )}
      {ownerView && showReframe && (
        <ReframeOverlay
          post={post}
          layoutId={layoutId || post.layout_id || '1x-scope'}
          onCancel={() => setShowReframe(false)}
          onSave={async (cropX: number, cropY: number, cropWidth: number, cropHeight: number) => {
            await supabase.from("posts").update({ crop_x: cropX, crop_y: cropY, crop_width: cropWidth, crop_height: cropHeight }).eq("id", post.id);
            setShowReframe(false);
          }}
        />
      )}
    </>,
    document.body,
  );
}
