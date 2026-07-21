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
import { getAllPosts, FEED_PAGE_SIZE } from '@/lib/postsService';
import PostItem from '@/components/PostItem';
import DesktopHomeLightbox from '@/components/desktop/DesktopHomeLightbox';
import DesktopViewingModes, { type ViewingMode } from '@/components/desktop/DesktopViewingModes';
import TheatreMode from '@/components/TheatreMode';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RAIL_W = 71; // clear the global left rail

export default function DesktopHome() {
  const router = useRouter();
  const [posts, setPosts] = useState<Record<string, unknown>[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  const [view, setView] = useState<number | null>(null); // home-feed lightbox
  const [theatreOpen, setTheatreOpen] = useState(false); // theatre on the feed posts
  const [flash, setFlash] = useState(false); // mode-switch flash-through-black
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null); // the feed's own scroller (body is overflow:hidden)

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const first = await getAllPosts(0);
        if (!alive) return;
        setPosts(first as unknown as Record<string, unknown>[]);
        setHasMore(first.length >= FEED_PAGE_SIZE);
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
      const next = page + 1;
      const more = await getAllPosts(next);
      setPosts((prev) => [...(prev ?? []), ...(more as unknown as Record<string, unknown>[])]);
      setPage(next);
      setHasMore(more.length >= FEED_PAGE_SIZE);
    } catch (e) { console.error('[desktop-home] loadMore error:', e); }
    finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, page]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || view != null) return;
    // root = the feed's own scroller (document scroll is disabled by the shell),
    // so the sentinel fires against the right container as it nears the end.
    const io = new IntersectionObserver((es) => { if (es[0]?.isIntersecting) loadMore(); }, { root: scrollRef.current, rootMargin: '600px' });
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
      if (mode === 'theatre') { setView(null); setTheatreOpen(true); }
      else if (mode === 'lightbox') { setTheatreOpen(false); setView((v) => (v == null ? 0 : v)); }
      else if (mode === 'screening') { setView(null); router.push('/screening-room'); }
      else { setView(null); } // feed → back to the grid
    });
  };

  return (
    // The shell fixes html/body (overflow:hidden) — so the feed needs its OWN
    // full-height scroller, the same fixed/inset-0/overflow-y:auto pattern the
    // desktop profile page uses (cleared past the 71px rail).
    <div ref={scrollRef} className="bg-black" style={{ position: 'fixed', inset: 0, left: RAIL_W, background: '#000', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '40px 48px 96px' }}>
        {/* DISCOVER — the page title, top-left of the content column (mobile home's
            title, now on desktop). SK-Modernist Bold, −0.06em, 40px page-title scale. */}
        {/* DISCOVER title + SEARCH control (top-right — same language as the lightbox) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 30px' }}>
          <h1 style={{ ...SKB, fontSize: 40, lineHeight: 0.95, letterSpacing: '-0.06em', color: '#E5E1DB', textTransform: 'uppercase', margin: 0 }}>Discover</h1>
          <div style={{ width: 160, height: 34, border: '0.5px solid rgba(229,225,219,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0 }}>
            <span style={{ ...SKB, fontSize: 11, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>SEARCH</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.5)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" strokeLinecap="round"/></svg>
          </div>
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
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              {([0, 1, 2] as const).map((col) => (
                <div key={col} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {posts.map((p, i) => (i % 3 === col ? (
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
      </div>

      {/* ── HOME FEED LIGHTBOX (overlay) ── */}
      {view != null && posts && posts[view] && (
        <DesktopHomeLightbox posts={posts} index={view} onClose={() => setView(null)} />
      )}

      {modesOpen && (
        <DesktopViewingModes currentMode={theatreOpen ? 'theatre' : view != null ? 'lightbox' : 'feed'} onClose={() => setModesOpen(false)} onSelect={onSelectMode} />
      )}

      {/* THEATRE on the feed's posts (desktop theatre — arrows/keyboard; the rail
          stands down via the theatre-mode takeover). */}
      {theatreOpen && posts && posts.length > 0 && (
        <TheatreMode posts={posts} source="feed" onClose={() => setTheatreOpen(false)} />
      )}

      {/* MODE-SWITCH FLASH — one language for every switch: cut through black. */}
      {flash && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 320, background: '#000', pointerEvents: 'none', opacity: 1, animation: 'modeFlash 190ms ease-out forwards' }} />
      )}
      <style>{`@keyframes modeFlash { 0%{opacity:0} 32%{opacity:1} 100%{opacity:0} }`}</style>
    </div>
  );
}
