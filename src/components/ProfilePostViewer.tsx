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
import CollectSheet from "@/components/CollectSheet";
import DeletePostSheet from "@/components/DeletePostSheet";
import MediaRenderer from "@/components/MediaRenderer";
import { supabase } from "@/lib/supabase/client";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

interface Post {
  id: string;
  user_id?: string;
  username: string;
  caption: string;
  media_urls: string[];
  created_at: string;
  profile_image_url?: string | null;
  grid_layout?: string | null;
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
  onNavigateToProfile: () => void;
  isOwnProfile?: boolean;
  onDeletePress?: (postId: string) => void;
}

function PostViewerItem({
  post, ownerUsername, ownerAvatarUrl, viewerUsername, viewerAvatar, onNavigateToProfile, isOwnProfile, onDeletePress,
}: ItemProps) {
  const { user } = usePrivy();
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [showCollectSheet, setShowCollectSheet] = useState(false);
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
    setShowCollectSheet(true);
  };

  return (
    <div>

      {/* ── IMAGE ── position:relative, overflow:hidden */}
      <div
        style={{ position: "relative", width: "100%", aspectRatio: "2.4 / 1", overflow: "hidden", background: "#0a0a0a" }}
        onClick={(e) => e.stopPropagation()}
      >
        {post.media_urls?.[0] ? (
          <MediaRenderer
            url={post.media_urls[0]}
            mediaType={(post as any).media_type}
            caption={post.caption || ""}
            thumbnailUrl={(post as any).thumbnail_url}
            autoplay={true}
            showSoundToggle={true}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#111" }} />
        )}

        {/* Avatar + username — flex row, top: 6, left: 6 */}
        <div
          className="absolute"
          onClick={(e) => { e.stopPropagation(); onNavigateToProfile(); }}
          style={{ top: 6, left: 6, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", zIndex: 10, opacity: 0.85 }}
        >
          <img
            src={ownerAvatarUrl || undefined}
            style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "#333" }}
          />
          <span style={{ ...SKB, fontSize: 8, color: "white", textShadow: "0 1px 2px rgba(0,0,0,1)", lineHeight: 1, textTransform: "uppercase" }}>
            @{ownerUsername}
          </span>
        </div>

        {/* MC — top: 6, right: 6 */}
        <span
          className="absolute"
          style={{ top: 6, right: 6, ...SKB, fontSize: 8, color: "white", textShadow: "0 1px 2px rgba(0,0,0,1)", lineHeight: 1, opacity: 0.7, textTransform: "uppercase" }}
        >
          MC: —
        </span>
      </div>

      {/* ── ACTION ROW — marginTop: 2px ── */}
      <div style={{ marginTop: 2, padding: "0 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>

        {/* Left: like · comment · bookmark · share */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleLike}
            disabled={loading || !user}
            style={{ background: "transparent", border: "none", cursor: user ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ opacity: isLiked ? 1 : 0.7 }}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill={isLiked ? "#FF0000" : "none"} stroke={isLiked ? "#FF0000" : "white"} strokeWidth="1.8"
              />
            </svg>
            <span style={{ ...SKB, fontSize: 8, color: isLiked ? "#FF0000" : "white", opacity: isLiked ? 1 : 0.7 }}>{likes.length}</span>
          </button>

          <button
            onClick={() => setShowComments(v => !v)}
            style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{ opacity: 0.7 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ ...SKB, fontSize: 8, color: "white", opacity: 0.7 }}>{comments.length}</span>
          </button>

          <button style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <button style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
        </div>

        {/* Right: add to deck · collect */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {deckToast && (
            <span style={{ ...SKB, fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Added to {deckToast}</span>
          )}
          {user && post.user_id === user.id && (
            <button onClick={() => setShowDeckPicker(true)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              <span style={{ ...SKB, fontSize: 8, color: "white", opacity: 0.7, textTransform: "uppercase" }}>ADD TO DECK</span>
            </button>
          )}
          <button
            onClick={handleCollect}
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
            <span style={{ ...SKB, fontSize: 8, color: showCollectSheet ? "#FF0000" : "rgba(255,255,255,0.7)", lineHeight: 1, textTransform: "uppercase" }}>COLLECT</span>
          </button>

          {isOwnProfile && (
            <button
              onClick={() => onDeletePress?.(post.id)}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="3" cy="9" r="1.5" fill="white" opacity="0.7" />
                <circle cx="9" cy="9" r="1.5" fill="white" opacity="0.7" />
                <circle cx="15" cy="9" r="1.5" fill="white" opacity="0.7" />
              </svg>
            </button>
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

      <CollectSheet
        post={post}
        visible={showCollectSheet}
        onClose={() => setShowCollectSheet(false)}
      />

      {/* ── CAPTION — marginTop: 3, marginBottom: 16 (separator) ── */}
      <div style={{ padding: "0 4px", marginTop: 3, marginBottom: 31 }}>
        {post.caption ? (
          <p style={{ ...SKR, fontSize: 8, color: "white", margin: 0, lineHeight: 1.4 }}>
            {post.caption}
          </p>
        ) : null}

        {/* Comments */}
        {showComments && (
          <div style={{ marginTop: 8 }}>
            {comments.length === 0 ? (
              <p style={{ ...SKR, fontSize: 9, color: "rgba(255,255,255,0.25)", margin: 0, textTransform: "uppercase" }}>NO COMMENTS YET</p>
            ) : (
              comments.map((c, i) => (
                <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8, animation: "ripple-down 0.2s ease-out both", animationDelay: `${i * 50}ms` }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#2a2a2a", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {c.profile_image_url
                      ? <img src={c.profile_image_url} alt={c.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ ...MONO, fontSize: 6, color: "white", textTransform: "uppercase" }}>{c.username?.[0] ?? "?"}</span>
                    }
                  </div>
                  <div>
                    <span style={{ ...SKB, fontSize: 9, color: "white", marginRight: 5, textTransform: "uppercase" }}>@{c.username}</span>
                    <span style={{ ...SKR, fontSize: 9, color: "rgba(255,255,255,0.6)", textTransform: "none" }}>{c.content}</span>
                  </div>
                </div>
              ))
            )}
            {user && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 8, marginTop: 4 }}>
                <input
                  className="pm-input"
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddComment()}
                  placeholder="add a comment..."
                  style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.15)", outline: "none", ...SKR, fontSize: 9, color: "white", padding: "2px 0" }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={loading || !newComment.trim()}
                  style={{ background: "transparent", border: "none", cursor: newComment.trim() ? "pointer" : "default", ...SKB, fontSize: 9, color: newComment.trim() ? "white" : "rgba(255,255,255,0.2)", padding: 0, textTransform: "uppercase" }}
                >
                  POST
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
  isOwnProfile?: boolean;
}

export default function ProfilePostViewer({
  posts: initialPosts, initialIndex = 0, ownerUsername, ownerAvatarUrl, onClose, isOwnProfile,
}: ProfilePostViewerProps) {
  const router = useRouter();
  const { user } = usePrivy();
  const [visible, setVisible] = useState(false);
  const [viewerUsername, setViewerUsername] = useState("");
  const [viewerAvatar, setViewerAvatar] = useState<string | null>(null);
  const [localPosts, setLocalPosts] = useState(initialPosts);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deletePostId, setDeletePostId] = useState<string>('');
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
          <span style={{ ...SKB, fontSize: 9, color: "white", letterSpacing: "-0.1px", textTransform: "uppercase" }}>BACK</span>
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
              isOwnProfile={isOwnProfile}
              onDeletePress={(postId) => { setDeletePostId(postId); setShowDeleteSheet(true); }}
            />
          </div>
        ))}
      </div>

      <DeletePostSheet
        visible={showDeleteSheet}
        postId={deletePostId}
        userId={user?.id || ''}
        onClose={() => setShowDeleteSheet(false)}
        onDeleted={(deletedPostId) => {
          const newPosts = localPosts.filter(p => p.id !== deletedPostId);
          setLocalPosts(newPosts);
          if (newPosts.length === 0) onClose();
        }}
      />
    </div>
  );
}
