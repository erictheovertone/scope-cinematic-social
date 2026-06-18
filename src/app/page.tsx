"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { getAllPosts } from "@/lib/postsService";
import PostItem from "@/components/PostItem";
import PostModal from "@/components/PostModal";
import MirageView from "@/components/MirageView";

type FeedState = "normal" | "exiting" | "entering";

export default function Home() {
  const { authenticated, ready } = usePrivy();
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [lightboxPost, setLightboxPost] = useState<any>(null);
  const [mirageActive, setMirageActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showFrame, setShowFrame] = useState(true);
  const [feedState, setFeedState] = useState<FeedState>("normal");
  // Inline comments are one-at-a-time: only one feed post's section is open.
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const transitioningRef = useRef(false);
  const lastScrollY = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);
  // Captured viewport position of the tapped post, so it stays anchored while
  // the feed reflows (another post may collapse above it).
  const anchorRef = useRef<{ id: string; top: number } | null>(null);

  const toggleComments = (postId: string) => {
    const container = feedRef.current;
    const el = container?.querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
    if (el) anchorRef.current = { id: postId, top: el.getBoundingClientRect().top };
    setOpenCommentsPostId((prev) => (prev === postId ? null : postId));
  };

  // Pin the tapped post in place across the 0.32s comment-section reflow. We
  // re-anchor every frame for the animation's duration so any collapse above
  // (one-at-a-time closing a prior post) never shoves the tapped post — no jump.
  useEffect(() => {
    const anchor = anchorRef.current;
    const container = feedRef.current;
    if (!anchor || !container) return;
    anchorRef.current = null;
    let raf = 0;
    const start = performance.now();
    const DURATION = 360; // just past the grid-rows transition
    const pin = () => {
      const el = container.querySelector(`[data-post-id="${anchor.id}"]`) as HTMLElement | null;
      if (el) {
        const delta = el.getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta) > 0.5) container.scrollTop += delta;
      }
      if (performance.now() - start < DURATION) raf = requestAnimationFrame(pin);
    };
    raf = requestAnimationFrame(pin);
    return () => cancelAnimationFrame(raf);
  }, [openCommentsPostId]);

  // Direction-aware red frame — present at rest and on scroll-UP, hidden on
  // scroll-DOWN. Native listener (React's synthetic onScroll misses iOS momentum
  // scroll-up), rAF-throttled, with a small threshold so micro-scrolls don't
  // flicker it. lastScrollY only advances past the threshold, so a continuous
  // gesture reads as one direction instead of thrashing per sub-pixel event.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const THRESHOLD = 6; // px of intent before we act
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = el.scrollTop;
      if (y <= THRESHOLD) {            // at/near the top → always present
        setShowFrame(true);
        lastScrollY.current = y;
        return;
      }
      const delta = y - lastScrollY.current;
      if (Math.abs(delta) < THRESHOLD) return; // below intent → ignore (no flicker)
      setShowFrame(delta < 0);         // up → show, down → hide
      lastScrollY.current = y;
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!authenticated) router.push("/welcome");
  }, [authenticated, router]);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await getAllPosts();
        console.log('First post media_urls:', all[0]?.media_urls);
        if (all.length === 0) {
          setPosts([
            { id: "mock1", username: "creator1",    caption: "Cinematic shot from my latest project", media_urls: [], created_at: new Date().toISOString() },
            { id: "mock2", username: "filmmaker2",   caption: "Ultra-wide landscape composition",      media_urls: [], created_at: new Date().toISOString() },
            { id: "mock3", username: "visualartist", caption: "Experimental grid layout design",       media_urls: [], created_at: new Date().toISOString() },
          ]);
        } else {
          setPosts(all);
        }
      } catch (e) {
        console.error("Error loading posts:", e);
      }
    };
    load();
  }, []);

  const enterMirage = () => {
    if (transitioningRef.current) return;
    console.log("Mirage toggle clicked — current state:", mirageActive);
    transitioningRef.current = true;
    setFeedState("exiting");
    console.log("Animation started");
    setTimeout(() => {
      console.log("Animation complete — switching to grid");
      setMirageActive(true);
      // feedState stays "exiting" — feed items held at opacity 0 under MirageView.
      // exitMirage() transitions them back in when closing.
      transitioningRef.current = false;
    }, 450);
  };

  const exitMirage = () => {
    setMirageActive(false);
    setFeedState("entering");
    setTimeout(() => setFeedState("normal"), 450);
  };

  const getPostAnimStyle = (index: number): React.CSSProperties => {
    const delay = `${Math.min(index, 8) * 30}ms`;
    if (feedState === "exiting") {
      return { animation: `feed-item-out 400ms ease-in ${delay} both` };
    }
    if (feedState === "entering") {
      return { animation: `feed-item-in 350ms ease-out ${delay} both` };
    }
    return {};
  };

  if (!ready || !authenticated) {
    return <div style={{ position: 'fixed', inset: 0, background: '#000000' }} />;
  }

  return (
    <div className="bg-black relative w-[375px] min-h-screen mx-auto">
      <style>{`
        @keyframes feed-item-out {
          from { transform: scale(1)    translateY(0);    opacity: 1; }
          to   { transform: scale(0.85) translateY(-12px); opacity: 0; }
        }
        @keyframes feed-item-in {
          from { transform: scale(0.85) translateY(12px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }
        @keyframes menu-splay-in {
          from { opacity: 0; transform: translateY(-10px) scale(0.88); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Frame icon — top right, opens Mirage menu */}
      <button
        onClick={() => setMenuOpen(v => !v)}
        aria-label="Open menu"
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          lineHeight: 0,
          opacity: menuOpen || !showFrame ? 0 : 1,
          transition: 'opacity 0.42s cubic-bezier(0.16,0.84,0.3,1)',
          pointerEvents: menuOpen || !showFrame ? 'none' : 'auto',
          filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.9)) drop-shadow(0 2px 12px rgba(0,0,0,0.75))',
          zIndex: 20,
        }}
      >
        <svg width="28" height="14" viewBox="0 0 32 16" fill="none">
          <line x1="1" y1="1" x2="1" y2="6" stroke="#FF0000" strokeWidth="1.1"/>
          <line x1="1" y1="1" x2="7" y2="1" stroke="#FF0000" strokeWidth="0.85"/>
          <line x1="31" y1="1" x2="31" y2="6" stroke="#FF0000" strokeWidth="1.1"/>
          <line x1="25" y1="1" x2="31" y2="1" stroke="#FF0000" strokeWidth="0.85"/>
          <line x1="1" y1="15" x2="1" y2="10" stroke="#FF0000" strokeWidth="1.1"/>
          <line x1="1" y1="15" x2="7" y2="15" stroke="#FF0000" strokeWidth="0.85"/>
          <line x1="31" y1="15" x2="31" y2="10" stroke="#FF0000" strokeWidth="1.1"/>
          <line x1="25" y1="15" x2="31" y2="15" stroke="#FF0000" strokeWidth="0.85"/>
        </svg>
      </button>

      {/* Mirage menu — centered overlay, gradient backdrop */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.40) 80%, transparent 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingTop: 8,
          }}
        >
          {/* Matched red set — Mirage + Screening Room sit side by side. */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 34, animation: 'menu-splay-in 260ms cubic-bezier(0.16,1,0.3,1) both' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); enterMirage(); }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: 0,
              }}
            >
              <img
                src="/mirage-logo-thick-red-new.png"
                alt="Mirage"
                style={{
                  width: 30,
                  height: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: '#ffffff', letterSpacing: '-0.16px', textTransform: 'uppercase' }}>
                MIRAGE
              </span>
            </button>

            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); router.push('/screening-room'); }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: 0,
              }}
            >
              <img
                src="/screening-room-logo-temp-01.png"
                alt="Screening Room"
                style={{
                  width: 30,
                  height: 30,
                  objectFit: 'contain',
                  display: 'block',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: '#ffffff', letterSpacing: '-0.16px', textTransform: 'uppercase' }}>
                SCREENING ROOM
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      <div
        ref={feedRef}
        className="absolute left-[2px] right-[2px] top-[30px] bottom-0 overflow-y-auto"
        // @ts-ignore
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ paddingTop: 16, paddingBottom: 60 }}>
          {posts.map((post, index) => (
            <div key={post.id} data-post-id={post.id} style={getPostAnimStyle(index)}>
              <PostItem
                post={post}
                onImageClick={() => setLightboxPost(post)}
                commentsOpen={openCommentsPostId === post.id}
                onToggleComments={() => toggleComments(post.id)}
              />
            </div>
          ))}
        </div>
      </div>

      {lightboxPost && (
        <PostModal
          post={lightboxPost}
          onClose={() => setLightboxPost(null)}
        />
      )}

      {/* Mirage View — mounts as fixed overlay above the feed */}
      {mirageActive && <MirageView onClose={exitMirage} />}
    </div>
  );
}
