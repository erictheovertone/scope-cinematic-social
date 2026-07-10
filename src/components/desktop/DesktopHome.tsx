'use client';
// ── DESKTOP HOME — the clean 3-across cinematic grid ─────────────────────────
// Desktop-only (mounted via the useIsDesktop seam in app/page.tsx; mobile feed
// untouched). Three posts across at the canonical SCOPE ratio (2.39:1), generous
// gutters, scrollable. The grid's only job is to INVITE the lightbox — so it's
// quiet, not busy. The Scope logomark opens VIEWING MODES ("choose your
// perspective"). Cell tap → the home lightbox (Part 2); Part 1 uses the existing
// desktop post viewer as an interim view-swap (← BACK returns to the grid).

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getAllPosts, FEED_PAGE_SIZE } from '@/lib/postsService';
import { feedImage } from '@/lib/mediaUrl';
import { chipFor } from '@/lib/desktopLayout';
import GradedVideo from '@/components/finishing/GradedVideo';
import DesktopPostView from '@/components/desktop/DesktopPostView';
import DesktopViewingModes, { type ViewingMode } from '@/components/desktop/DesktopViewingModes';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RAIL_W = 71;                 // clear the global left rail
const SCOPE_RATIO = chipFor('scope').ratio; // 2.39 — canonical cinematic ratio

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
      {/* ── HEADER: the logomark IS the VIEWING MODES trigger ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'center', padding: '22px 0 18px', background: 'linear-gradient(#000 72%, rgba(0,0,0,0))' }}>
        <button onClick={() => setModesOpen(true)} aria-label="Viewing modes — choose your perspective" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, lineHeight: 0 }}>
          <img src="/logomark-plain-white.png" alt="Scope — viewing modes" style={{ width: 46, height: 29, objectFit: 'contain', display: 'block' }} />
        </button>
      </div>

      {view == null ? (
        // ── THE GRID: 3-across, SCOPE 2.39, generous gutters, quiet ──
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '10px 48px 96px' }}>
          {posts == null ? (
            <div style={{ minHeight: '40vh' }} />
          ) : posts.length === 0 ? (
            <p style={{ ...SKB, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', padding: '80px 0' }}>NOTHING SCREENING YET</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26 }}>
                {posts.map((p, i) => {
                  const src = (p.poster_url as string) || (p.thumbnail_url as string) || ((p.media_urls as string[])?.[0] ?? '');
                  return (
                    <button
                      key={String(p.id)}
                      onClick={() => setView(i)}
                      aria-label="Open"
                      style={{ position: 'relative', aspectRatio: `${SCOPE_RATIO}`, overflow: 'hidden', background: '#0d0d0d', border: 'none', cursor: 'pointer', padding: 0, display: 'block' }}
                    >
                      {p.media_type === 'video' ? (
                        <GradedVideo
                          url={(p.media_urls as string[])?.[0] ?? ''}
                          posterUrl={src || null}
                          clipUrl={(p.autoplay_clip_url as string) ?? null}
                          editParams={p.edit_params}
                          autoplayFlag={p.autoplay !== false}
                          gridMode
                          cropX={(p.crop_x as number) ?? 0}
                          cropY={(p.crop_y as number) ?? 0}
                          cropWidth={(p.crop_width as number) ?? 1}
                          cropHeight={(p.crop_height as number) ?? 1}
                          style={{ width: '100%', height: '100%' }}
                        />
                      ) : (
                        src && <img src={feedImage(src, 700)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      )}
                    </button>
                  );
                })}
              </div>
              {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            </>
          )}
        </div>
      ) : (
        // ── INTERIM VIEWER (Part 2 = the real home lightbox) ──
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px' }}>
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
