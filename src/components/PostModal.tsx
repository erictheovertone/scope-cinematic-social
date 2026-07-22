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
import CommentList, { useCommentLikes, ReplyComposer, type UIComment } from "@/components/CommentList";
import { replyToComment } from "@/lib/commentInteractions";
import ReframeOverlay from "@/components/ReframeOverlay";
import EditMusicSheet from "@/components/EditMusicSheet";
import MusicWaveButton from "@/components/music/MusicWaveButton";
import MusicTitleChip from "@/components/music/MusicTitleChip";

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
  const [replyingTo, setReplyingTo] = useState<UIComment | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [collectToast, setCollectToast] = useState(false);
  const [showCollectSheet, setShowCollectSheet] = useState(false);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [deckToast, setDeckToast] = useState("");

  // Brief M1 §2 — finger-tracking horizontal swipe nav (feed lightbox). Drives the nav
  // prop: swipe left → next, right → prev. Content translateX follows the pan; commits
  // past ~30% width or a velocity flick, else eases back. Edge dead-zone so the iOS
  // system back-swipe can't double-fire (known #3). Rubber-bands at the ends (no wrap).
  const [dragX, setDragX] = useState(0);
  const [dragTransition, setDragTransition] = useState("none");
  const swipeRef = useRef<{ x0: number; y0: number; t0: number; axis: "none" | "x" | "y"; active: boolean } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const navRef = useRef(nav);
  navRef.current = nav;
  const EDGE_INSET = 24;   // dead-zone each side; iOS edge-back can't be blocked in the PWA
  const AXIS_LOCK = 10;    // px of movement before we claim horizontal intent

  // Swap the post WITHOUT touching `visible` (no slide-down) + close any post-bound
  // transient sheets so they can't leak onto the wrong post (money-path: collect sheet).
  const doStep = (dir: 1 | -1) => {
    if (!navRef.current) return;
    setShowCollectSheet(false);
    setShowComments(false);
    setShowDeckPicker(false);
    setOwnerMenuOpen(false);
    setReplyingTo(null);
    navRef.current.onStep(dir);
  };

  // Non-passive touchmove so preventDefault can suppress the vertical scroller while a
  // horizontal drag is in flight. Attached once; reads the latest nav via navRef.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      const s = swipeRef.current;
      const n = navRef.current;
      if (!s || !s.active || !n) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x0, dy = t.clientY - s.y0;
      if (s.axis === "none") {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (s.axis === "y") { s.active = false; return; } // hand vertical off to the scroller
      }
      if (s.axis === "x") {
        e.preventDefault();
        const atStart = n.index === 0 && dx > 0;
        const atEnd = n.index === n.total - 1 && dx < 0;
        setDragX(atStart || atEnd ? dx * 0.32 : dx); // rubber-band resist at the ends
      }
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []);

  const onSwipeStart = (e: React.TouchEvent) => {
    if (!navRef.current) return;
    const t = e.touches[0];
    if (t.clientX < EDGE_INSET || t.clientX > window.innerWidth - EDGE_INSET) { swipeRef.current = null; return; }
    swipeRef.current = { x0: t.clientX, y0: t.clientY, t0: performance.now(), axis: "none", active: true };
    setDragTransition("none");
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current; swipeRef.current = null;
    const n = navRef.current;
    const ease = "transform 300ms cubic-bezier(0.32,0.72,0,1)";
    if (!s || s.axis !== "x" || !n) { if (dragX !== 0) { setDragTransition(ease); setDragX(0); } return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x0;
    const dt = performance.now() - s.t0;
    const v = dt > 0 ? dx / dt : 0;
    const w = window.innerWidth;
    const dir: 1 | -1 = dx < 0 ? 1 : -1;
    const hasNeighbor = dir === 1 ? n.index < n.total - 1 : n.index > 0;
    const commit = hasNeighbor && (Math.abs(dx) > w * 0.3 || Math.abs(v) > 0.5);
    const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setDragTransition(ease);
    if (commit) {
      if (reduced) { doStep(dir); setDragX(0); setDragTransition("none"); return; }
      setDragX(dir === 1 ? -w : w); // slide the outgoing post off in the drag direction
      window.setTimeout(() => { doStep(dir); setDragX(0); setDragTransition("none"); }, 300);
    } else {
      setDragX(0); // ease back
    }
  };

  // Viewer's own Supabase profile (for comment submission + owner detection)
  const [viewerUsername, setViewerUsername] = useState<string>("");
  const [viewerAvatar, setViewerAvatar] = useState<string | null>(null);
  const [viewerSbId, setViewerSbId] = useState<string | null>(null);

  // Comment like-state (batch load + optimistic toggle) — shared across surfaces.
  const { likeStates, toggleLike } = useCommentLikes(comments, user?.id ?? null, viewerUsername);

  // Market chrome — coin posts only, through the boundary (legacy 1155 = none).
  const [mcLabel, setMcLabel] = useState<string | null>(null);

  // Owner section state (ported intact from the profile lightbox)
  const [pinned, setPinned] = useState(post.is_pinned || false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [autoplayOn, setAutoplayOn] = useState(post.autoplay !== false);
  const [replacingThumb, setReplacingThumb] = useState(false);
  const [showReframe, setShowReframe] = useState(false);
  const [showEditMusic, setShowEditMusic] = useState(false);
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


  // Animated close
  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 340);
  };

  // Brief F5 §5 — push FIRST. The old order (handleClose → 340ms → push) painted the
  // bare feed for a beat before navigating. Navigating away from `/` unmounts the whole
  // Home tree (this modal with it), so the lightbox disappears with the route — no
  // intermediate feed paint, no exit-animation delay needed. Close is NOT load-bearing
  // (onClose only nulls lightbox state; no scroll restoration). `push` (not replace)
  // keeps one history entry so back returns to the feed with the lightbox closed.
  const goToProfile = (handle?: string) => {
    router.push(`/profile/${handle || post.username}`);
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

  // REPLIES go through the centered composer (not the inline input). Optimistic
  // insert nested under the parent; the avatar rides along (established fix).
  const submitReply = async (text: string) => {
    if (!user || !replyingTo) return;
    const parentId = replyingTo.parent_comment_id ? replyingTo.parent_comment_id : replyingTo.id;
    const tempId = `temp-${Date.now()}`;
    setComments((p) => [...p, { id: tempId, content: text, username: viewerUsername || "user", user_id: user.id, profile_image_url: viewerAvatar, parent_comment_id: parentId, created_at: new Date().toISOString(), pending: true }]);
    try {
      const c = await replyToComment(post.id, parentId, user.id, viewerUsername || "user", text);
      setComments((p) => p.map((x) => x.id === tempId ? { ...c, profile_image_url: viewerAvatar } : x));
    } catch (e) {
      console.error("Reply error:", e);
      setComments((p) => p.map((x) => x.id === tempId ? { ...x, pending: false, failed: true } : x));
      throw e; // keep the composer open + text intact on failure
    }
  };

  const handleCollect = () => {
    setShowCollectSheet(true);
  };

  // PORTALED to document.body: the lightbox previously rendered in-tree —
  // inside scrolling/transformed ancestors (the documented globals.css class:
  // a transform on an ancestor BREAKS a fixed pin), so its chrome could land
  // off-screen (the missing-dismiss report). At body level the pin is real.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {/* Scoped placeholder colour */}
      <style>{`.pm-input::placeholder { color: rgba(229,225,219,0.35); }`}</style>

      {/*
        Outer div needs bg-black in className so the globals.css rule
        `div[style*="position: fixed"]:not([class*="bg-black"])` doesn't hide it.
      */}
      <div
        className="bg-black"
        data-swipe-exclude
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
            borderBottom: "1px solid rgba(229,225,219,0.06)",
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
            <svg width="16.5" height="16.5" viewBox="0 0 13 13" fill="none">
              <path d="M8.5 1.5L3.5 6.5l5 5" stroke="#E5E1DB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", letterSpacing: "-0.1px" }}>BACK</span>
          </button>
          {/* THEATRE entry — the eye, alone in the bar's right slot (BACK owns the
              left; nothing else lives up here, so no crowding). Enters theatre AT
              this post; replaces the old THEATER text button in the action row. */}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {onTheaterMode && (
              <button
                onClick={() => onTheaterMode()}
                aria-label="Theatre mode"
                /* Eye −65% (44→15px), sized to read as one control group with the ×;
                   44px tap target. */
                style={{ background: "transparent", border: "none", cursor: "pointer", minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}
              >
                <img src="/theatre-mode-eye-solo.png" alt="" style={{ height: 15, width: "auto", display: "block", opacity: 0.85 }} />
              </button>
            )}
            {/* × dismiss — glyph sized to visually match the small eye (~15px); 44px target. */}
            <button
              onClick={handleClose}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, marginRight: -10 }}
            >
              <span style={{ ...SKR, fontSize: 22, color: "rgba(229,225,219,0.75)", lineHeight: 1 }}>×</span>
            </button>
          </span>
        </div>

        {/* ── Scrollable body ── (Brief M1 §2: owns the swipe gesture; overflowX hidden
            clips the sliding content) */}
        <div
          ref={bodyRef}
          onClick={() => { if (ownerMenuOpen) setOwnerMenuOpen(false); }} // tap-out collapses the owner reveal
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            // @ts-ignore
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* ONE GROUP — media + the data block center vertically TOGETHER
              (no void: the data block sits directly beneath the media with
              normal spacing, never pinned to the screen bottom). Brief M1 §2:
              translateX follows the swipe pan. */}
          <div style={{ minHeight: "calc(100vh - 44px)", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", paddingBottom: onScrollDown ? 72 : 0, transform: `translateX(${dragX}px)`, transition: dragTransition, willChange: dragX !== 0 ? "transform" : "auto" }}>
            {/* ── Program nav — a slim row DIRECTLY ABOVE the media frame, in the
                black: ‹ left · counter center · › right (one line, never over
                the media). An arrow vanishes at its end — the rubber-band. ── */}
            {nav && (
              <div style={{ width: "92%", margin: "0 auto 6px", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 26 }}>
                <button onClick={() => nav.onStep(-1)} disabled={nav.index === 0} aria-label="Previous" style={{ background: "transparent", border: "none", cursor: nav.index === 0 ? "default" : "pointer", padding: 4, lineHeight: 0, visibility: nav.index === 0 ? "hidden" : "visible" }}>
                  {/* Inline SVG — the PNG asset's hairline stroke collapsed to ~0.2px at
                      this size and antialiased to grey-53 (measured); a vector stroke
                      rasterizes at native size = true white. */}
                  <svg width="13" height="19" viewBox="0 0 11 17" fill="none" style={{ display: "block", filter: "drop-shadow(0 0 2px rgba(229,225,219,0.6))" }}><path d="M8.5 2.5l-6 6 6 6" stroke="#E5E1DB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.5)", letterSpacing: "0.18em", fontVariantNumeric: "tabular-nums" }}>
                  {nav.index + 1} / {nav.total}
                </span>
                <button onClick={() => nav.onStep(1)} disabled={nav.index === nav.total - 1} aria-label="Next" style={{ background: "transparent", border: "none", cursor: nav.index === nav.total - 1 ? "default" : "pointer", padding: 4, lineHeight: 0, visibility: nav.index === nav.total - 1 ? "hidden" : "visible" }}>
                  <svg width="13" height="19" viewBox="0 0 11 17" fill="none" style={{ display: "block", filter: "drop-shadow(0 0 2px rgba(229,225,219,0.6))" }}><path d="M2.5 2.5l6 6-6 6" stroke="#E5E1DB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            )}
            {/* Compact header ABOVE the media (declutter): creator + ticker/MC lifted off
                the below-media block. @handle quieter (opacity 0.7 = −30%). */}
            <div style={{ width: "92%", margin: "0 auto 8px", display: "flex", alignItems: "center", gap: 8 }}>
              <div className="tappable" onClick={() => goToProfile()} style={{ width: 22, height: 22, borderRadius: "50%", overflow: "hidden", background: "#333", flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {post.profile_image_url
                  ? <img src={feedImage(post.profile_image_url, 96)} alt={post.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase" }}>{post.username?.[0] ?? "?"}</span>}
              </div>
              <span className="tappable" onClick={() => goToProfile()} style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", opacity: 0.7, letterSpacing: "-0.14px", cursor: "pointer", textTransform: "uppercase", display: "inline-block" }}>@{post.username}</span>
              <MusicTitleChip post={post as { music_track_id?: string | null }} />
              {isCoinPost(post) && (
                <span style={{ display: "flex", alignItems: "baseline", gap: 6, marginLeft: "auto" }}>
                  {post.ticker && <TickerMark ticker={post.ticker} size={11.5} />}
                  <span style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(229,225,219,0.4)", letterSpacing: "-0.14px" }}>MC: {mcLabel ?? "…"}</span>
                </span>
              )}
            </div>
            <div key={post.id} style={{ position: "relative", width: "92%", margin: "0 auto", aspectRatio: getAspectRatio(post.layout_id ?? ''), overflow: "hidden", background: "#0a0a0a" }}>{/* Brief M1 §2 — key remounts media per swiped post: frees the outgoing decoder, re-inits GradedVideo's forcePlay + iOS decode watchdog for the incoming (W3 pause/play handoff) */}
              <MusicWaveButton post={post as { music_track_id?: string | null; music_mode?: string | null; music_start_seconds?: number | null; media_type?: string | null }} />
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
                <svg width="23.5" height="23.5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12l7 7 7-7" stroke="rgba(229,225,219,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.35)", textTransform: "uppercase", letterSpacing: "0.12em" }}>SCROLL</span>
              </button>
            )}

          <div style={{ padding: "14px 16px 0" }}>

            {/* (Creator + ticker/MC moved ABOVE the media — see the compact header.) */}

            {/* Caption */}
            {post.caption ? (
              <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: "#E5E1DB", letterSpacing: "-0.1px", lineHeight: 1.55, margin: "0 0 14px" }}>
                {post.caption}
              </p>
            ) : null}

            {/* ADD TO DECK + COLLECT — the small First Cut counter is NOT here on
                full post views; the canonical counter is the FIRST CUT ledger row
                below (which is also the whip target). */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginBottom: 16 }}>
              {deckToast && (
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.04em", animation: "theater-fade-in 0.2s ease-out both" }}>
                  Added to {deckToast}
                </span>
              )}
              {user && ownerView && (
                <button
                  onClick={() => setShowDeckPicker(true)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.6)", letterSpacing: "-0.1px" }}>
                    ADD TO DECK
                  </span>
                </button>
              )}
              <button
                onClick={handleCollect}
                style={{
                  background: "transparent",
                  border: showCollectSheet ? "1px solid #E5E1DB" : "1px solid rgba(229,225,219,0.7)",
                  cursor: "pointer",
                  padding: "5px 10px",
                }}
              >
                {/* Plain COLLECT — the price lives in the collect sheet, in
                    dollars. (The old "· 0.001 ETH" was the 1155 flat mint fee.)
                    Legacy ETH-paired coins read LEGACY and open to the sheet's
                    non-tradeable note rather than a misleading COLLECT. */}
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: showCollectSheet ? "#E5E1DB" : "rgba(229,225,219,0.7)", letterSpacing: "-0.1px" }}>
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
            <div style={{ height: 1, background: "rgba(229,225,219,0.1)", marginBottom: 12 }} />

            {/* Like + comment — the SAME arrangement as the home feed card (heart+count,
                comment+count) so the card and its lightbox read as one. NO share (not an
                offered feature — no false affordances). No bookmark/save (ratified: the
                heart is feeling, COLLECT is conviction). */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {/* Like — pop the inner content, not the button (house rule). */}
              <button
                onClick={handleLike}
                disabled={loading || !user}
                style={{ background: "transparent", border: "none", cursor: user ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4, padding: 0, color: isLiked ? "#E5E1DB" : "rgba(229,225,219,0.6)" }}
              >
                <PressPop><span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="18.7" height="18.7" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: "inherit" }}>{likes.length}</span>
                </span></PressPop>
              </button>

              {/* Comment — icon + count (toggles the comments), matching the feed card. */}
              <button
                onClick={() => setShowComments((v) => !v)}
                style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, color: "rgba(229,225,219,0.6)" }}
              >
                <PressPop><span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="18.7" height="18.7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: "inherit" }}>{comments.length}</span>
                </span></PressPop>
              </button>

              {/* ••• — owner controls reveal (ripple-down). Non-owners have no
                  extra actions today (share is already in the row) → hidden. */}
              {ownerView && (
                <button
                  onClick={(e) => { e.stopPropagation(); setOwnerMenuOpen((v) => !v); }}
                  style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0, marginLeft: "auto" }}
                >
                  <svg width="19.5" height="19.5" viewBox="0 0 24 24" fill="none">
                    <circle cx="5" cy="12" r="1.4" fill={ownerMenuOpen ? "#E5E1DB" : "rgba(229,225,219,0.6)"} />
                    <circle cx="12" cy="12" r="1.4" fill={ownerMenuOpen ? "#E5E1DB" : "rgba(229,225,219,0.6)"} />
                    <circle cx="19" cy="12" r="1.4" fill={ownerMenuOpen ? "#E5E1DB" : "rgba(229,225,219,0.6)"} />
                  </svg>
                </button>
              )}
            </div>

            {/* Comments — ripple down on reveal */}
            {showComments && (
              <div style={{ marginBottom: 16 }}>
                {comments.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.25)", animation: "ripple-down 0.2s ease-out both" }}>
                    no comments yet
                  </p>
                ) : (
                  <CommentList
                    comments={comments}
                    variant="lightbox"
                    likeStates={likeStates}
                    onToggleLike={toggleLike}
                    onReply={(c) => setReplyingTo(c)}
                    onProfile={(h) => goToProfile(h)}
                    viewerDid={user?.id ?? null}
                  />
                )}
              </div>
            )}

            {/* Comment input */}
            {user && (
              <div
                style={{
                  borderTop: "1px solid rgba(229,225,219,0.07)",
                  paddingTop: 12, paddingBottom: 80,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  ref={commentInputRef}
                  className="pm-input"
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                  placeholder="add a comment..."
                  style={{
                    flex: 1, background: "transparent", border: "none",
                    borderBottom: "1px solid rgba(229,225,219,0.15)",
                    outline: "none", ...SKR, fontSize: 'max(16px, var(--fs-9))', color: "#E5E1DB", padding: "2px 0",
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={loading || !newComment.trim()}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    cursor: newComment.trim() ? "pointer" : "default",
                    ...SKB, fontSize: 'var(--fs-9)',
                    color: newComment.trim() ? "#E5E1DB" : "rgba(229,225,219,0.2)",
                    transition: "color 0.15s ease",
                  }}
                >
                  post
                </button>
                </div>
              </div>
            )}

            {/* ── OWNER SECTION — strictly viewer == author, revealed by the
                ••• kebab with the ripple-down stagger (the established ripple
                language; tap-out or ••• again collapses). ── */}
            {ownerView && ownerMenuOpen && (
              <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid rgba(229,225,219,0.08)", padding: "16px 0 90px", display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-7)', color: "rgba(229,225,219,0.35)", textTransform: "uppercase", letterSpacing: "0.18em", margin: 0, animation: "ripple-down 0.2s ease-out both" }}>OWNER</p>

                {/* Pin to grid — max 2 (enforced in pinPost service). */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "50ms" }}>
                    <div>
                      <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>PIN</p>
                      <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.4)", margin: 0 }}>{pinned ? "Pinned to the top of your grid" : "Pin to the top of your grid (max 2)"}</p>
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
                      style={{ background: "transparent", border: `1px solid ${pinned ? "rgba(229,225,219,0.5)" : "rgba(229,225,219,0.2)"}`, cursor: "pointer", padding: "5px 10px" }}
                    >
                      <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: pinned ? "#E5E1DB" : "rgba(229,225,219,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{pinned ? "PINNED" : "PIN"}</span>
                    </button>
                  </div>
                  {pinError && (
                    <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "#E5E1DB", margin: "6px 0 0" }}>{pinError}</p>
                  )}
                </div>

                {/* Autoplay toggle (video) */}
                {isVideoPost && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "100ms" }}>
                    <div>
                      <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>AUTOPLAY ON GRID</p>
                      <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.4)", margin: 0 }}>{autoplayOn ? "Playing automatically" : "Shows thumbnail with play button"}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const v = !autoplayOn;
                        setAutoplayOn(v);
                        await supabase.from("posts").update({ autoplay: v }).eq("id", post.id);
                      }}
                      style={{
                        width: 28, height: 28,
                        background: autoplayOn ? "rgba(229,225,219,0.15)" : "rgba(229,225,219,0.08)",
                        border: `1px solid ${autoplayOn ? "rgba(229,225,219,0.5)" : "rgba(229,225,219,0.2)"}`,
                        cursor: "pointer", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {autoplayOn ? (
                        <svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="#E5E1DB"/><rect x="14" y="4" width="4" height="16" fill="#E5E1DB"/></svg>
                      ) : (
                        <svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="rgba(229,225,219,0.45)"/></svg>
                      )}
                    </button>
                  </div>
                )}

                {/* Replace thumbnail — VIDEO ONLY: a still IS its own image; there's no
                    separate poster frame to replace. */}
                {isVideoPost && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "150ms" }}>
                  <div>
                    <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>THUMBNAIL</p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.4)", margin: 0 }}>{replacingThumb ? "Uploading..." : "Replace poster image"}</p>
                  </div>
                  <button
                    onClick={() => thumbInputRef.current?.click()}
                    style={{ background: "transparent", border: "1px solid rgba(229,225,219,0.2)", cursor: "pointer", padding: "5px 10px" }}
                  >
                    <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{replacingThumb ? "..." : "REPLACE"}</span>
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
                )}

                {/* Re-frame — VIDEO ONLY: a still's crop is baked into the stored image
                    at publish, so there's nothing left to reposition. Video stores
                    full-frame and crops live on the grid → reframe is meaningful there. */}
                {isVideoPost && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "200ms" }}>
                  <div>
                    <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>RE-FRAME</p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.4)", margin: 0 }}>Adjust crop on grid</p>
                  </div>
                  <button
                    onClick={() => setShowReframe(true)}
                    style={{ background: "transparent", border: "1px solid rgba(229,225,219,0.2)", cursor: "pointer", padding: "5px 10px" }}
                  >
                    <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>REFRAME</span>
                  </button>
                </div>
                )}

                {/* Edit Music (M2) — swap / change mode / remove. Pure flag updates
                    (music_track_id / music_mode); applies to image + video posts. */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "225ms" }}>
                  <div>
                    <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>EDIT MUSIC</p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.4)", margin: 0 }}>{(post as { music_track_id?: string | null }).music_track_id ? "Swap, change mode, or remove" : "Add a track from the library"}</p>
                  </div>
                  <button
                    onClick={() => setShowEditMusic(true)}
                    style={{ background: "transparent", border: "1px solid rgba(229,225,219,0.2)", cursor: "pointer", padding: "5px 10px" }}
                  >
                    <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>MUSIC</span>
                  </button>
                </div>

                {/* Delete */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", animation: "ripple-down 0.2s ease-out both", animationDelay: "250ms" }}>
                  <div>
                    <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>DELETE</p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.4)", margin: 0 }}>Remove from your profile</p>
                  </div>
                  <button
                    onClick={() => setShowDeleteSheet(true)}
                    style={{ background: "transparent", border: "1px solid rgba(229,225,219,0.5)", cursor: "pointer", padding: "5px 10px" }}
                  >
                    <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.08em" }}>DELETE</span>
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
      {replyingTo && (
        <ReplyComposer
          parent={replyingTo}
          variant="mobile"
          onClose={() => setReplyingTo(null)}
          onSubmit={submitReply}
        />
      )}
      {showEditMusic && (
        <EditMusicSheet
          post={post as unknown as { id: string; media_type?: string | null; music_track_id?: string | null; music_mode?: 'bed' | 'music_only' | null }}
          onClose={() => setShowEditMusic(false)}
          onUpdated={(trackId, mode) => { const p = post as unknown as Record<string, unknown>; p.music_track_id = trackId; p.music_mode = mode; }}
        />
      )}
    </>,
    document.body,
  );
}
