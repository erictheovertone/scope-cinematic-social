"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getPostsPaginated,
  getPostLikes,
  getPostComments,
} from "@/lib/postsService";
import PostModal from "@/components/PostModal";
import PillarboxFrame from "@/components/PillarboxFrame";
import FrameLoader from "@/components/FrameLoader";
import GradedVideo from "@/components/finishing/GradedVideo";
import { getAspectRatio } from "@/lib/aspectRatio";

const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

// ── Mirage Lightbox ──────────────────────────────────────────────────────────

function MirageLightbox({
  post,
  onClose,
  onOpenModal,
}: {
  post: any;
  onClose: () => void;
  onOpenModal: () => void;
}) {
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    Promise.all([getPostLikes(post.id), getPostComments(post.id)])
      .then(([l, c]) => {
        setLikeCount(l.length);
        setCommentCount(c.length);
      })
      .catch(() => {});
    return () => cancelAnimationFrame(id);
  }, [post.id]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  return (
    <div
      className="bg-black"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: visible ? "rgba(0,0,0,0.96)" : "rgba(0,0,0,0)",
        transition: "background 200ms ease",
        overflowY: "auto",
      }}
      onClick={handleClose}
    >
      {/* ← back — sticky so it stays visible while scrolling the lightbox */}
      <button
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
        style={{
          position: "sticky",
          top: 16,
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginLeft: 16,
          marginTop: 16,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          zIndex: 1,
        }}
      >
        <svg width="15.5" height="15.5" viewBox="0 0 13 13" fill="none">
          <path
            d="M8.5 1.5L3.5 6.5l5 5"
            stroke="#E5E1DB"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ ...SKR, fontSize: 'var(--fs-9)', color: "#E5E1DB", letterSpacing: "-0.1px" }}>
          back
        </span>
      </button>

      {/* Image + metadata — stopPropagation so tapping here doesn't close */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minHeight: "calc(100vh - 80px)",
          paddingTop: 20,
          transform: visible ? "scale(1)" : "scale(0.95)",
          transition: "transform 200ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tap image → open PostModal */}
        {post.layout_id === 'legacy' ? (
          <PillarboxFrame onClick={onOpenModal} cursor="pointer">
            <img src={post.media_urls?.[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </PillarboxFrame>
        ) : (
          <img
            src={post.media_urls?.[0]}
            alt=""
            style={{ width: "100%", height: "auto", display: "block", cursor: "pointer" }}
            onClick={onOpenModal}
          />
        )}

        <div style={{ padding: "10px 16px 76px" }}>
          <span
            style={{
              ...SKR,
              fontSize: 'var(--fs-9)',
              color: "rgba(229,225,219,0.7)",
              letterSpacing: "-0.1px",
            }}
          >
            @{post.username} · ♡ {likeCount} · ○ {commentCount}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main MirageView ──────────────────────────────────────────────────────────

export default function MirageView({ onClose }: { onClose: () => void }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightboxPost, setLightboxPost] = useState<any>(null);
  const [modalPost, setModalPost] = useState<any>(null);
  const [exiting, setExiting] = useState(false);
  // Loader only appears if a load runs past the threshold — the near-instant
  // Mirage entry shows NOTHING (no sub-threshold flash).
  const [showLoader, setShowLoader] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const lastTapRef = useRef({ time: 0, id: "" });

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const batch = await getPostsPaginated(pageRef.current, 30);
      if (batch.length < 30) hasMoreRef.current = false;
      setPosts((prev) => [...prev, ...batch]);
      pageRef.current += 1;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMore(); }, [loadMore]);

  // Delay the loader past the ~350ms threshold: instant loads render nothing.
  useEffect(() => {
    if (!loading) { setShowLoader(false); return; }
    const t = setTimeout(() => setShowLoader(true), 350);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    console.log("[MirageView] Grid rendered with", posts.length, "posts");
  }, [posts]);

  useEffect(() => {
    const container = containerRef.current;
    const sentinel = sentinelRef.current;
    if (!container || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { root: container, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleItemTap = (post: any) => {
    const now = Date.now();
    if (now - lastTapRef.current.time < 300 && lastTapRef.current.id === post.id) {
      // double tap → skip lightbox, go straight to PostModal
      setLightboxPost(null);
      setModalPost(post);
    } else {
      setLightboxPost(post);
    }
    lastTapRef.current = { time: now, id: post.id };
  };

  const handleClose = () => {
    setExiting(true);
    setTimeout(onClose, 380);
  };

  return (
    <>
      <style>{`
        @keyframes mirage-item-in {
          from { opacity: 0; transform: scale(0.9) translateY(-8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes mirage-view-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
      `}</style>

      <div
        ref={containerRef}
        className="bg-black"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 45,
          background: "#000",
          overflowY: "auto",
          animation: exiting ? "mirage-view-out 380ms ease-in both" : "none",
        }}
      >
        {/* Mirage logo — sticky close button, always top-right */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            display: "flex",
            justifyContent: "flex-end",
            padding: "4px 6px 14px",
            pointerEvents: "none",
          }}
        >
          <button
            onClick={handleClose}
            aria-label="Close Mirage View"
            style={{
              pointerEvents: "auto",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              lineHeight: 0,
            }}
          >
            <img
              src="/scope-logomark-corner-button-01.png"
              alt="Scope — home"
              style={{
                height: 18,
                width: "auto",
                objectFit: "contain",
                flexShrink: 0,
                display: "block",
                filter: "drop-shadow(0 0 4px rgba(0,0,0,0.6))",
                opacity: 1,
              }}
            />
          </button>
        </div>

        {/* 3-column masonry grid (CSS multi-column — preserves natural aspect ratios) */}
        <div style={{ columnCount: 3, columnGap: 1, padding: 0 }}>
          {posts.map((post, index) =>
            post.media_urls?.[0] ? (
              <div
                key={post.id}
                style={{
                  breakInside: "avoid",
                  // @ts-ignore — webkit prefix for older Safari
                  WebkitColumnBreakInside: "avoid",
                  marginBottom: 1,
                  cursor: "pointer",
                  animation: `mirage-item-in 400ms ease-out ${Math.min(index, 8) * 30}ms both`,
                }}
                onClick={() => handleItemTap(post)}
              >
                {post.media_type === 'video' ? (
                  // Video → GradedVideo (gridMode): autoplay tiles loop the baked
                  // snippet (plain muted <video>, graded — no pipeline); the density
                  // guard attempts all visible, overflow rests as graded posters with
                  // most-visible priority; non-autoplay / clipless → poster. Tap
                  // bubbles to the wrapper (navigation unchanged).
                  post.layout_id === 'legacy' ? (
                    <PillarboxFrame>
                      <GradedVideo
                        url={post.media_urls[0]}
                        posterUrl={post.poster_url ?? post.thumbnail_url}
                        posterWidth={750}
                        clipUrl={post.autoplay_clip_url}
                        editParams={post.edit_params}
                        autoplayFlag={post.autoplay !== false}
                        gridMode
                        cropX={post.crop_x ?? 0} cropY={post.crop_y ?? 0} cropWidth={post.crop_width ?? 1} cropHeight={post.crop_height ?? 1}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </PillarboxFrame>
                  ) : (
                    <GradedVideo
                      url={post.media_urls[0]}
                      posterUrl={post.poster_url ?? post.thumbnail_url}
                      posterWidth={750}
                      clipUrl={post.autoplay_clip_url}
                      editParams={post.edit_params}
                      autoplayFlag={post.autoplay !== false}
                      gridMode
                      cropX={post.crop_x ?? 0} cropY={post.crop_y ?? 0} cropWidth={post.crop_width ?? 1} cropHeight={post.crop_height ?? 1}
                      style={{ width: '100%', aspectRatio: getAspectRatio(post.layout_id ?? '') }}
                    />
                  )
                ) : post.layout_id === 'legacy' ? (
                  <PillarboxFrame>
                    <img
                      src={post.media_urls[0]}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
                  </PillarboxFrame>
                ) : (
                  <img
                    src={post.media_urls[0]}
                    alt=""
                    style={{ width: "100%", height: "auto", display: "block" }}
                    loading="lazy"
                  />
                )}
              </div>
            ) : null,
          )}
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        {loading && showLoader && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "16px 0",
            }}
          >
            <FrameLoader />
          </div>
        )}

        {/* Spacer so content clears the bottom toolbar */}
        <div style={{ height: 76 }} />
      </div>

      {lightboxPost && (
        <MirageLightbox
          post={lightboxPost}
          onClose={() => setLightboxPost(null)}
          onOpenModal={() => {
            const p = lightboxPost;
            setLightboxPost(null);
            setModalPost(p);
          }}
        />
      )}

      {modalPost && (
        <PostModal post={modalPost} onClose={() => setModalPost(null)} />
      )}
    </>
  );
}
