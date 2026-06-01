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
import { addBookmark, removeBookmark, isBookmarked } from "@/lib/bookmarksService";
import CollectSheet from "@/components/CollectSheet";
import MediaRenderer from "@/components/MediaRenderer";
import { getTokenPrice, getTokenHolders } from "@/lib/zora";
import { formatEther } from "viem";
import { getAspectRatio, ratioPadding } from "@/lib/aspectRatio";

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
  media_type?: string;
  thumbnail_url?: string | null;
  autoplay?: boolean;
}


interface PostItemProps {
  post: Post;
  onImageClick?: () => void;
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

export default function PostItem({ post, onImageClick }: PostItemProps) {
  const router = useRouter();
  const { user } = usePrivy();
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewerUsername, setViewerUsername] = useState("");
  const [showCollectSheet, setShowCollectSheet] = useState(false);
  const [mc, setMc] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

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
        const [l, c, liked, saved] = await Promise.all([
          getPostLikes(post.id),
          getPostComments(post.id),
          user ? isPostLikedByUser(post.id, user.id) : Promise.resolve(false),
          user ? isBookmarked(user.id, post.id) : Promise.resolve(false),
        ]);
        setLikes(l);
        setComments(c);
        setIsLiked(liked);
        setIsSaved(saved);
      } catch (e) {
        console.error("Error loading post data:", e);
      }
    };
    load();
  }, [post.id, user?.id]);

  // Fetch market cap for minted posts
  useEffect(() => {
    if (!post.is_minted || !post.contract_address) return;
    let cancelled = false;
    const fetchMC = async () => {
      try {
        const tokenId = BigInt(post.token_id || "1");
        const [supply, price] = await Promise.all([
          getTokenHolders({ contractAddress: post.contract_address!, tokenId }),
          getTokenPrice({ contractAddress: post.contract_address!, tokenId }),
        ]);
        if (cancelled) return;
        const mcEth = Number(supply) * parseFloat(formatEther(price));
        const mcUsd = mcEth * 3000;
        setMc(`$${mcUsd < 1 ? mcUsd.toFixed(2) : Math.round(mcUsd).toLocaleString()}`);
        console.log("[PostItem] MC fetched — supply:", supply.toString(), "priceETH:", formatEther(price));
      } catch (e) {
        console.error("[PostItem] MC fetch error:", e);
      }
    };
    fetchMC();
    return () => { cancelled = true; };
  }, [post.id, post.is_minted, post.contract_address, post.token_id]);

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

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      if (isSaved) {
        await removeBookmark(user.id, post.id);
        setIsSaved(false);
      } else {
        await addBookmark(user.id, post.id);
        setIsSaved(true);
      }
    } catch (err) {
      console.error("Error toggling bookmark:", err);
    }
  };

  const paddingPercent = ratioPadding(getAspectRatio(post.layout_id ?? ''));

  return (
    <div style={{ marginBottom: 28 }}>

      {/* ── Image with overlaid avatar + username ── */}
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
          <MediaRenderer
            url={post.media_urls?.[0]}
            mediaType={post.media_type}
            caption={post.caption}
            thumbnailUrl={post.thumbnail_url}
            autoplay={post.autoplay !== false}
            showSoundToggle={true}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onClick={onImageClick}
          />
        </div>
        <div style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 10 }}>
          {post.profile_image_url && (
            <img src={post.profile_image_url} style={{ width: '14px', height: '14px', borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <span
            onClick={(e) => { e.stopPropagation(); router.push('/profile/' + post.username); }}
            style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: '8px', color: 'white', cursor: 'pointer', textShadow: '0 1px 2px rgba(0,0,0,1)' }}
          >
            @{post.username}
          </span>
        </div>
        <span style={{ position: 'absolute', top: '6px', right: '6px', fontFamily: 'IBM Plex Mono,monospace', fontSize: '8px', color: 'white', textShadow: '0 1px 2px rgba(0,0,0,1)', zIndex: 10, opacity: 0.85 }}>
          MC: {mc ?? '—'}
        </span>
      </div>

      {/* ── Below-image row: like · comment · COLLECT ── */}
      <div style={{ display: "flex", alignItems: "center", padding: "5px 2px 0", gap: 12 }}>
        <button
          onClick={handleLike}
          disabled={loading || !user}
          style={{ background: "transparent", border: "none", cursor: user ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4, padding: 0, color: isLiked ? "#FF0000" : "rgba(255,255,255,0.6)" }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span style={{ ...MONO, fontSize: 7, color: "inherit" }}>{likes.length}</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setShowComments((v) => !v); }}
          style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, color: "rgba(255,255,255,0.6)" }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ ...MONO, fontSize: 7, color: "inherit" }}>{comments.length}</span>
        </button>

        <button
          onClick={handleSave}
          disabled={!user}
          style={{ background: "transparent", border: "none", cursor: user ? "pointer" : "default", display: "flex", alignItems: "center", padding: 0, color: isSaved ? "#FF0000" : "rgba(255,255,255,0.6)" }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setShowCollectSheet(true); }}
          style={{
            marginLeft: "auto",
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
          <span style={{ ...MONO, fontSize: 7, color: showCollectSheet ? "#FF0000" : "rgba(255,255,255,0.7)", lineHeight: 1 }}>COLLECT</span>
        </button>
      </div>

      {post.caption && (
        <p style={{ ...MONO, fontSize: 8, color: "white", letterSpacing: "-0.1px", lineHeight: 1.5, margin: "5px 2px 0" }}>
          {post.caption}
        </p>
      )}

      <CollectSheet
        post={post}
        visible={showCollectSheet}
        onClose={() => setShowCollectSheet(false)}
      />

      {showComments && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
          {user && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                placeholder="add a comment..."
                style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.15)", outline: "none", ...MONO, fontSize: 8, color: "white", padding: "2px 0" }}
              />
              <button
                onClick={handleAddComment}
                disabled={loading || !newComment.trim()}
                style={{ background: "transparent", border: "none", cursor: "pointer", ...MONO, fontSize: 8, color: newComment.trim() ? "white" : "rgba(255,255,255,0.25)", padding: 0 }}
              >
                post
              </button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {comments.map((c) => (
              <div key={c.id}>
                <span style={{ ...MONO, fontSize: 8, color: "white", marginRight: 6 }}>@{c.username}</span>
                <span style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.6)" }}>{c.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
