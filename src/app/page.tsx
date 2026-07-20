"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getAllPosts, FEED_PAGE_SIZE } from "@/lib/postsService";
import PostItem from "@/components/PostItem";
import PostModal from "@/components/PostModal";
import MirageView from "@/components/MirageView";
import TheatreMode from "@/components/TheatreMode";
import ViewingModesMenu from "@/components/ViewingModesMenu";
import { useIsDesktop } from "@/lib/useIsDesktop";
import DesktopHome from "@/components/desktop/DesktopHome";
import { AnimatePresence } from "framer-motion";

type FeedState = "normal" | "exiting" | "entering";

// Landing block breathing room (title → first post), px. THE tunable — Eric
// eyeballs this on device.
const LANDING_BREATHING_PX = 40;

export default function Home() {
  const { authenticated, ready } = usePrivy();
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [lightboxPost, setLightboxPost] = useState<any>(null);
  const [mirageActive, setMirageActive] = useState(false);
  const [theatreActive, setTheatreActive] = useState(false); // Theatre Mode over the feed
  const [theatreStart, setTheatreStart] = useState(0);        // entry post (lightbox eye)
  const [menuOpen, setMenuOpen] = useState(false);
  const [triggerPressed, setTriggerPressed] = useState(false); // logomark press-pop
  // TRUE once the landing block has been pushed out — gates the floating
  // trigger so exactly ONE logomark exists at rest (the in-flow one).
  const [pastLanding, setPastLanding] = useState(false);
  const [showFrame, setShowFrame] = useState(true);
  const [feedState, setFeedState] = useState<FeedState>("normal");
  // Inline comments are one-at-a-time: only one feed post's section is open.
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  // Feed pagination — load one page, append more on scroll.
  const [feedPage, setFeedPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);   // guards against double-fire from the sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const transitioningRef = useRef(false);
  const lastScrollY = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);
  // Captured viewport position of the tapped post, so it stays anchored while
  // the feed reflows (another post may collapse above it).
  const anchorRef = useRef<{ id: string; top: number } | null>(null);
  const isDesktop = useIsDesktop();

  // Stable (refs + setState only) so PostItem's memo holds across home re-renders.
  const toggleComments = useCallback((postId: string) => {
    const container = feedRef.current;
    const el = container?.querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
    if (el) anchorRef.current = { id: postId, top: el.getBoundingClientRect().top };
    setOpenCommentsPostId((prev) => (prev === postId ? null : postId));
  }, []);

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
      // Landing gate — piggybacks this existing listener (no new listeners):
      // the floating trigger exists only once the in-flow landing block (which
      // carries its own logomark) has been pushed out.
      setPastLanding(cur > 140);
      if (dy < -THRESHOLD) setShowFrame(true);       // up → reveal
      else if (dy > THRESHOLD) setShowFrame(false);  // down → hide
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  // Belt-and-suspenders for the iOS standalone rubber-band: body{touch-action:none}
  // is NOT fully honored under a position:fixed body (known iOS quirk), so a drag can
  // still pan the whole web view. Two cases handled, axis-aware:
  //  1) Touch OUTSIDE any scroll container (empty/feed chrome) → block any drag.
  //  2) Touch INSIDE the home-feed scroller → allow vertical scroll, but kill a
  //     predominantly HORIZONTAL drag (dx > dy) — that's the sideways visual-viewport
  //     drift pan-y doesn't fully suppress. Scoped to feedRef + body ONLY, so genuine
  //     horizontal scrollers elsewhere (TheaterCarousel, finishing nav rows) are
  //     untouched — a touch inside them is in neither branch.
  // passive:false is required for preventDefault to cancel the native pan.
  useEffect(() => {
    const start = { x: 0, y: 0 };
    const onTouchStart = (e: TouchEvent) => {
      const tch = e.touches[0];
      if (tch) { start.x = tch.clientX; start.y = tch.clientY; }
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const insideScroller = t.closest('[data-scroll], .screen-min, .overflow-y-auto, [style*="overflow"]');
      // Case 1 — static / non-scroll surface: block any drag (rubber-band).
      if (!insideScroller) { e.preventDefault(); return; }
      // Case 2 — inside the vertical home feed: kill horizontal drift, keep vertical.
      const feed = feedRef.current;
      if (feed && feed.contains(t)) {
        const tch = e.touches[0];
        if (tch) {
          const dx = Math.abs(tch.clientX - start.x);
          const dy = Math.abs(tch.clientY - start.y);
          if (dx > dy && dx > 8) e.preventDefault(); // predominantly horizontal → block
        }
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  useEffect(() => {
    // Guard on `ready`: before Privy hydrates, authenticated is false on the first
    // paint — redirecting then bounces to /welcome and STRIPS query params (e.g.
    // ?recap=1). Wait until Privy is ready so we only redirect genuinely-signed-out users.
    if (ready && !authenticated) router.push("/welcome");
  }, [ready, authenticated, router]);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await getAllPosts(0);   // first page only — rest appends on scroll
        if (all.length === 0) {
          setPosts([
            { id: "mock1", username: "creator1",    caption: "Cinematic shot from my latest project", media_urls: [], created_at: new Date().toISOString() },
            { id: "mock2", username: "filmmaker2",   caption: "Ultra-wide landscape composition",      media_urls: [], created_at: new Date().toISOString() },
            { id: "mock3", username: "visualartist", caption: "Experimental grid layout design",       media_urls: [], created_at: new Date().toISOString() },
          ]);
          setHasMore(false);
        } else {
          setPosts(all);
          setHasMore(all.length >= FEED_PAGE_SIZE);   // a short first page = end of feed
        }
      } catch (e) {
        console.error("Error loading posts:", e);
      }
    };
    load();
  }, []);

  // Append the next page. Dedupes by id (page-boundary safety); stops when a page
  // comes back short. Author profiles still batch per page inside getAllPosts.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const next = feedPage + 1;
      const more = await getAllPosts(next);
      if (more.length > 0) {
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...more.filter((p) => !seen.has(p.id))];
        });
        setFeedPage(next);
      }
      if (more.length < FEED_PAGE_SIZE) setHasMore(false);
    } catch (e) {
      console.error("Error loading more posts:", e);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [feedPage, hasMore]);

  // Infinite scroll — a sentinel below the list; when it nears view, fetch the next
  // page. root = the feed scroller; rootMargin prefetches ~1.5 screens early.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;   // posts.length in deps re-runs this once the sentinel mounts
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { root: feedRef.current, rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore, posts.length]);

  // Close: AnimatePresence plays the menu's exit variants on unmount.
  const closeMenu = () => setMenuOpen(false);
  // Mode selection navigates immediately (the overlay leaves with the view).
  const selectDoor = (go: () => void) => { setMenuOpen(false); go(); };

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

  // Desktop seam — the mobile feed below is untouched; DesktopHome owns the
  // desktop surface (3-across scope grid + viewing modes). Hooks above run
  // regardless (React order), matching the profile page's desktop branch.
  if (isDesktop) return <DesktopHome />;

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
      `}</style>

      {/* Frame icon — top-right, opens the home menu. PORTALED to document.body +
          position:fixed so it's pinned to the viewport (the page is the scroller;
          absolute positioning let it scroll off). Reveal is driven by showFrame
          (up-scroll) / menuOpen. */}
      {typeof document !== 'undefined' && createPortal(
        <button
          onClick={() => setMenuOpen(v => !v)}
          onPointerDown={() => setTriggerPressed(true)}
          onPointerUp={() => setTriggerPressed(false)}
          onPointerLeave={() => setTriggerPressed(false)}
          aria-label="Open viewing modes"
          style={{
            position: 'fixed',
            // Clear the status bar under viewport-fit=cover (env=0 on non-notch).
            top: 'calc(6px + env(safe-area-inset-top, 0px))',
            right: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '9px 6px', // ≈44px tap target around the 41×26 mark
            lineHeight: 0,
            opacity: menuOpen || !showFrame || !pastLanding ? 0 : triggerPressed ? 0.75 : 1,
            transform: `${menuOpen || !showFrame || !pastLanding ? 'translateY(-12px)' : 'translateY(0)'}${triggerPressed ? ' scale(0.92)' : ''}`,
            transition: 'opacity 0.25s cubic-bezier(0.16,0.84,0.3,1), transform 0.25s cubic-bezier(0.16,0.84,0.3,1)',
            pointerEvents: menuOpen || !showFrame || !pastLanding ? 'none' : 'auto',
            filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.9)) drop-shadow(0 2px 12px rgba(0,0,0,0.75))',
            zIndex: 50, // above feed (z20), below the menu overlay (z60)
          }}
        >
          {/* The logomark IS the menu trigger (replaces the corner-bracket frame). */}
          <img src="/design-updates-071526/scope-logomark-offwhite.png" alt="" style={{ width: 39, height: 'auto', objectFit: 'contain', display: 'block', filter: 'blur(0.35px)' }} />
        </button>,
        document.body,
      )}

      {/* VIEWING MODES — the full-page menu (Figma 943:406). Selection routes
          through the SAME mode-switch logic the old doors used (selectDoor). */}
      <AnimatePresence>
        {menuOpen && (
          <ViewingModesMenu
            currentMode={theatreActive ? 'theatre' : mirageActive ? 'mirage' : 'feed'}
            onClose={closeMenu}
            onSelect={(mode) => {
              if (mode === 'theatre') selectDoor(() => setTheatreActive(true));
              else if (mode === 'screening') selectDoor(() => router.push('/screening-room'));
              else if (mode === 'mirage') selectDoor(() => enterMirage());
              else closeMenu(); // feed = the mode we're already hosting
            }}
          />
        )}
      </AnimatePresence>

      {/* Top blur feather (IG pattern) — keeps the status bar + floating bracket legible
          over bright edge-to-edge content. backdrop-blur that FEATHERS OUT via a mask
          (strong at the very top, fading to nothing) + a faint dark tint. Deliberate,
          contained blur exception (brand bans blur generally) — scoped ONLY to the
          status-bar feather. Above the feed (z1), below the bracket (z50). */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        maskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%)',
        zIndex: 2, pointerEvents: 'none',
      }} />

      {/* Feed — scroll is captured at document level (native scroll doesn't bubble),
          so no onScroll here. */}
      <div
        ref={feedRef}
        className="overflow-y-auto"
        data-scroll
        // FIXED, not absolute — measured against the VIEWPORT, so its height can't grow
        // to fit content the way `absolute … bottom-0` did against the min-height-only
        // .app-shell/.screen-min ancestor (which had no height ceiling → the scroller
        // grew to scrollHeight === clientHeight and couldn't scroll). top:30/bottom:0 vs
        // the viewport caps it at 100dvh − 30. Centered (max-width 30rem) so the ≥480
        // column stays intact; 2px side padding preserved.
        style={{
          position: 'fixed',
          // Edge-to-edge (IG pattern): content extends to the true top (under the
          // status bar) — was top:30, which left an ugly black bar. The floating frame
          // bracket (portaled, fixed, inset-aware) stays clickable above this; the first
          // post is held below it by the inner content's top padding (next div).
          top: 0, bottom: 0, left: 0, right: 0,
          maxWidth: '30rem', marginInline: 'auto',
          paddingLeft: 2, paddingRight: 2,
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          // Root (html,body) sets touch-action:none to kill the iOS standalone
          // visual-viewport pan; this scroller must opt BACK IN to vertical scroll.
          touchAction: 'pan-y',
          // No horizontal scroll/pan room — removes the sideways drift surface that
          // pan-y alone doesn't fully suppress under the iOS standalone quirk. Clips
          // any residual sub-pixel child overflow so there's nothing to pan sideways.
          overflowX: 'hidden',
          zIndex: 1,
        }}
      >
        {/* Clearance for the floating frosted PILL: bottom 15px + safe-inset, height 38
            → its top is ~53px + inset up. Reserve enough scroll space that the last post
            can rise fully ABOVE the pill (mid-scroll content still flows under the glass). */}
        <div style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>
          {/* ── LANDING BLOCK — IN the scroll flow (the profile-view push):
              scrolling physically pushes mark + DISCOVER + breathing space out
              1:1; back-to-top restores it the same way. It carries the top
              safe-area inset the posts wrapper used to, so once pushed out the
              feed owns the viewport edge-to-edge exactly as before. The
              floating trigger (portaled) is gated OFF until this block is gone
              → exactly ONE logomark at rest. */}
          {/* Brief 2.1 (node 37:65): Discover title LEFT + logomark RIGHT on one row
              (frame: title x10/y16, logomark x326/y11). Both open VIEWING MODES —
              trigger relocates into the row, behavior unchanged. */}
          <div style={{ paddingTop: 'calc(6px + env(safe-area-inset-top, 0px))' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 10px' }}>
              <h1 className="soften-display" style={{
                fontFamily: 'var(--font-display)', fontWeight: 700,
                fontSize: 32, lineHeight: 1, letterSpacing: 'var(--track-display)',
                color: 'var(--ink-100)', margin: '4px 0 0',
              }}>
                Discover
              </h1>
              <button
                onClick={() => setMenuOpen(v => !v)}
                aria-label="Open viewing modes"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 9, margin: -3, lineHeight: 0, filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.9))' }}
              >
                <img src="/design-updates-071526/scope-logomark-offwhite.png" alt="" style={{ width: 39, height: 'auto', objectFit: 'contain', display: 'block', filter: 'blur(0.35px)' }} />
              </button>
            </div>
            {/* BREATHING SPACE — the one tunable (Eric eyeballs on device). */}
            <div style={{ height: LANDING_BREATHING_PX }} />
          </div>
          {posts.map((post, index) => (
            <div key={post.id} data-post-id={post.id} style={getPostAnimStyle(index)}>
              <PostItem
                post={post}
                onImageClick={setLightboxPost}
                commentsOpen={openCommentsPostId === post.id}
                onToggleComments={toggleComments}
                clampCaption
                priority={index < 3}
              />
            </div>
          ))}
          {/* Infinite-scroll sentinel + subtle bottom loader (hidden at end of feed). */}
          {hasMore && posts.length > 0 && (
            <div ref={sentinelRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {loadingMore && (
                <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.35)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>LOADING…</span>
              )}
            </div>
          )}
        </div>
      </div>

      {lightboxPost && (
        <PostModal
          post={lightboxPost}
          onClose={() => setLightboxPost(null)}
          onTheaterMode={() => {
            // Enter theatre AT this post; exit returns here (feed untouched).
            const i = posts.findIndex((p) => p.id === (lightboxPost as { id?: string }).id);
            setTheatreStart(Math.max(0, i));
            setLightboxPost(null);
            setTheatreActive(true);
          }}
        />
      )}

      {/* Mirage View — mounts as fixed overlay above the feed */}
      {mirageActive && <MirageView onClose={exitMirage} />}

      {/* Theatre Mode over the FEED's posts (feed order). Same component as the
          profile eye-icon entry — just sourced from the feed. */}
      {theatreActive && <TheatreMode posts={posts} source="feed" startIndex={theatreStart} onClose={() => { setTheatreActive(false); setTheatreStart(0); }} />}
    </div>
  );
}
