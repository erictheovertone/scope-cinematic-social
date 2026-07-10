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

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RAIL_W = 71; // clear the global left rail

export default function DesktopHome() {
  const router = useRouter();
  const [posts, setPosts] = useState<Record<string, unknown>[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  const [view, setView] = useState<number | null>(null); // interim lightbox (Part 2 replaces)
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

  const onSelectMode = (mode: ViewingMode) => {
    setModesOpen(false);
    if (mode === 'screening') router.push('/screening-room');
    // feed = current; theatre/mirage/lightbox wired in the broader modes feature.
  };

  return (
    // The shell fixes html/body (overflow:hidden) — so the feed needs its OWN
    // full-height scroller, the same fixed/inset-0/overflow-y:auto pattern the
    // desktop profile page uses (cleared past the 71px rail).
    <div ref={scrollRef} className="bg-black" style={{ position: 'fixed', inset: 0, left: RAIL_W, background: '#000', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '40px 48px 96px' }}>
        {/* DISCOVER — the page title, top-left of the content column (mobile home's
            title, now on desktop). SK-Modernist Bold, −0.06em, 40px page-title scale. */}
        <h1 style={{ ...SKB, fontSize: 40, lineHeight: 0.95, letterSpacing: '-0.06em', color: '#FFF', textTransform: 'uppercase', margin: '0 0 30px' }}>Discover</h1>
        {posts == null ? (
          <div style={{ minHeight: '40vh' }} />
        ) : posts.length === 0 ? (
          <p style={{ ...SKB, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', padding: '80px 0' }}>NOTHING SCREENING YET</p>
        ) : (
          <>
            {/* HOME FEED = the house design: FIXED 3-across, severed from user
                layout settings entirely (AR/counts govern the PROFILE grid only).
                Each cell keeps the POST's OWN authored aspect (mixed heights) —
                that's how a creator's AR intent reaches the feed. No viewer's or
                creator's setting changes the feed's column structure. */}
            {/* Cards on black: each post in a #030303/#2B2B2B card. With borders
                visible the gutters tighten to 20px (was 34) for an organized grid. */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, minmax(0, 1fr))`, gap: 20, alignItems: 'start' }}>
              {posts.map((p, i) => (
                <PostItem
                  key={String(p.id)}
                  post={p as unknown as React.ComponentProps<typeof PostItem>['post']}
                  onImageClick={() => setView(i)}
                  card
                  clampCaption
                />
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
        <DesktopViewingModes currentMode="feed" onClose={() => setModesOpen(false)} onSelect={onSelectMode} />
      )}
    </div>
  );
}
