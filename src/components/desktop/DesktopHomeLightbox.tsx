'use client';
// ── DESKTOP HOME FEED LIGHTBOX (Figma 775:4, 1440) ───────────────────────────
// Opens from a home-grid cell tap. REUSES the desktop post-scroll's stage +
// right panel verbatim (DesktopPostView — arrows/keyboard step the FEED order,
// MC/collectors, First Cut leaderboard, comments, collect). Adds the two NEW
// shelves: the TOP STRIP (lateral feed navigation) and MORE FROM @handle (the
// creator's settings-selected works). Desktop-only; mobile lightbox untouched.

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getProfile } from '@/lib/userService';
import { getPostsByIds } from '@/lib/postsService';
import { feedImage } from '@/lib/mediaUrl';
import DesktopPostView from '@/components/desktop/DesktopPostView';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(255,255,255,0.14)';
const RAIL_W = 71;

type P = Record<string, unknown>;
const thumbOf = (p: P): string =>
  (p.poster_url as string) || (p.thumbnail_url as string) || ((p.media_urls as string[])?.[0] ?? '');

export default function DesktopHomeLightbox({
  posts, index, onClose,
}: {
  posts: P[];
  index: number;
  onClose: () => void;
}) {
  // Navigable list = the feed, plus any MORE FROM post jumped-to that wasn't in
  // the feed page (appended so arrows/keyboard keep working).
  const [nav, setNav] = useState<P[]>(posts);
  const [pos, setPos] = useState(index);
  const active = nav[pos];
  const creatorId = String(active?.user_id ?? '');
  const creatorHandle = String(active?.username ?? '');

  const [moreFrom, setMoreFrom] = useState<P[]>([]);

  const step = useCallback((dir: 1 | -1) => {
    setPos((i) => { const n = i + dir; return n < 0 || n >= nav.length ? i : n; }); // rubber-band at ends
  }, [nav.length]);

  // jump-to: strip (feed post, already in nav) or MORE FROM (append if absent)
  const jumpTo = useCallback((p: P) => {
    setNav((cur) => {
      const at = cur.findIndex((x) => String(x.id) === String(p.id));
      if (at >= 0) { setPos(at); return cur; }
      const next = [...cur, p]; setPos(next.length - 1); return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  // MORE FROM = the ACTIVE post's creator's settings selection (profiles.more_from).
  // Re-reads when the creator changes (stepping to another author). Hidden if none.
  useEffect(() => {
    if (!creatorId) { setMoreFrom([]); return; }
    let dead = false;
    (async () => {
      try {
        const prof = await getProfile(creatorId) as { more_from?: string[] | null } | null;
        const ids = Array.isArray(prof?.more_from) ? prof!.more_from! : [];
        if (!ids.length) { if (!dead) setMoreFrom([]); return; }
        const ps = await getPostsByIds(ids);
        if (!dead) setMoreFrom(ps as unknown as P[]);
      } catch { if (!dead) setMoreFrom([]); }
    })();
    return () => { dead = true; };
  }, [creatorId]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 140, background: '#000', overflowY: 'auto', paddingLeft: RAIL_W }}>
      {/* close (top-left, clear of the rail) */}
      <button onClick={onClose} aria-label="Close" style={{ position: 'fixed', top: 16, left: RAIL_W + 18, zIndex: 3, background: 'transparent', border: 'none', cursor: 'pointer', ...SKR, fontSize: 20, color: 'rgba(255,255,255,0.55)', lineHeight: 1, padding: 4 }}>✕</button>

      <div style={{ maxWidth: 1369, margin: '0 auto', padding: '4px 16px 60px' }}>

        {/* ═══ TOP BAND: the lateral-nav STRIP (left) + search chrome (right) ═══ */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, padding: '8px 0 0', minHeight: 153 }}>
          {/* TOP STRIP — feed's other posts, horizontally scrollable, quiet handles.
              Static thumbnails (no autoplay); tap → jump the stage to that post. */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
            {posts.map((p, i) => {
              const isActive = String(p.id) === String(active?.id);
              return (
                <button key={String(p.id)} onClick={() => jumpTo(p)} aria-label={`Post by @${String(p.username ?? '')}`}
                  style={{ flexShrink: 0, width: 176, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, opacity: isActive ? 1 : 0.62, transition: 'opacity 160ms ease' }}>
                  <div style={{ width: '100%', aspectRatio: '2.39 / 1', overflow: 'hidden', background: '#0d0d0d', outline: isActive ? '1px solid rgba(242,13,13,0.7)' : 'none' }}>
                    {thumbOf(p) && <img src={feedImage(thumbOf(p), 360)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  </div>
                  <p style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '5px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{String(p.username ?? '')}</p>
                </button>
              );
            })}
          </div>

          {/* TOP-RIGHT CHROME — SEARCH box + a square button. The app has no search
              surface yet, so this is a clean visual stub (reported). */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10 }}>
            <div style={{ width: 123, height: 33, border: '0.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
              <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>SEARCH</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" strokeLinecap="round"/></svg>
            </div>
            <button aria-label="Help" style={{ width: 34, height: 33, border: '0.5px solid rgba(255,255,255,0.3)', background: 'transparent', cursor: 'pointer', ...SKB, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>?</button>
          </div>
        </div>

        {/* ═══ THE STAGE + RIGHT PANEL — reused verbatim from the post-scroll ═══ */}
        <DesktopPostView posts={nav} index={pos} onStep={step} location={null} />

        {/* separating hairline (frame y717) */}
        <div style={{ height: 1, background: HAIR, margin: '8px 0 0' }} />

        {/* ═══ SHELF 1: MORE FROM @handle — the creator's settings selection ═══ */}
        {/* Hidden entirely when the creator selected none (reported behaviour). */}
        {moreFrom.length > 0 && (
          <div style={{ padding: '24px 0 0' }}>
            <p style={{ ...SKB, fontSize: 10, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 14px' }}>
              MORE FROM <span style={{ color: 'rgba(255,255,255,0.55)' }}>@{creatorHandle}</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 22 }}>
              {moreFrom.slice(0, 4).map((p) => (
                <button key={String(p.id)} onClick={() => jumpTo(p)} aria-label={`More from @${creatorHandle}`}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'block' }}>
                  <div style={{ width: '100%', aspectRatio: '2.75 / 1', overflow: 'hidden', background: '#0d0d0d' }}>
                    {thumbOf(p) && <img src={feedImage(thumbOf(p), 700)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  </div>
                  <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '7px 0 0' }}>@{creatorHandle}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
