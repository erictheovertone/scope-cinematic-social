"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  likePost, unlikePost, getPostLikes, isPostLikedByUser,
  addComment, getPostComments,
} from "@/lib/postsService";
import { getUserByPrivyId, getProfile } from "@/lib/userService";
import DeckPickerSheet from "@/components/DeckPickerSheet";
import { supabase } from "@/lib/supabase/client";

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

interface Post {
  id: string;
  user_id?: string;
  username: string;
  caption: string;
  media_urls: string[];
  created_at: string;
  profile_image_url?: string | null;
}

// ── Single post card within the scrollable viewer ───────────────────

interface ItemProps {
  post: Post;
  ownerUsername: string;
  ownerAvatarUrl?: string | null;
  viewerUsername: string;
  viewerAvatar: string | null;
  onNavigateToProfile: () => void;
}

function PostViewerItem({
  post, ownerUsername, ownerAvatarUrl, viewerUsername, viewerAvatar, onNavigateToProfile,
}: ItemProps) {
  const { user } = usePrivy();
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [collectToast, setCollectToast] = useState(false);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [deckToast, setDeckToast] = useState("");

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

  const handleLike = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isLiked) {
        await unlikePost(post.id, user.id);
        setLikes(p => p.filter(l => l.user_id !== user.id));
        setIsLiked(false);
      } else {
        const l = await likePost(post.id, user.id, viewerUsername || "user");
        setLikes(p => [...p, l]);
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
      const c = await addComment(post.id, user.id, viewerUsername || "user", newComment.trim());
      setComments(p => [...p, { ...c, profile_image_url: viewerAvatar }]);
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
    <div style={{ paddingBottom: 40, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>

      {/* Image — 2.4:1 full width */}
      <div style={{ width: "100%", aspectRatio: "2.4 / 1", overflow: "hidden", background: "#0a0a0a" }}>
        {post.media_urls?.[0] ? (
          <img
            src={post.media_urls[0]}
            alt={post.caption || ""}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#111" }} />
        )}
      </div>

      <div style={{ padding: "12px 16px 0" }}>

        {/* Avatar · @username · MC */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <div
            onClick={onNavigateToProfile}
            style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", background: "#333", flexShrink: 0, marginRight: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {ownerAvatarUrl ? (
              <img src={ownerAvatarUrl} alt={ownerUsername} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ ...MONO, fontSize: 9, color: "white", textTransform: "uppercase" }}>{ownerUsername?.[0] ?? "?"}</span>
            )}
          </div>
          <span onClick={onNavigateToProfile} style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.14px", cursor: "pointer" }}>
            @{ownerUsername}
          </span>
          <span style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>MC: —</span>
        </div>

        {/* Caption */}
        {post.caption ? (
          <p style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.1px", lineHeight: 1.55, margin: "0 0 14px" }}>
            {post.caption}
          </p>
        ) : null}

        {/* Action row — like · comment · share · save · COLLECT */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 14 }}>

          {/* ♡ Like */}
          <button
            onClick={handleLike}
            disabled={loading || !user}
            style={{ background: "transparent", border: "none", cursor: user ? "pointer" : "default", display: "flex", alignItems: "center", gap: 5, padding: 0 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill={isLiked ? "#FF0000" : "none"}
                stroke={isLiked ? "#FF0000" : "white"}
                strokeWidth="1.8"
              />
            </svg>
            <span style={{ ...MONO, fontSize: 8, color: isLiked ? "#FF0000" : "white" }}>{likes.length}</span>
          </button>

          {/* ○ Comment */}
          <button
            onClick={() => setShowComments(v => !v)}
            style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ ...MONO, fontSize: 8, color: "white" }}>{comments.length}</span>
          </button>

          {/* Share — UI only */}
          <button style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>

          {/* Save — UI only */}
          <button style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          {/* ADD TO DECK + COLLECT — right-aligned */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {deckToast && (
              <span style={{ ...MONO, fontSize: 7, color: "rgba(255,255,255,0.5)", animation: "theater-fade-in 0.2s ease-out both" }}>
                Added to {deckToast}
              </span>
            )}
            {user && (
              <button
                onClick={() => setShowDeckPicker(true)}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ ...MONO, fontSize: 7, color: "rgba(255,255,255,0.55)" }}>ADD TO DECK</span>
              </button>
            )}
            {collectToast && (
              <span style={{ ...MONO, fontSize: 7, color: "rgba(255,255,255,0.5)", animation: "theater-fade-in 0.2s ease-out both" }}>
                Collecting coming soon
              </span>
            )}
            <button
              onClick={handleCollect}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.45)", cursor: "pointer", padding: "4px 8px" }}
            >
              <span style={{ ...MONO, fontSize: 7, color: "white" }}>COLLECT · 0.001 ETH</span>
            </button>
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
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 12 }} />

        {/* Comments toggle label */}
        <button
          onClick={() => setShowComments(v => !v)}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, marginBottom: showComments ? 12 : 0 }}
        >
          <span style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.4)" }}>
            {showComments ? "hide comments" : `tap to see comments (${comments.length})`}
          </span>
        </button>

        {/* Comments ripple down */}
        {showComments && (
          <div style={{ marginTop: 8 }}>
            {comments.length === 0 ? (
              <p style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.25)", animation: "ripple-down 0.2s ease-out both" }}>
                no comments yet
              </p>
            ) : (
              comments.map((c, i) => (
                <div
                  key={c.id}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10, animation: "ripple-down 0.2s ease-out both", animationDelay: `${i * 50}ms` }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2a2a2a", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {c.profile_image_url ? (
                      <img src={c.profile_image_url} alt={c.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ ...MONO, fontSize: 7, color: "white", textTransform: "uppercase" }}>{c.username?.[0] ?? "?"}</span>
                    )}
                  </div>
                  <div>
                    <span style={{ ...MONO, fontSize: 8, color: "white", marginRight: 6 }}>@{c.username}</span>
                    <span style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.6)" }}>{c.content}</span>
                  </div>
                </div>
              ))
            )}

            {/* Comment input */}
            {user && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10, marginTop: 6 }}>
                <input
                  className="pm-input"
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddComment()}
                  placeholder="add a comment..."
                  style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.15)", outline: "none", ...MONO, fontSize: 9, color: "white", padding: "2px 0" }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={loading || !newComment.trim()}
                  style={{ background: "transparent", border: "none", cursor: newComment.trim() ? "pointer" : "default", ...MONO, fontSize: 9, color: newComment.trim() ? "white" : "rgba(255,255,255,0.2)", padding: 0, transition: "color 0.15s ease" }}
                >
                  post
                </button>
              </div>
            )}
          </div>
        )}
      </div>
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
}

export default function ProfilePostViewer({
  posts, initialIndex = 0, ownerUsername, ownerAvatarUrl, onClose,
}: ProfilePostViewerProps) {
  const router = useRouter();
  const { user } = usePrivy();
  const [visible, setVisible] = useState(false);
  const [viewerUsername, setViewerUsername] = useState("");
  const [viewerAvatar, setViewerAvatar] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  const goToProfile = () => {
    handleClose();
    setTimeout(() => router.push(`/profile/${ownerUsername}`), 340);
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
      <style>{`.pm-input::placeholder { color: rgba(255,255,255,0.35); }`}</style>

      {/* Back bar */}
      <div style={{ flexShrink: 0, height: 44, display: "flex", alignItems: "center", padding: "0 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={handleClose} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, padding: 0 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M8.5 1.5L3.5 6.5l5 5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.1px" }}>Back</span>
        </button>
      </div>

      {/* Scroll container with vertical snap */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          // @ts-ignore
          WebkitOverflowScrolling: "touch",
        }}
      >
        {posts.map((post, i) => (
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
            />
          </div>
        ))}
      </div>
    </div>
  );
}
