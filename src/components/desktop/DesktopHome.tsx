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
import DesktopPostView from '@/components/desktop/DesktopPostView';
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
    const io = new IntersectionObserver((es) => { if (es[0]?.isIntersecting) loadMore(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore, view, posts?.length]);

  // Interim viewer keyboard: Esc → back to grid, arrows → step.
  useEffect(() => {
    if (view == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView(null);
      else if (e.key === 'ArrowRight') setView((i) => (i != null && i < (posts?.length ?? 0) - 1 ? i + 1 : i));
      else if (e.key === 'ArrowLeft') setView((i) => (i != null && i > 0 ? i - 1 : i));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, posts?.length]);

  const onSelectMode = (mode: ViewingMode) => {
    setModesOpen(false);
    if (mode === 'screening') router.push('/screening-room');
    // feed = current; theatre/mirage/lightbox wired in the broader modes feature.
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#000', paddingLeft: RAIL_W }}>
      {view == null ? (
        // ── THE GRID: real 3-across, full feed cards, generous gutters ──
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '40px 48px 96px' }}>
          {posts == null ? (
            <div style={{ minHeight: '40vh' }} />
          ) : posts.length === 0 ? (
            <p style={{ ...SKB, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', padding: '80px 0' }}>NOTHING SCREENING YET</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 34, alignItems: 'start' }}>
                {posts.map((p, i) => (
                  <PostItem
                    key={String(p.id)}
                    post={p as unknown as React.ComponentProps<typeof PostItem>['post']}
                    onImageClick={() => setView(i)}
                  />
                ))}
              </div>
              {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            </>
          )}
        </div>
      ) : (
        // ── INTERIM VIEWER (Part 2 = the real home lightbox) ──
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 40px 0' }}>
          <button onClick={() => setView(null)} style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0 12px' }}>← BACK</button>
          {posts && posts[view] && (
            <DesktopPostView
              posts={posts}
              index={view}
              onStep={(dir) => setView((i) => { if (i == null) return i; const n = i + dir; return n < 0 || n >= (posts?.length ?? 0) ? i : n; })}
              location={null}
            />
          )}
        </div>
      )}

      {modesOpen && (
        <DesktopViewingModes currentMode="feed" onClose={() => setModesOpen(false)} onSelect={onSelectMode} />
      )}
    </div>
  );
}
