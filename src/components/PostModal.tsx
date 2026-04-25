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
import { supabase } from "@/lib/supabase/client";

interface Post {
  id: string;
  user_id?: string;
  username: string;
  caption: string;
  media_urls: string[];
  layout_id?: string;
  created_at: string;
  profile_image_url?: string | null;
}

interface PostModalProps {
  post: Post;
  onClose: () => void;
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

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
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [deckToast, setDeckToast] = useState("");

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
    setCollectToast(true);
    setTimeout(() => setCollectToast(false), 2000);
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
            <span style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.1px" }}>Back</span>
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
          {/* Image — full width, 2.4:1 */}
          <div style={{ width: "100%", aspectRatio: "2.4 / 1", overflow: "hidden", background: "#0a0a0a" }}>
            {post.media_urls?.[0] ? (
              <img
                src={post.media_urls[0]}
                alt={post.caption || ""}
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
                  <span style={{ ...MONO, fontSize: 9, color: "white", textTransform: "uppercase" }}>
                    {post.username?.[0] ?? "?"}
                  </span>
                )}
              </div>

              <span
                onClick={goToProfile}
                style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.14px", cursor: "pointer" }}
              >
                @{post.username}
              </span>

              <span style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.14px", marginLeft: "auto" }}>
                MC: —
              </span>
            </div>

            {/* Caption */}
            {post.caption ? (
              <p style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.1px", lineHeight: 1.55, margin: "0 0 14px" }}>
                {post.caption}
              </p>
            ) : null}

            {/* ADD TO DECK + COLLECT */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginBottom: 16 }}>
              {deckToast && (
                <span style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.55)", animation: "theater-fade-in 0.2s ease-out both" }}>
                  Added to {deckToast}
                </span>
              )}
              {user && (
                <button
                  onClick={() => setShowDeckPicker(true)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <span style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.6)", letterSpacing: "-0.1px" }}>
                    ADD TO DECK
                  </span>
                </button>
              )}
              {collectToast && (
                <span
                  style={{
                    ...MONO, fontSize: 8, color: "rgba(255,255,255,0.55)",
                    animation: "theater-fade-in 0.2s ease-out both",
                  }}
                >
                  Collecting coming soon
                </span>
              )}
              <button
                onClick={handleCollect}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  padding: "5px 10px",
                }}
              >
                <span style={{ ...MONO, fontSize: 8, color: "white", letterSpacing: "-0.1px" }}>
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                    fill={isLiked ? "#FF0000" : "none"}
                    stroke={isLiked ? "#FF0000" : "white"}
                    strokeWidth="2"
                  />
                </svg>
                <span style={{ ...MONO, fontSize: 8, color: "inherit" }}>{likes.length}</span>
              </button>

              {/* Comments toggle */}
              <button
                onClick={() => setShowComments((v) => !v)}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.1px" }}>
                  {showComments ? "hide comments" : `tap to see comments (${comments.length})`}
                </span>
              </button>
            </div>

            {/* Comments — ripple down on reveal */}
            {showComments && (
              <div style={{ marginBottom: 16 }}>
                {comments.length === 0 ? (
                  <p style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.25)", animation: "ripple-down 0.2s ease-out both" }}>
                    no comments yet
                  </p>
                ) : (
                  comments.map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10,
                        animation: "ripple-down 0.2s ease-out both",
                        animationDelay: `${i * 50}ms`,
                      }}
                    >
                      <div
                        style={{
                          width: 18, height: 18, borderRadius: "50%", background: "#2a2a2a",
                          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {c.profile_image_url ? (
                          <img src={c.profile_image_url} alt={c.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ ...MONO, fontSize: 7, color: "white", textTransform: "uppercase" }}>
                            {c.username?.[0] ?? "?"}
                          </span>
                        )}
                      </div>
                      <div>
                        <span style={{ ...MONO, fontSize: 8, color: "white", marginRight: 6 }}>@{c.username}</span>
                        <span style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.6)" }}>{c.content}</span>
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
                    outline: "none", ...MONO, fontSize: 9, color: "white", padding: "2px 0",
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={loading || !newComment.trim()}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    cursor: newComment.trim() ? "pointer" : "default",
                    ...MONO, fontSize: 9,
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
    </>
  );
}
