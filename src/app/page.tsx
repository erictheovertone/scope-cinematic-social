"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { getAllPosts } from "@/lib/postsService";
import PostItem from "@/components/PostItem";
import PostModal from "@/components/PostModal";
import MirageView from "@/components/MirageView";
import TheatreMode from "@/components/TheatreMode";

type FeedState = "normal" | "exiting" | "entering";

export default function Home() {
  const { authenticated, ready } = usePrivy();
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [lightboxPost, setLightboxPost] = useState<any>(null);
  const [mirageActive, setMirageActive] = useState(false);
  const [theatreActive, setTheatreActive] = useState(false); // Theatre Mode over the feed
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false); // playing the close fade
  const [reduceMotion, setReduceMotion] = useState(false);
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

  // Direction-aware red frame — ANY upward scroll reveals it (regardless of position);
  // downward hides it.
  //
  // ROOT CAUSE of the prior failures (proven by the overlay reading evt:0):
  //  1) useEffect([]) + `if(!feedRef.current) return` bailed during the auth loading
  //     screen and never rebound; THEN
  //  2) the onScroll PROP bound to the feed div — but native `scroll` events DON'T
  //     bubble, so binding to a node that isn't the true scroller never fires.
  // FIX (one mechanism for both): a CAPTURE-phase listener on `document`. Capture
  // travels top-down and doesn't depend on bubbling, so it catches the scroll from
  // WHATEVER element actually scrolls; and `document` always exists → no mount race.
  useEffect(() => {
    const THRESHOLD = 4; // px of intent (absorbs jitter / iOS bounce)
    let last = 0;
    const onScroll = (e: Event) => {
      const t = e.target as (Document | HTMLElement);
      const el: HTMLElement | null =
        (t === document || t === document.documentElement)
          ? (document.scrollingElement as HTMLElement | null)
          : (t as HTMLElement);
      const cur = el && typeof el.scrollTop === 'number' ? el.scrollTop : window.scrollY;
      const dy = cur - last;
      last = cur;
      if (dy < -THRESHOLD) setShowFrame(true);       // up → reveal
      else if (dy > THRESHOLD) setShowFrame(false);  // down → hide
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
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

  // Respect prefers-reduced-motion (JS, not a CSS !important — so it can't fight
  // the close fade): reduced → doors fade in place, no stagger/rise.
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(m.matches);
    sync();
    m.addEventListener?.('change', sync);
    return () => m.removeEventListener?.('change', sync);
  }, []);

  // Close the overlay with a quick fade-out, then unmount.
  const closeMenu = () => {
    if (menuClosing) return;
    setMenuClosing(true);
    setTimeout(() => { setMenuOpen(false); setMenuClosing(false); }, 250);
  };
  // Door selection navigates immediately (the overlay leaves with the view).
  const selectDoor = (go: () => void) => { setMenuOpen(false); setMenuClosing(false); go(); };

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
    <div className="bg-black relative app-shell screen-min">
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
        /* Home-feed menu overlay — "Fade + Staggered Rise" (GPU: opacity/transform). */
        @keyframes menuBackingIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes menuDoorRise  { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes menuChromeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes menuFadeOut   { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {/* Frame icon — top-right, opens the home menu. PORTALED to document.body +
          position:fixed so it's pinned to the viewport (the page is the scroller;
          absolute positioning let it scroll off). Reveal is driven by showFrame
          (up-scroll) / menuOpen. */}
      {typeof document !== 'undefined' && createPortal(
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Open menu"
          style={{
            position: 'fixed',
            top: 6,
            right: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            lineHeight: 0,
            opacity: menuOpen || !showFrame ? 0 : 1,
            transform: menuOpen || !showFrame ? 'translateY(-12px)' : 'translateY(0)',
            transition: 'opacity 0.25s cubic-bezier(0.16,0.84,0.3,1), transform 0.25s cubic-bezier(0.16,0.84,0.3,1)',
            pointerEvents: menuOpen || !showFrame ? 'none' : 'auto',
            filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.9)) drop-shadow(0 2px 12px rgba(0,0,0,0.75))',
            zIndex: 50, // above feed (z20), below the menu overlay (z60)
          }}
        >
          {/* Aperture corner-brackets — bolder + larger so it reads clearly on black. */}
          <svg width="34" height="21" viewBox="0 0 34 21" fill="none">
            <line x1="1.3" y1="1.3" x2="1.3" y2="9"  stroke="#FF0000" strokeWidth="2.3"/>
            <line x1="1.3" y1="1.3" x2="9"  y2="1.3" stroke="#FF0000" strokeWidth="2.3"/>
            <line x1="32.7" y1="1.3" x2="32.7" y2="9"  stroke="#FF0000" strokeWidth="2.3"/>
            <line x1="32.7" y1="1.3" x2="25" y2="1.3" stroke="#FF0000" strokeWidth="2.3"/>
            <line x1="1.3" y1="19.7" x2="1.3" y2="12" stroke="#FF0000" strokeWidth="2.3"/>
            <line x1="1.3" y1="19.7" x2="9"  y2="19.7" stroke="#FF0000" strokeWidth="2.3"/>
            <line x1="32.7" y1="19.7" x2="32.7" y2="12" stroke="#FF0000" strokeWidth="2.3"/>
            <line x1="32.7" y1="19.7" x2="25" y2="19.7" stroke="#FF0000" strokeWidth="2.3"/>
          </svg>
        </button>,
        document.body,
      )}

      {/* Home-feed menu — bold full-screen overlay: two typographic "doors". */}
      {menuOpen && (
        <div
          onClick={closeMenu}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            // ~90% black backing with a FEATHERED bottom edge — fades to fully
            // transparent so it melts into the live feed below (no hard line).
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.93) 0%, rgba(0,0,0,0.93) 48%, rgba(0,0,0,0.72) 70%, rgba(0,0,0,0.3) 86%, rgba(0,0,0,0) 100%)',
            animation: menuClosing ? 'menuFadeOut 0.25s ease both' : 'menuBackingIn 0.4s cubic-bezier(0.16,0.84,0.3,1) both',
          }}
        >
          {/* X close — top-left per the design. Chrome fades in last. */}
          <button
            onClick={e => { e.stopPropagation(); closeMenu(); }}
            aria-label="Close menu"
            style={{
              position: 'absolute', top: 14, left: 14,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#FFFFFF', fontSize: 'var(--fs-24)', lineHeight: 1, padding: 8,
              fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700,
              animation: menuClosing ? 'menuFadeOut 0.2s ease both' : 'menuChromeIn 0.3s ease 0.38s both',
            }}
          >
            ✕
          </button>

          {/* Three doors — stacked, oversized, dominant. Top→bottom: THEATRE MODE
              · SCREENING ROOM · MIRAGE VIEW, staggered rise (0.08 / 0.18 / 0.28). */}
          <div style={{ position: 'absolute', top: '22vh', left: 0, right: 0, padding: '0 26px', display: 'flex', flexDirection: 'column', gap: 36 }}>
            {/* Door 1 — THEATRE MODE (rises ~0.08s in) → Theatre Mode over the feed. */}
            <button
              onClick={e => { e.stopPropagation(); selectDoor(() => setTheatreActive(true)); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, textAlign: 'left',
                animation: menuClosing
                  ? 'menuFadeOut 0.22s ease both'
                  : reduceMotion
                    ? 'menuBackingIn 0.3s ease both'
                    : 'menuDoorRise 0.55s cubic-bezier(0.16,0.84,0.3,1) 0.08s both',
              }}
            >
              <span style={{ flex: '1 1 auto', minWidth: 0, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'clamp(36px, 13vw, 56px)', lineHeight: 0.92, letterSpacing: '-0.03em', color: '#FFFFFF', textTransform: 'uppercase' }}>
                Theatre Mode
              </span>
              <img src="/theatre-mode-logo-new-red-lg.png" alt="" style={{ width: 50, height: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            </button>

            {/* Door 2 — SCREENING ROOM (rises ~0.18s in). */}
            <button
              onClick={e => { e.stopPropagation(); selectDoor(() => router.push('/screening-room')); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, textAlign: 'left',
                animation: menuClosing
                  ? 'menuFadeOut 0.22s ease both'
                  : reduceMotion
                    ? 'menuBackingIn 0.3s ease both'
                    : 'menuDoorRise 0.55s cubic-bezier(0.16,0.84,0.3,1) 0.18s both',
              }}
            >
              <span style={{ flex: '1 1 auto', minWidth: 0, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'clamp(36px, 13vw, 56px)', lineHeight: 0.92, letterSpacing: '-0.03em', color: '#FFFFFF', textTransform: 'uppercase' }}>
                Screening Room
              </span>
              <img src="/screening-room-logo-temp-01.png" alt="" style={{ width: 56, height: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            </button>

            {/* Door 3 — MIRAGE VIEW (rises ~0.28s in). */}
            <button
              onClick={e => { e.stopPropagation(); selectDoor(() => enterMirage()); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, textAlign: 'left',
                animation: menuClosing
                  ? 'menuFadeOut 0.22s ease both'
                  : reduceMotion
                    ? 'menuBackingIn 0.3s ease both'
                    : 'menuDoorRise 0.55s cubic-bezier(0.16,0.84,0.3,1) 0.28s both',
              }}
            >
              <span style={{ flex: '1 1 auto', minWidth: 0, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'clamp(36px, 13vw, 56px)', lineHeight: 0.92, letterSpacing: '-0.03em', color: '#FFFFFF', textTransform: 'uppercase' }}>
                Mirage View
              </span>
              <img src="/mirage-logo-thick-red-new.png" alt="" style={{ width: 48, height: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            </button>
          </div>
        </div>
      )}

      {/* Feed — scroll is captured at document level (native scroll doesn't bubble),
          so no onScroll here. */}
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

      {/* Theatre Mode over the FEED's posts (feed order). Same component as the
          profile eye-icon entry — just sourced from the feed. */}
      {theatreActive && <TheatreMode posts={posts} source="feed" onClose={() => setTheatreActive(false)} />}
    </div>
  );
}
