"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import DeckPickerSheet from "@/components/DeckPickerSheet";
import CollectSheet from "@/components/CollectSheet";
import { supabase } from "@/lib/supabase/client";
import { getAspectRatio } from "@/lib/aspectRatio";
import MediaRenderer from "@/components/MediaRenderer";

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
  autoplay?: boolean;
  crop_x?: number;
  crop_y?: number;
  crop_width?: number;
  crop_height?: number;
}

interface PostModalProps {
  post: Post;
  onClose: () => void;
}

const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function PostModal({ post, onClose }: PostModalProps) {
  const router = useRouter();
  const { user } = usePrivy();

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
  const [bookmarked, setBookmarked] = useState(false);

  // Viewer's own Supabase profile (for comment submission)
  const [viewerUsername, setViewerUsername] = useState<string>("");
  const [viewerAvatar, setViewerAvatar] = useState<string | null>(null);

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

  // Animated close
  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 340);
  };

  const goToProfile = () => {
    handleClose();
    setTimeout(() => router.push(`/profile/${post.username}`), 340);
  };

  const handleLike = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isLiked) {
        await unlikePost(post.id, user.id);
        setLikes((p) => p.filter((l) => l.user_id !== user.id));
        setIsLiked(false);
      } else {
        const l = await likePost(post.id, user.id, user.email ? String(user.email).split("@")[0] : "user");
        setLikes((p) => [...p, l]);
        setIsLiked(true);
      }
    } catch (e) {
      console.error("Like error:", e);
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
      setComments((p) => [...p, { ...c, profile_image_url: viewerAvatar }]);
      setNewComment("");
    } catch (e) {
      console.error("Comment error:", e);
    } finally {
      setLoading(false);
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

  return (
    <>
      {/* Scoped placeholder colour */}
      <style>{`.pm-input::placeholder { color: rgba(255,255,255,0.35); }`}</style>

      {/*
        Outer div needs bg-black in className so the globals.css rule
        `div[style*="position: fixed"]:not([class*="bg-black"])` doesn't hide it.
      */}
      <div
        className="bg-black"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          backgroundColor: "#000000",
          display: "flex",
          flexDirection: "column",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* ── Back bar ── */}
        <div
          style={{
            flexShrink: 0,
            height: 44,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
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
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M8.5 1.5L3.5 6.5l5 5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ ...SKB, fontSize: 9, color: "white", letterSpacing: "-0.1px" }}>BACK</span>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            // @ts-ignore
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div style={{ width: "100%", aspectRatio: getAspectRatio(post.layout_id ?? ''), overflow: "hidden", background: "#0a0a0a" }}>
            {post.media_urls?.[0] ? (
              <MediaRenderer
                url={post.media_urls[0]}
                mediaType={post.media_type}
                caption={post.caption || ""}
                thumbnailUrl={post.thumbnail_url}
                autoplay={post.autoplay !== false}
                showSoundToggle
                cropX={post.crop_x ?? 0}
                cropY={post.crop_y ?? 0}
                cropWidth={post.crop_width ?? 1}
                cropHeight={post.crop_height ?? 1}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "#0a0a0a" }} />
            )}
          </div>

          <div style={{ padding: "14px 16px 0" }}>

            {/* Avatar + @username | MC */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <div
                onClick={goToProfile}
                style={{
                  width: 24, height: 24, borderRadius: "50%", overflow: "hidden",
                  background: "#333", flexShrink: 0, marginRight: 8,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {post.profile_image_url ? (
                  <img src={post.profile_image_url} alt={post.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ ...SKB, fontSize: 9, color: "white", textTransform: "uppercase" }}>
                    {post.username?.[0] ?? "?"}
                  </span>
                )}
              </div>

              <span
                onClick={goToProfile}
                style={{ ...SKB, fontSize: 9, color: "white", letterSpacing: "-0.14px", cursor: "pointer", textTransform: "uppercase" }}
              >
                @{post.username}
              </span>

              <span style={{ ...SKR, fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.14px", marginLeft: "auto" }}>
                MC: —
              </span>
            </div>

            {/* Caption */}
            {post.caption ? (
              <p style={{ ...SKR, fontSize: 12, color: "white", letterSpacing: "-0.1px", lineHeight: 1.55, margin: "0 0 14px" }}>
                {post.caption}
              </p>
            ) : null}

            {/* ADD TO DECK + COLLECT */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginBottom: 16 }}>
              {deckToast && (
                <span style={{ ...SKR, fontSize: 8, color: "rgba(255,255,255,0.55)", animation: "theater-fade-in 0.2s ease-out both" }}>
                  Added to {deckToast}
                </span>
              )}
              {user && post.user_id === user.id && (
                <button
                  onClick={() => setShowDeckPicker(true)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <span style={{ ...SKB, fontSize: 8, color: "rgba(255,255,255,0.6)", letterSpacing: "-0.1px" }}>
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
                <span style={{ ...SKB, fontSize: 8, color: showCollectSheet ? "#FF0000" : "rgba(255,255,255,0.7)", letterSpacing: "-0.1px" }}>
                  COLLECT · 0.001 ETH
                </span>
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", marginBottom: 12 }} />

            {/* Like + comments toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
              {/* Like */}
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                    fill={isLiked ? "#FF0000" : "none"}
                    stroke={isLiked ? "#FF0000" : "white"}
                    strokeWidth="2"
                  />
                </svg>
                <span style={{ ...SKR, fontSize: 8, color: "inherit" }}>{likes.length}</span>
              </button>

              {/* Comments toggle */}
              <button
                onClick={() => setShowComments((v) => !v)}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ ...SKR, fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.1px" }}>
                  {showComments ? "hide comments" : `tap to see comments (${comments.length})`}
                </span>
              </button>

              {/* Bookmark */}
              <button
                onClick={() => setBookmarked(v => !v)}
                style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={bookmarked ? "white" : "none"} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>

              {/* Share */}
              <button
                onClick={handleShare}
                style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>
            </div>

            {/* Comments — ripple down on reveal */}
            {showComments && (
              <div style={{ marginBottom: 16 }}>
                {comments.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 8, color: "rgba(255,255,255,0.25)", animation: "ripple-down 0.2s ease-out both" }}>
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
                      <div
                        style={{
                          width: 16, height: 16, borderRadius: "50%", background: "#2a2a2a",
                          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {c.profile_image_url ? (
                          <img src={c.profile_image_url} alt={c.username} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <span style={{ ...SKB, fontSize: 7, color: "white", textTransform: "uppercase", lineHeight: 1 }}>
                            {c.username?.[0] ?? "?"}
                          </span>
                        )}
                      </div>
                      <div style={{ lineHeight: 1.1 }}>
                        <span style={{ ...SKB, fontSize: 8, color: "white", marginRight: 5, textTransform: "uppercase" }}>@{c.username}</span>
                        <span style={{ ...SKR, fontSize: 8, color: "rgba(255,255,255,0.6)" }}>{c.content}</span>
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
                    outline: "none", ...SKR, fontSize: 9, color: "white", padding: "2px 0",
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={loading || !newComment.trim()}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    cursor: newComment.trim() ? "pointer" : "default",
                    ...SKB, fontSize: 9,
                    color: newComment.trim() ? "white" : "rgba(255,255,255,0.2)",
                    transition: "color 0.15s ease",
                  }}
                >
                  post
                </button>
              </div>
            )}

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

      <CollectSheet
        post={post}
        visible={showCollectSheet}
        onClose={() => setShowCollectSheet(false)}
      />
    </>
  );
}
