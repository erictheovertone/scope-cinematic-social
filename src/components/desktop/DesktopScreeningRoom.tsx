'use client';

// ── DesktopScreeningRoom (Figma 56:2) — the top-50 showcase ───────────────────
//
// Presentation over the SAME ranking source the mobile Screening Room + SRH badge
// use: the `screening_room` cache table (written by recomputeScreeningRoom every 6h,
// read here + joined to posts by coin_address). A fixed letterbox STAGE screens the
// current selection (default rank 01); the LINEUP rail scrolls the full 50; tapping a
// cell (or ←/→) swaps the stage in place with a snappy crossfade. Sits behind the
// 71px rail. All entries are minted-by-definition (ranked by MC) — the dash guard is
// kept anyway.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getAspectRatio } from '@/lib/aspectRatio';
import { feedImage } from '@/lib/mediaUrl';
import { getPostLikes, getPostComments } from '@/lib/postsService';
import GradedVideo from '@/components/finishing/GradedVideo';
import FirstCutChip from '@/components/economy/FirstCutChip';
import CollectSheetGate from '@/components/economy/CollectSheetGate';
import TheatreMode from '@/components/TheatreMode';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const RED = '#E5E1DB';

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
    id: string; username: string | null; ticker: string | null; layout_id: string | null;
    media_type: string | null; poster_url: string | null; thumbnail_url: string | null;
    media_urls: string[] | null; autoplay_clip_url: string | null; autoplay: boolean | null;
    crop_x: number | null; crop_y: number | null; crop_width: number | null; crop_height: number | null;
    profile_image_url?: string | null;
  } | null;
}

const mediaSrc = (p: NonNullable<RoomRow['post']>): string | null =>
  p.media_type === 'video' ? (p.poster_url || p.thumbnail_url || null) : (p.media_urls?.[0] || null);

export default function DesktopScreeningRoom() {
  const router = useRouter();
  const [rows, setRows] = useState<RoomRow[] | null>(null);
  const [active, setActive] = useState(0);
  const [collectOpen, setCollectOpen] = useState(false);
  const [theatreOpen, setTheatreOpen] = useState(false);
  const [swapKey, setSwapKey] = useState(0); // bumps → stage crossfade
  const [meta, setMeta] = useState<{ likes: number; comments: number; topComment: string | null }>({ likes: 0, comments: 0, topComment: null });
  const railRef = useRef<HTMLDivElement>(null);

  // ── DATA: the ranked cache + posts join (identical to the mobile room). ──
  useEffect(() => {
    let cancelled = false;
    fetch('/api/screening-room/refresh', { method: 'POST', keepalive: true }).catch(() => {});
    (async () => {
      const { data: cache } = await supabase.from('screening_room').select('rank, coin_address, symbol, market_cap').order('rank', { ascending: true });
      if (!cache?.length) { if (!cancelled) setRows([]); return; }
      const addrs = cache.map((c) => c.coin_address).filter(Boolean);
      const { data: posts } = await supabase.from('posts')
        .select('id, coin_address, username, ticker, layout_id, media_type, poster_url, thumbnail_url, media_urls, autoplay_clip_url, autoplay, crop_x, crop_y, crop_width, crop_height')
        .in('coin_address', addrs);
      const byAddr = new Map((posts ?? []).map((p) => [String(p.coin_address).toLowerCase(), p]));
      // creator avatars in one batch
      const unames = [...new Set((posts ?? []).map((p) => p.username).filter(Boolean))] as string[];
      const { data: profs } = unames.length ? await supabase.from('profiles').select('username, profile_image_url').in('username', unames) : { data: [] as { username: string; profile_image_url: string | null }[] };
      const avatarByName = new Map((profs ?? []).map((p) => [p.username, p.profile_image_url]));
      const merged: RoomRow[] = cache.map((c) => {
        const p = byAddr.get(String(c.coin_address).toLowerCase()) as RoomRow['post'];
        if (p && p.username) p.profile_image_url = avatarByName.get(p.username) ?? null;
        return { rank: c.rank, coin_address: c.coin_address, symbol: c.symbol, market_cap: c.market_cap, post: p ?? null };
      });
      if (!cancelled) setRows(merged);
    })().catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, []);

  const current = rows?.[active] ?? null;
  const post = current?.post ?? null;

  // Active post's like/comment counts + the quiet top comment (most-recent; top-liked
  // would need comment-likes aggregation — deferred, cheaper to ship recent).
  useEffect(() => {
    if (!post?.id) { setMeta({ likes: 0, comments: 0, topComment: null }); return; }
    let cancelled = false;
    (async () => {
      const [likes, comments] = await Promise.all([getPostLikes(post.id).catch(() => []), getPostComments(post.id).catch(() => [])]);
      if (cancelled) return;
      const last = comments.length ? (comments[comments.length - 1] as { content?: string }).content ?? null : null;
      setMeta({ likes: likes.length, comments: comments.length, topComment: last });
    })();
    return () => { cancelled = true; };
  }, [post?.id]);

  // Keyboard ←/→ steps ranks (never while a modal is up).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (collectOpen || theatreOpen || !rows?.length) return;
      if (e.key === 'ArrowRight') { setActive((i) => Math.min(rows.length - 1, i + 1)); setSwapKey((k) => k + 1); }
      else if (e.key === 'ArrowLeft') { setActive((i) => Math.max(0, i - 1)); setSwapKey((k) => k + 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, collectOpen, theatreOpen]);

  const selectRank = (i: number) => { setActive(i); setSwapKey((k) => k + 1); };

  const rankedPosts = useMemo(() => (rows ?? []).map((r) => r.post).filter(Boolean) as Record<string, unknown>[], [rows]);
  const two = (n: number) => String(n).padStart(2, '0');

  // Stage media (image → feedImage 1600; video → graded muted autoplay), letterboxed.
  const stageMedia = (p: NonNullable<RoomRow['post']>) => {
    if (p.media_type === 'video' && p.autoplay_clip_url) {
      return <GradedVideo url={p.media_urls?.[0] ?? ''} posterUrl={p.poster_url ?? p.thumbnail_url} posterWidth={1600} clipUrl={p.autoplay_clip_url}
        cropX={p.crop_x ?? 0} cropY={p.crop_y ?? 0} cropWidth={p.crop_width ?? 1} cropHeight={p.crop_height ?? 1}
        autoplayFlag={p.autoplay !== false} forcePlay style={{ width: '100%', height: '100%' }} />;
    }
    const src = mediaSrc(p);
    return src ? <img src={feedImage(src, 1600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', background: '#0a0a0a' }} />;
  };

  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, left: 71, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#000' }}>
      <div style={{ maxWidth: 1440 - 71, margin: '0 auto', padding: '0 58px 40px', position: 'relative', minHeight: '100%' }}>

        {/* ═══ 1. HEADER ═══ */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '58px 0 30px' }}>
          <h1 style={{ ...SKB, fontSize: 58, letterSpacing: '-2.32px', color: '#E5E1DB', textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>Screening Room</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ ...SKB, fontSize: 12, color: '#E5E1DB', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Top 50 Market Cap Content</span>
            {/* The 172×31 top-right control (Figma x1192): v1 ships RANK-ORDER ONLY — the
                mock's element reads as a search/sort control; deferred to a later pass. */}
          </div>
        </div>

        {rows === null && <p style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.4)', textAlign: 'center', padding: '120px 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Assembling the room…</p>}
        {rows !== null && rows.length === 0 && <p style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.4)', textAlign: 'center', padding: '120px 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>The room is being assembled — check back soon.</p>}

        {current && post && (
          <>
            {/* ═══ 2. THE STAGE (1227×343 letterbox) ═══ */}
            <div style={{ width: '100%', maxWidth: 1227, aspectRatio: '1227 / 343', background: '#000', overflow: 'hidden', position: 'relative', margin: '0 auto' }}>
              <div key={swapKey} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'sr-stage-in 180ms ease-out both' }}>
                {stageMedia(post)}
              </div>
            </div>

            {/* ═══ DETAIL ROW ═══ */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 24, padding: '22px 0 0', maxWidth: 1227, margin: '0 auto' }}>
              {/* rank numeral + underline */}
              <div style={{ flexShrink: 0 }}>
                <span style={{ ...SKB, fontSize: 75, color: '#E5E1DB', lineHeight: 0.9, letterSpacing: '-0.04em', display: 'block' }}>{two(current.rank)}</span>
                <div style={{ width: 48, height: 2, background: '#E5E1DB', marginTop: 10 }} />
              </div>

              {/* identity + data + top comment */}
              <div style={{ flex: 1, minWidth: 0, paddingTop: 6 }}>
                <button onClick={() => post.username && router.push(`/profile/${encodeURIComponent(post.username)}`)} className="tappable" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: '#222', flexShrink: 0 }}>
                    {post.profile_image_url && <img src={feedImage(post.profile_image_url, 96)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <span style={{ ...SKB, fontSize: 16, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.02em' }}>@{post.username ?? 'unknown'}</span>
                </button>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
                  {(post.ticker || current.symbol) && <span style={{ ...SKB, fontSize: 14, color: RED, letterSpacing: '0.08em' }}>[ {post.ticker || current.symbol} ]</span>}
                  <span style={{ ...SKB, fontSize: 13, color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{usdMc(current.market_cap)}</span>
                </div>
                {meta.topComment && (
                  <p style={{ ...SKR, fontSize: 13, color: '#9e9e9e', margin: '18px 0 0', maxWidth: 403, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>{meta.topComment}</p>
                )}
              </div>

              {/* actions right of the 92px vertical hairline */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 20, alignSelf: 'center', borderLeft: '1px solid rgba(229,225,219,0.18)', paddingLeft: 24, minHeight: 92 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label="likes">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 20.5l-7.5-7.4a5 5 0 1 1 7.5-6.6a5 5 0 1 1 7.5 6.6z" stroke="rgba(229,225,219,0.75)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.7)', fontVariantNumeric: 'tabular-nums' }}>{meta.likes}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label="comments">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="rgba(229,225,219,0.75)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.7)', fontVariantNumeric: 'tabular-nums' }}>{meta.comments}</span>
                </span>
                {current.coin_address && <FirstCutChip coinAddress={current.coin_address} postId={post.id} />}
                {/* Standard #525252-bordered COLLECT (the frame's x1266 gradient variant is a
                    mock exploration — shipped the standard one). */}
                <button onClick={() => setCollectOpen(true)} className="tappable" style={{ ...SKB, fontSize: 12, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: '1px solid #525252', cursor: 'pointer', padding: '9px 18px' }}>Collect</button>
                <button onClick={() => setTheatreOpen(true)} aria-label="Theatre mode" className="tappable" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
                  <img src="/theatre-mode-eye-solo.png" alt="" style={{ height: 22, width: 'auto', display: 'block', opacity: 0.92 }} />
                </button>
              </div>
            </div>

            {/* ═══ 3. THE LINEUP ═══ */}
            <div style={{ margin: '52px auto 0', maxWidth: 1227 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <span style={{ ...SKB, fontSize: 13, color: '#808080', letterSpacing: '9.1px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>The Lineup</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(229,225,219,0.12)' }} />
              </div>
              <div ref={railRef} style={{ display: 'flex', gap: 24, overflowX: 'auto', paddingBottom: 10, scrollBehavior: 'smooth' }}>
                {(rows ?? []).map((r, i) => {
                  const rp = r.post;
                  const src = rp ? mediaSrc(rp) : null;
                  const isActive = i === active;
                  return (
                    <button key={r.rank} onClick={() => selectRank(i)} className="tappable" style={{ flexShrink: 0, width: 301, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                      <div style={{ position: 'relative', width: 301, height: 162, overflow: 'hidden', background: '#0a0a0a', border: `0.6px solid rgba(229,225,219,${isActive ? 1 : 0.58})`, boxSizing: 'border-box', transition: 'border-color 160ms ease' }}>
                        {src ? <img src={feedImage(src, 600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', background: '#111' }} />}
                        <span style={{ position: 'absolute', top: 6, left: 8, ...SKB, fontSize: 22, color: '#E5E1DB', lineHeight: 1, textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>{two(r.rank)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        <span style={{ ...SKB, fontSize: 8, color: 'rgba(229,225,219,0.8)', textTransform: 'uppercase', textOverflow: 'ellipsis', overflow: 'hidden' }}>@{rp?.username ?? '—'}</span>
                        {(rp?.ticker || r.symbol) && <span style={{ ...SKB, fontSize: 8, color: RED, letterSpacing: '0.06em' }}>[ {rp?.ticker || r.symbol} ]</span>}
                        <span style={{ ...SKB, fontSize: 8, color: 'rgba(229,225,219,0.48)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{usdMc(r.market_cap)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ═══ 4. FOOTER ═══ */}
            <p style={{ ...SKB, fontSize: 12, color: '#808080', letterSpacing: '8.52px', textTransform: 'uppercase', textAlign: 'center', margin: '48px 0 0' }}>Chosen by you</p>
          </>
        )}
      </div>

      {collectOpen && post && (
        <CollectSheetGate post={post as unknown as React.ComponentProps<typeof CollectSheetGate>['post']} visible={collectOpen} onClose={() => setCollectOpen(false)} />
      )}
      {theatreOpen && rankedPosts.length > 0 && (
        <TheatreMode posts={rankedPosts} startIndex={active} source="feed" onClose={() => setTheatreOpen(false)} />
      )}

      <style>{`@keyframes sr-stage-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
