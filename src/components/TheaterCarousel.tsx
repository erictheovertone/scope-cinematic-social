"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getPostLikes, getPostComments, addComment } from "@/lib/postsService";

interface Post {
  id: string;
  username: string;
  caption: string;
  media_urls: string[];
  created_at: string;
}

interface Comment {
  id: string;
  username: string;
  content: string;
  created_at: string;
}

interface TheaterCarouselProps {
  posts: Post[];
  initialIndex?: number;
  onClose: () => void;
  supabaseUserId?: string;
  viewerUsername?: string;
}

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function TheaterCarousel({
  posts,
  initialIndex = 0,
  onClose,
  supabaseUserId,
  viewerUsername,
}: TheaterCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPortrait, setIsPortrait] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Track which post the detail panel belongs to
  const [detailPostId, setDetailPostId] = useState<string | null>(null);

  // Lock body scroll while carousel is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Scroll to initialIndex on mount
  useEffect(() => {
    if (scrollRef.current && initialIndex > 0) {
      scrollRef.current.scrollLeft = window.innerWidth * initialIndex;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Orientation detection
  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close detail panel when user swipes to a new slide
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const idx = Math.round(scrollRef.current.scrollLeft / window.innerWidth);
    if (idx !== currentIndex) {
      setCurrentIndex(idx);
      setDetailOpen(false);
    }
  }, [currentIndex]);

  const currentPost = posts[currentIndex] ?? null;

  // Nothing to show — render a minimal overlay with a close affordance
  if (posts.length === 0) {
    return (
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'black',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', animation: 'theater-fade-in 0.25s ease-out both',
        }}
      >
        <span style={{ ...SKR, fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>no posts yet</span>
      </div>
    );
  }

  // Open detail panel for the currently-visible post
  const openDetail = async () => {
    if (!currentPost) return;
    // If already open for this post, close instead
    if (detailOpen && detailPostId === currentPost.id) {
      setDetailOpen(false);
      return;
    }
    setDetailOpen(true);
    setDetailPostId(currentPost.id);
    setLikes([]);
    setComments([]);
    setLoadingDetail(true);
    try {
      const [l, c] = await Promise.all([
        getPostLikes(currentPost.id),
        getPostComments(currentPost.id),
      ]);
      setLikes(l);
      setComments(c);
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setCommentText("");
  };

  const submitComment = async () => {
    if (!commentText.trim() || !supabaseUserId || !viewerUsername || !currentPost || submitting) return;
    setSubmitting(true);
    try {
      const newComment = await addComment(currentPost.id, supabaseUserId, viewerUsername, commentText.trim());
      setComments(prev => [...prev, newComment as Comment]);
      setCommentText("");
    } catch (e) {
      console.error("Failed to post comment:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "black",
        animation: "theater-fade-in 0.25s ease-out both",
      }}
    >
      {/* ── Close button ──────────────────────────────── */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          zIndex: 210,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 8,
          lineHeight: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* ── Slide counter ─────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 22,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 210,
          ...SKR,
          fontSize: "8px",
          color: "rgba(255,255,255,0.35)",
          letterSpacing: "0.8px",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        {currentIndex + 1} / {posts.length}
      </div>

      {/* ── Portrait rotation hint ────────────────────── */}
      {isPortrait && (
        <div
          style={{
            position: "absolute",
            bottom: 90,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 210,
            ...SKR,
            fontSize: "7px",
            color: "rgba(255,255,255,0.22)",
            letterSpacing: "-0.1px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            animation: "theater-fade-in 1s ease-out 0.6s both",
          }}
        >
          ↻ rotate for full experience
        </div>
      )}

      {/* ── Horizontal scroll-snap slides ────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          // @ts-ignore
          WebkitOverflowScrolling: "touch",
        }}
      >
        {posts.map((post) => (
          <div
            key={post.id}
            onClick={openDetail}
            style={{
              flexShrink: 0,
              width: "100vw",
              height: "100%",
              scrollSnapAlign: "start",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {post.media_urls?.[0] ? (
              <img
                src={post.media_urls[0]}
                alt={post.caption || ""}
                draggable={false}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  display: "block",
                  userSelect: "none",
                  // @ts-ignore
                  WebkitTouchCallout: "none",
                }}
              />
            ) : (
              <div style={{ ...SKR, fontSize: "10px", color: "#333" }}>No media</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Post detail panel ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          // Actual panel height; transform drives the slide-up
          height: "58%",
          zIndex: 220,
          transform: detailOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
          display: "flex",
          flexDirection: "column",
          background: "rgba(0,0,0,0.88)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        {/* Drag handle */}
        <div
          onClick={closeDetail}
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "12px 0 10px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 3,
              background: "rgba(255,255,255,0.2)",
              borderRadius: 2,
            }}
          />
        </div>

        {/* Content — only render once panel is open to let animations fire fresh */}
        {detailOpen && (
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              padding: "0 18px 20px",
            }}
          >
            {/* Caption */}
            {currentPost?.caption ? (
              <p
                style={{
                  ...SKR,
                  fontSize: "9px",
                  color: "rgba(255,255,255,0.8)",
                  lineHeight: 1.55,
                  margin: "0 0 10px",
                  flexShrink: 0,
                  animation: "ripple-up 0.22s ease-out both",
                }}
              >
                {currentPost.caption}
              </p>
            ) : null}

            {/* Stats row */}
            <div
              style={{
                display: "flex",
                gap: 18,
                marginBottom: 14,
                flexShrink: 0,
                animation: "ripple-up 0.22s ease-out 0.05s both",
              }}
            >
              <span style={{ ...SKR, fontSize: "8px", color: "rgba(255,255,255,0.45)" }}>
                <span style={{ color: "white" }}>{likes.length}</span> likes
              </span>
              <span style={{ ...SKR, fontSize: "8px", color: "rgba(255,255,255,0.45)" }}>
                <span style={{ color: "white" }}>{comments.length}</span> comments
              </span>
            </div>

            {/* Comments */}
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 10 }}>
              {loadingDetail ? (
                <p style={{ ...SKR, fontSize: "7px", color: "rgba(255,255,255,0.25)" }}>
                  loading...
                </p>
              ) : comments.length === 0 ? (
                <p
                  style={{
                    ...SKR,
                    fontSize: "7px",
                    color: "rgba(255,255,255,0.22)",
                    animation: "ripple-up 0.2s ease-out 0.1s both",
                  }}
                >
                  no comments yet
                </p>
              ) : (
                comments.map((c, i) => (
                  <div
                    key={c.id}
                    style={{
                      marginBottom: 9,
                      animation: "ripple-up 0.2s ease-out both",
                      animationDelay: `${0.1 + i * 0.04}s`,
                    }}
                  >
                    <span style={{ ...SKB, fontSize: "8px", color: "white" }}>
                      {c.username}{" "}
                    </span>
                    <span style={{ ...SKR, fontSize: "8px", color: "rgba(255,255,255,0.55)" }}>
                      {c.content}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Comment input */}
            {supabaseUserId && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexShrink: 0,
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                  paddingTop: 10,
                  animation: "ripple-up 0.2s ease-out 0.15s both",
                }}
              >
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="add a comment..."
                  onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    ...SKR,
                    fontSize: "8px",
                    color: "white",
                    letterSpacing: "-0.1px",
                  }}
                />
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim() || submitting}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: commentText.trim() ? "pointer" : "default",
                    ...SKB,
                    fontSize: "8px",
                    color: commentText.trim() ? "white" : "rgba(255,255,255,0.2)",
                    letterSpacing: "-0.1px",
                    transition: "color 0.15s ease",
                    padding: 0,
                  }}
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
