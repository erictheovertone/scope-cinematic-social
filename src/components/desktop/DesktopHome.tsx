'use client';
// ── DESKTOP HOME — the 3-across cinematic FEED ───────────────────────────────
// Desktop-only (mounted via the useIsDesktop seam in app/page.tsx; the mobile
// feed is untouched). Real 3-column grid of FULL feed cards — each cell is
// mobile's PostItem (media + @handle + [TICKER] MC + like/comment/collect + the
// First Cut insignia), reused verbatim so NO metadata is dropped and every
// action works inline exactly like mobile. Same getAllPosts service + fields as
// mobile. Media autoplays (living tiles) — this is the FEED, motion belongs.
// Cells at the canonical SCOPE ratio (each post renders its own aspect, as on
// mobile; scope 2.39 is the platform default). Tap media → the home lightbox
// (Part 2; interim = the existing desktop post viewer). ONE logomark total: it
// lives in the rail and opens VIEWING MODES (dispatched here as an event).

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getFeedPage, type FeedCursor } from '@/lib/postsService';
import PostItem from '@/components/PostItem';
import DesktopHomeLightbox from '@/components/desktop/DesktopHomeLightbox';
import DesktopViewingModes, { type ViewingMode } from '@/components/desktop/DesktopViewingModes';
import MirageView from '@/components/MirageView';
import TheatreMode from '@/components/TheatreMode';
import DesktopShell from '@/components/desktop/DesktopShell';
import CreatorSearch from '@/components/desktop/CreatorSearch';
import { useFluidColumns } from '@/lib/useFluidColumns';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function DesktopHome() {
  const router = useRouter();
  const [posts, setPosts] = useState<Record<string, unknown>[] | null>(null);
  const feedCursorRef = useRef<FeedCursor | null>(null); // Brief M13 — keyset cursor
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  const [view, setView] = useState<number | null>(null); // home-feed lightbox
  const [theatreOpen, setTheatreOpen] = useState(false); // theatre on the feed posts
  const [mirageOpen, setMirageOpen] = useState(false); // Brief M15 §3 — desktop Mirage overlay
  // Brief D5 §1 — theatre origin continuity (desktop echo of mobile M3c). Capture the
  // lightbox's open index on entry so theatre STARTS on that post (not index 0), track the
  // index the user ends on, and — when theatre was entered FROM the lightbox — return to
  // the lightbox on that ended post.
  const [theatreStart, setTheatreStart] = useState(0);
  const theatreIdx = useRef(0);
  const theatreFromLightbox = useRef(false);
  const [flash, setFlash] = useState(false); // mode-switch flash-through-black
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null); // the feed's own scroller (body is overflow:hidden)
  // Brief R1a — the masonry GROWS with the window: full feed cards cap at ~500px, columns
  // add beyond the fixed-3 floor. At 1440 this resolves to 3 (the anchor); 1920→4, 2560→5,
  // 3440→7. The ref measures the column row; i % masonryCols keeps the round-robin order.
  const [masonryRef, masonryCols] = useFluidColumns(3, 500);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { posts: first, nextCursor } = await getFeedPage(null);
        if (!alive) return;
        setPosts(first as unknown as Record<string, unknown>[]);
        feedCursorRef.current = nextCursor;
        setHasMore(nextCursor !== null);
      } catch (e) { console.error('[desktop-home] load error:', e); if (alive) setPosts([]); }
    })();
    return () => { alive = false; };
  }, []);

  // The ONE logomark (in the rail) opens viewing modes — the rail dispatches this.
  useEffect(() => {
    const open = () => setModesOpen(true);
    window.addEventListener('scope:open-viewing-modes', open);
    return () => window.removeEventListener('scope:open-viewing-modes', open);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { posts: more, nextCursor } = await getFeedPage(feedCursorRef.current);
      if (more.length > 0) {
        setPosts((prev) => {
          const seen = new Set((prev ?? []).map((p) => p.id as string));
          return [...(prev ?? []), ...(more as unknown as Record<string, unknown>[]).filter((p) => !seen.has(p.id as string))];
        });
      }
      feedCursorRef.current = nextCursor;
      setHasMore(nextCursor !== null);
    } catch (e) { console.error('[desktop-home] loadMore error:', e); }
    finally { setLoadingMore(false); }
  }, [loadingMore, hasMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || view != null) return;
    // root = the feed's own scroller (document scroll is disabled by the shell),
    // so the sentinel fires against the right container as it nears the end.
    const near = Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 1.5); // Brief M13 — ~1.5 viewports
    const io = new IntersectionObserver((es) => { if (es[0]?.isIntersecting) loadMore(); }, { root: scrollRef.current, rootMargin: `${near}px` });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore, view, posts?.length]);

  // ONE mode-switch language: a fast fade-through-black (~180ms, ease-out, opacity
  // only = GPU). reduced-motion → instant. Feels like a cut. The surface swap
  // happens at the black midpoint so it reads as a clean cut, not a dissolve.
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const switchWith = (fn: () => void) => {
    if (reduced) { fn(); return; }
    setFlash(true);
    window.setTimeout(() => { fn(); }, 90);
    window.setTimeout(() => setFlash(false), 190);
  };

  // MODE → SURFACE MAP. Every mode acts (if it reacts, it acts):
  //  feed → the grid · lightbox → the home lightbox · theatre → desktop theatre
  //  on the feed · screening → /screening-room. mirage → COMING (menu-gated).
  const onSelectMode = (mode: ViewingMode) => {
    setModesOpen(false);
    switchWith(() => {
      setTheatreOpen(false);
      if (mode === 'theatre') {
        // Enter on the lightbox's open post (or 0 from the grid); remember the origin.
        const start = view != null ? view : 0;
        theatreFromLightbox.current = view != null;
        theatreIdx.current = start;
        setTheatreStart(start);
        setView(null);
        setTheatreOpen(true);
      }
      else if (mode === 'lightbox') { setTheatreOpen(false); setView((v) => (v == null ? 0 : v)); }
      else if (mode === 'screening') { setView(null); router.push('/screening-room'); }
      else if (mode === 'mirage') { setView(null); setMirageOpen(true); } // Brief M15 §3 — desktop Mirage
      else { setView(null); } // feed → back to the grid
    });
  };

  return (
    // The shell fixes html/body (overflow:hidden) — so the feed needs its OWN
    // full-height scroller, the same fixed/inset-0/overflow-y:auto pattern the
    // desktop profile page uses (cleared past the 71px rail).
    <div ref={scrollRef} className="bg-black" style={{ position: 'fixed', inset: 0, left: 'var(--rail-w)', background: '#000', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <DesktopShell width="fluid" padding="40px 48px 96px">{/* Brief R1a — media surface: fills the window, masonry grows columns */}
        {/* DISCOVER — the page title, top-left of the content column (mobile home's
            title, now on desktop). SK-Modernist Bold, −0.06em, 40px page-title scale. */}
        {/* DISCOVER title + SEARCH control (top-right — same language as the lightbox) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 30px' }}>
          {/* Brief D7 §2 — sentence case (no uppercase transform), house title tier
              (75 Bold, --track-display, --ink-100). Desktop page-title scale 40px. */}
          <h1 style={{ ...SKB, fontSize: 'calc(40px * var(--type-scale))', lineHeight: 0.95, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', margin: 0 }}>Discover</h1>
          {/* Brief D7 §3 — real creator search (was a dead placeholder div). */}
          <CreatorSearch width={160} height={34} />
        </div>
        {posts == null ? (
          <div style={{ minHeight: '40vh' }} />
        ) : posts.length === 0 ? (
          <p style={{ ...SKB, textAlign: 'center', fontSize: 12, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', padding: '80px 0' }}>NOTHING SCREENING YET</p>
        ) : (
          <>
            {/* HOME FEED = the house design: FIXED 3-across, severed from user
                layout settings entirely (AR/counts govern the PROFILE grid only).
                Each cell keeps the POST's OWN authored aspect (mixed heights) —
                that's how a creator's AR intent reaches the feed. No viewer's or
                creator's setting changes the feed's column structure. */}
            {/* MASONRY: 3 independent columns, each packing top-to-bottom with one
                uniform 20px gap (both axes) → tops scatter, no craters from
                row-alignment. ROUND-ROBIN distribution (i % 3) — cheap,
                deterministic (a post's column is fixed by its feed index, so
                load-more appends correctly), and it preserves the left-to-right
                newest-first reading order across the top row. Cards unchanged. */}
            <div ref={masonryRef} style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              {Array.from({ length: masonryCols }, (_, col) => (
                <div key={col} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {posts.map((p, i) => (i % masonryCols === col ? (
                    <PostItem
                      key={String(p.id)}
                      post={p as unknown as React.ComponentProps<typeof PostItem>['post']}
                      onImageClick={() => setView(i)}
                      card
                      clampCaption
                      hoverGrow
                    />
                  ) : null))}
                </div>
              ))}
            </div>
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
          </>
        )}
      </DesktopShell>

      {/* ── HOME FEED LIGHTBOX (overlay) ── */}
      {view != null && posts && posts[view] && (
        <DesktopHomeLightbox posts={posts} index={view} onClose={() => setView(null)} />
      )}

      {modesOpen && (
        <DesktopViewingModes currentMode={theatreOpen ? 'theatre' : view != null ? 'lightbox' : 'feed'} onClose={() => setModesOpen(false)} onSelect={onSelectMode} />
      )}

      {/* Brief M15 §3 — desktop Mirage (the SAME MirageView, desktop layout+input). Fills the
          shell minus the rail; Escape / tap-away dismiss; snippet autoplay under the Mirage budget. */}
      {mirageOpen && <MirageView desktop onClose={() => setMirageOpen(false)} />}

      {/* THEATRE on the feed's posts (desktop theatre — arrows/keyboard; the rail
          stands down via the theatre-mode takeover). */}
      {theatreOpen && posts && posts.length > 0 && (
        <TheatreMode
          posts={posts}
          source="feed"
          startIndex={theatreStart}
          onIndexChange={(i) => { theatreIdx.current = i; }}
          onClose={() => {
            setTheatreOpen(false);
            // Origin continuity: entered from the lightbox → reopen it on the ended-on post;
            // entered from the grid → back to the grid (view stays null).
            if (theatreFromLightbox.current) setView(theatreIdx.current);
          }}
        />
      )}

      {/* MODE-SWITCH FLASH — one language for every switch: cut through black. */}
      {flash && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 320, background: '#000', pointerEvents: 'none', opacity: 1, animation: 'modeFlash 190ms ease-out forwards' }} />
      )}
      <style>{`@keyframes modeFlash { 0%{opacity:0} 32%{opacity:1} 100%{opacity:0} }`}</style>
    </div>
  );
}
