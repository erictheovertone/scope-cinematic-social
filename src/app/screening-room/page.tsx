'use client';
// ── Screening Room (B1 layout) ───────────────────────────────────────────────
//
// The platform's top-50 most-VALUABLE posts (by market cap), reached from the
// home-feed header menu. Reads PURELY from the `screening_room` cache that the
// Step 1 cron populates every 6h — NO per-load Zora calls. Each row: a wide
// 2.39:1 cinematic frame (rank chip the only overlay) with a data shelf beneath
// — ticker/creator left, market cap as the focal USD number right. Tapping a row
// opens that post via the shared post lightbox.
//
// Design: pure black, #E5E1DB, SK-Modernist, sharp corners, no shadows/blur.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { openPostLightbox } from '@/lib/postLightbox';
import { getAspectRatio, ratioPadding } from '@/lib/aspectRatio';
import PillarboxFrame from '@/components/PillarboxFrame';
import GradedVideo from '@/components/finishing/GradedVideo';
import { useIsDesktop } from '@/lib/useIsDesktop';
import DesktopScreeningRoom from '@/components/desktop/DesktopScreeningRoom';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

// Legible worth at a glance: "$1,240", "$0.42" for sub-dollar, "—" when unknown.
const usdMc = (n: number | null | undefined): string => {
  if (n == null || !isFinite(n) || n <= 0) return '—';
  return n >= 1 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;
};

interface RoomRow {
  rank: number;
  coin_address: string;
  symbol: string | null;
  market_cap: number | null;
  post: {
    id: string;
    username: string | null;
    ticker: string | null;
    layout_id: string | null;
    media_type: string | null;
    poster_url: string | null;
    thumbnail_url: string | null;
    media_urls: string[] | null;
    autoplay_clip_url: string | null;
    autoplay: boolean | null;
    crop_x: number | null;
    crop_y: number | null;
    crop_width: number | null;
    crop_height: number | null;
  } | null;
}

// Thin gate: desktop → the Figma 56:2 showcase; mobile → the B1 list. Only
// useIsDesktop runs here, so the mobile hooks never run on desktop (and vice-versa).
export default function ScreeningRoomPage() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <DesktopScreeningRoom />;
  return <MobileScreeningRoom />;
}

function MobileScreeningRoom() {
  const router = useRouter();
  const [rows, setRows] = useState<RoomRow[] | null>(null); // null = loading
  // Reduced-motion → the tiles stay static posters (the pre-live behavior).
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(m.matches);
    sync();
    m.addEventListener?.('change', sync);
    return () => m.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // ON-DEMAND refresh-on-view: after rendering the cache below, ask the server to
    // recompute IF stale. Non-awaited (fire-and-forget) so it never blocks the view;
    // the route is self-throttling (staleness + single-flight lock) so a burst of
    // viewers triggers at most ONE recompute. The fresh ranking shows on the next view.
    fetch('/api/screening-room/refresh', { method: 'POST', keepalive: true }).catch(() => {});

    (async () => {
      // 1. The ranked cache (cheap read; the cron / on-demand refresh did the work).
      const { data: cache } = await supabase
        .from('screening_room')
        .select('rank, coin_address, symbol, market_cap')
        .order('rank', { ascending: true });
      if (!cache?.length) { if (!cancelled) setRows([]); return; }

      // 2. Join the posts (media/handle/ticker) by coin_address — one query.
      const addrs = cache.map((c) => c.coin_address).filter(Boolean);
      const { data: posts } = await supabase
        .from('posts')
        .select('id, coin_address, username, ticker, layout_id, media_type, poster_url, thumbnail_url, media_urls, autoplay_clip_url, autoplay, crop_x, crop_y, crop_width, crop_height')
        .in('coin_address', addrs);
      const byAddr = new Map((posts ?? []).map((p) => [String(p.coin_address).toLowerCase(), p]));

      const merged: RoomRow[] = cache.map((c) => ({
        rank: c.rank,
        coin_address: c.coin_address,
        symbol: c.symbol,
        market_cap: c.market_cap,
        post: (byAddr.get(String(c.coin_address).toLowerCase()) as RoomRow['post']) ?? null,
      }));
      if (!cancelled) setRows(merged);
    })().catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, []);

  const mediaSrc = (p: NonNullable<RoomRow['post']>): string | null =>
    p.media_type === 'video' ? (p.poster_url || p.thumbnail_url || null) : (p.media_urls?.[0] || null);

  return (
    <div className="screen-min" style={{ minHeight: '100dvh', background: '#000', maxWidth: '30rem', margin: '0 auto', position: 'relative' }}>
      {/* Header — Brief F1: top pad clears the notch. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(16px + var(--safe-top)) 16px 12px' }}>
        <button
          onClick={() => router.back()}
          aria-label="Back"
          style={{ background: 'transparent', border: 'none', color: '#E5E1DB', cursor: 'pointer', fontSize: 'var(--fs-18)', padding: '0 6px 0 0', lineHeight: 1 }}
        >
          ‹
        </button>
        <img src="/screening-room-logo-temp-01.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain', display: 'block' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-13)', color: '#E5E1DB', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Screening Room</span>
          <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
            Top 50 · market cap · refreshed 6h
          </span>
        </div>
      </div>

      {/* Loading */}
      {rows === null && (
        <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.4)', textAlign: 'center', padding: '60px 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Assembling the room…
        </p>
      )}

      {/* Empty / stale cache — graceful, never a broken list. */}
      {rows !== null && rows.length === 0 && (
        <div style={{ padding: '70px 24px', textAlign: 'center' }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', letterSpacing: '0.16em', textTransform: 'uppercase', margin: '0 0 8px' }}>The room is empty</p>
          <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.45)', lineHeight: 1.6, margin: 0 }}>
            The top 50 are assembled every 6 hours. Check back shortly.
          </p>
        </div>
      )}

      {/* The list */}
      {rows !== null && rows.length > 0 && (
        <div style={{ padding: '4px 12px 60px' }}>
          {rows.map((r) => {
            const p = r.post;
            const src = p ? mediaSrc(p) : null;
            const tickerMark = (p?.ticker || r.symbol) ? `[ ${p?.ticker || r.symbol} ]` : null;
            // Each post shows in ITS OWN aspect ratio (post.layout_id), exactly as
            // the home feed sizes it — never a forced 2.39:1. Wide ratios (PANA
            // 2.75 / SCOPE 2.39 / CINE 1.85) fill the row via ratioPadding; LEGACY
            // 4:3 is PILLARBOXED in PillarboxFrame (the SAME component the feed/
            // Mirage/lightbox use — black side bars, centered, never stretched).
            const is43 = (p?.layout_id ?? '') === 'legacy';
            const paddingPercent = ratioPadding(getAspectRatio(p?.layout_id ?? ''));
            // LIVING TILE — video posts breathe like the feed/grid tiles: the
            // baked muted clip via GradedVideo's OWN gridMode gating (its
            // observer mounts the <video> in-view, unmounts on scroll-away →
            // decoder freed, off-screen transfers nothing; poster until ready).
            // Image posts + reduced-motion + clip-less videos: the static
            // poster exactly as before. Same box — the row design is untouched.
            const media = p && p.media_type === 'video' && p.autoplay_clip_url && !reducedMotion ? (
              <GradedVideo
                url={p.media_urls?.[0] ?? ''}
                posterUrl={p.poster_url ?? p.thumbnail_url}
                posterWidth={750}
                clipUrl={p.autoplay_clip_url}
                cropX={p.crop_x ?? 0} cropY={p.crop_y ?? 0} cropWidth={p.crop_width ?? 1} cropHeight={p.crop_height ?? 1}
                autoplayFlag={p.autoplay !== false}
                gridMode
                style={{ width: '100%', height: '100%' }}
              />
            ) : src ? (
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: '#111' }} />
            );
            // Rank chip — top-left of the frame, regardless of ratio (in the outer
            // container for legacy, matching how the feed places its overlays).
            const rankChip = (
              <div style={{ position: 'absolute', top: 0, left: 0, background: '#E5E1DB', padding: '2px 7px', zIndex: 10 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#000', letterSpacing: '0.04em' }}>{r.rank}</span>
              </div>
            );
            return (
              <div
                key={r.rank}
                onClick={() => p && openPostLightbox(p.id)}
                style={{ marginBottom: 22, cursor: p ? 'pointer' : 'default' }}
              >
                {/* Frame at the post's OWN ratio — media only, rank chip the sole overlay. */}
                {is43 ? (
                  <PillarboxFrame overlays={rankChip}>{media}</PillarboxFrame>
                ) : (
                  <div style={{ position: 'relative', width: '100%', paddingTop: `${paddingPercent}%`, overflow: 'hidden', background: '#0A0A0A' }}>
                    <div style={{ position: 'absolute', inset: 0 }}>{media}</div>
                    {rankChip}
                  </div>
                )}

                {/* Data shelf BENEATH — ticker/creator left, market cap right (focal). */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '8px 2px 0', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {tickerMark && (
                      <div style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', letterSpacing: '0.08em', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tickerMark}
                      </div>
                    )}
                    {p?.username && (
                      <div style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        @{p.username}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...SKB, fontSize: 'var(--fs-18)', color: '#E5E1DB', lineHeight: 1 }}>{usdMc(r.market_cap)}</div>
                    <div style={{ ...SKR, fontSize: 'var(--fs-7)', color: '#E5E1DB', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 3 }}>Market Cap</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
