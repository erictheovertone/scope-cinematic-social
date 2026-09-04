'use client';
// ── DESKTOP HOME FEED LIGHTBOX (Figma 775:4, 1440×900) ───────────────────────
// Opens from a home-grid cell tap. REUSES DesktopPostView (framing='lightbox':
// stage TOP = panel top, MORE FROM bottom-aligns to the panel). Fits ONE screen,
// no scroll. Global 71px rail stays visible (this is NOT theatre). Adds the
// FEED / FOR YOU / FOLLOWING tabs above the top strip, and the bounded MORE FROM
// row (ticker + MC, arrow to scan). Desktop-only; mobile lightbox untouched.

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { getProfile, getFollowing } from '@/lib/userService';
import { getPostsByIds } from '@/lib/postsService';
import { feedImage } from '@/lib/mediaUrl';
import { useEconomy } from '@/components/EconomyProvider';
import DesktopPostView from '@/components/desktop/DesktopPostView';
import CreatorSearch from '@/components/desktop/CreatorSearch';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

type P = Record<string, unknown>;
const thumbOf = (p: P): string =>
  (p.poster_url as string) || (p.thumbnail_url as string) || ((p.media_urls as string[])?.[0] ?? '');
const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);

// Brief F7 §1 — video posts in the horizontal strips get a small ivory PLAY glyph,
// top-right of the thumbnail. Media-type flag = post.media_type === 'video' (same field
// the masonry uses); images get nothing. The parent thumb box must be position:relative.
const isVideoPost = (p: P): boolean => p.media_type === 'video';
const StripPlayGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden
    style={{ position: 'absolute', top: 8, right: 8, opacity: 0.7, filter: 'drop-shadow(0 0 4px rgba(5,5,5,0.5))', pointerEvents: 'none' }}>
    <path d="M4.5 3 L11 7 L4.5 11 Z" stroke="#E5E1DB" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
);

export default function DesktopHomeLightbox({
  posts, index, onClose,
}: {
  posts: P[];
  index: number;
  onClose: () => void;
}) {
  const { user } = usePrivy();
  const router = useRouter();
  const economy = useEconomy();
  const [creatorAvatar, setCreatorAvatar] = useState<string | null>(null);
  const [nav, setNav] = useState<P[]>(posts);
  const [pos, setPos] = useState(index);
  const active = nav[pos];
  const creatorId = String(active?.user_id ?? '');
  const creatorHandle = String(active?.username ?? '');

  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [moreFrom, setMoreFrom] = useState<P[]>([]);
  const [mfMc, setMfMc] = useState<Map<string, string>>(new Map());
  const mfScroll = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  // The top strip tracks the ACTIVE post: whenever it changes (arrows/keyboard/
  // strip tap), scroll its thumbnail to center. inline:'center' (chosen over
  // 'nearest' so the active tile always lands mid-strip, not just barely in view).
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-active]') as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [pos, tab]);

  const step = useCallback((dir: 1 | -1) => {
    setPos((i) => { const n = i + dir; return n < 0 || n >= nav.length ? i : n; });
  }, [nav.length]);
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

  // FOLLOWING = accounts the viewer follows → filter the strip to their posts.
  useEffect(() => {
    if (!user?.id) return;
    let dead = false;
    getFollowing(user.id).then((profs) => {
      if (dead) return;
      setFollowedIds(new Set((profs ?? []).map((p) => String((p as { user_id?: string }).user_id ?? '')).filter(Boolean)));
    }).catch(() => {});
    return () => { dead = true; };
  }, [user?.id]);

  // MORE FROM = the ACTIVE creator's settings selection; hidden if none.
  useEffect(() => {
    if (!creatorId) { setMoreFrom([]); return; }
    let dead = false;
    (async () => {
      try {
        const prof = await getProfile(creatorId) as { more_from?: string[] | null; profile_image_url?: string | null } | null;
        if (!dead) setCreatorAvatar(prof?.profile_image_url ?? null);
        const ids = Array.isArray(prof?.more_from) ? prof!.more_from! : [];
        if (!ids.length) { if (!dead) setMoreFrom([]); return; }
        const ps = await getPostsByIds(ids);
        if (!dead) setMoreFrom(ps as unknown as P[]);
      } catch { if (!dead) setMoreFrom([]); }
    })();
    return () => { dead = true; };
  }, [creatorId]);

  // MC per MORE FROM card — the SAME boundary source the panel/tiles use.
  useEffect(() => {
    let dead = false;
    (async () => {
      const entries = await Promise.all(moreFrom.map(async (p) => {
        if (!p.coin_address) return [String(p.id), '—'] as const; // unminted → no market read
        try { const m = await economy.getPostMarket(String(p.id)); return [String(p.id), m.mcUsd > 0 ? usd(m.mcUsd) : '—'] as const; }
        catch { return [String(p.id), '—'] as const; }
      }));
      if (!dead) setMfMc(new Map(entries));
    })();
    return () => { dead = true; };
  }, [moreFrom, economy]);

  if (typeof document === 'undefined') return null;

  const strip = tab === 'following' ? posts.filter((p) => followedIds.has(String(p.user_id))) : posts;

  const tabBtn = (label: string, key: 'foryou' | 'following') => (
    <button onClick={() => setTab(key)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 4px', ...SKB, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: tab === key ? '#E5E1DB' : 'rgba(229,225,219,0.4)', borderBottom: tab === key ? '2px solid #E5E1DB' : '2px solid transparent' }}>{label}</button>
  );

  // ── MORE FROM row (bounded; each caption = creator avatar + @handle LINK + MC).
  //    The scan-arrow only appears when the row actually overflows (>4 cards fit;
  //    the cap is 6 → it can overflow), and is wired to scroll the row. ──
  const goProfile = (e: React.MouseEvent) => { e.stopPropagation(); router.push(`/profile/${creatorHandle}`); };
  const moreFromRow = moreFrom.length > 0 ? (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 10px' }}>
        <p style={{ ...SKB, fontSize: 10, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          MORE FROM <span style={{ color: 'rgba(229,225,219,0.55)' }}>@{creatorHandle}</span>
        </p>
        {moreFrom.length > 4 && (
          <button onClick={() => mfScroll.current?.scrollBy({ left: 240, behavior: 'smooth' })} aria-label="Scan more" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
            <svg width="9" height="16" viewBox="0 0 10 22" fill="none"><path d="M1 1L8.6 11L1 21" stroke="rgba(229,225,219,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>
      <div ref={mfScroll} style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {moreFrom.map((p) => (
          <div key={String(p.id)} onClick={() => jumpTo(p)} style={{ flexShrink: 0, width: 208, cursor: 'pointer' }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '2.75 / 1', overflow: 'hidden', background: '#0d0d0d' }}>
              {thumbOf(p) && <img src={feedImage(thumbOf(p), 480)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              {isVideoPost(p) && <StripPlayGlyph />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '7px 0 0' }}>
              {/* creator avatar + @handle — LINKS to the profile (global button:hover brightens) */}
              <span role="link" onClick={goProfile} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, cursor: 'pointer' }}>
                {creatorAvatar ? <img src={feedImage(creatorAvatar, 96)} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#2a2a2a', flexShrink: 0 }} />}
                <span style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{creatorHandle}</span>
              </span>
              {/* Unminted (no coin) → quiet dash, never a fake MC. */}
              <span style={{ ...SKB, fontSize: 9.5, color: 'rgba(229,225,219,0.55)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{p.coin_address ? `MC ${mfMc.get(String(p.id)) ?? '…'}` : '—'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : undefined;

  return createPortal(
    // left:var(--rail-w) keeps the global rail (z80) VISIBLE beneath this z140 overlay.
    // overflow:hidden → everything fits one screen, no scroll (frame 775:4).
    <div data-swipe-exclude style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 'var(--rail-w)', zIndex: 140, background: '#000', overflow: 'hidden' }}>
      {/* header row seated 8px higher (top padding 18→10) */}
      <div style={{ maxWidth: 'var(--shell-fluid)', margin: '0 auto', padding: '10px 24px 0', height: '100%', boxSizing: 'border-box' }}/* Brief D4 §2 — VIEWING surface: fills the window (minus rail), no cap. DesktopPostView's stage is flex:1 so it TAKES THE SURPLUS (AR 2.39 preserved, media object-contained — never stretched/cropped); the side panel stays fixed width:309. Split at 1440/1920/2560 stage≈972/1452/2092 (height 407/607/875 — fits standard monitors). MORE FROM + top strip are overflow-x rows of fixed-width cards → MORE items visible as it widens (cards keep character). NOTE: on a SHORT ultrawide (3440×1440) the 2.39 stage height nears the viewport — acceptable per Eric's grow ruling; a maxHeight guard is the follow-up if it ever clips. */>

        {/* ── FEED heading (page-title, 40px) + FOR YOU / FOLLOWING tabs (frame ~y38) ── */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 12 }}>
          {/* Brief D7 §2 — sentence case + house title tier (75 Bold, --track-display, --ink-100). */}
          <span style={{ ...SKB, fontSize: 'calc(40px * var(--type-scale))', lineHeight: 1, color: 'var(--ink-100)', letterSpacing: 'var(--track-display)', marginRight: 10 }}>Feed</span>
          {tabBtn('FOR YOU', 'foryou')}
          {tabBtn('FOLLOWING', 'following')}
          {/* search chrome + the ONE control: × close takes the old "?" position. */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Brief D7 §3 — real creator search (was a dead placeholder div). */}
            <CreatorSearch width={123} height={30} />
            <button onClick={onClose} aria-label="Close" style={{ width: 31, height: 30, border: '0.5px solid rgba(229,225,219,0.3)', background: 'transparent', cursor: 'pointer', ...SKR, fontSize: 15, color: 'rgba(229,225,219,0.6)', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* ── TOP STRIP — the tab's posts, horizontal scroll, quiet handles ── */}
        <div ref={stripRef} style={{ display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 8, marginBottom: 6, scrollbarWidth: 'none' }}>
          {strip.length === 0 ? (
            <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '40px 0' }}>{tab === 'following' ? 'NO POSTS FROM ACCOUNTS YOU FOLLOW' : 'NOTHING HERE YET'}</p>
          ) : strip.map((p) => {
            const isActive = String(p.id) === String(active?.id);
            return (
              <button key={String(p.id)} data-active={isActive ? '' : undefined} onClick={() => jumpTo(p)} aria-label={`Post by @${String(p.username ?? '')}`}
                style={{ flexShrink: 0, width: 164, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, opacity: isActive ? 1 : 0.6, transition: 'opacity 160ms ease' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '2.39 / 1', overflow: 'hidden', background: '#0d0d0d', outline: isActive ? '1px solid rgba(229,225,219,0.7)' : 'none' }}>
                  {thumbOf(p) && <img src={feedImage(thumbOf(p), 340)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  {isVideoPost(p) && <StripPlayGlyph />}
                </div>
                {/* handle hugs the thumbnail (~5px), left-justified */}
                <p style={{ ...SKB, fontSize: 9, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '5px 0 0', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{String(p.username ?? '')}</p>
              </button>
            );
          })}
        </div>

        {/* ── STAGE + RIGHT PANEL + (below-left) MORE FROM — reused, lightbox framing.
              marginTop = extra air above the stage / panel top (frame rhythm, #4). ── */}
        {/* group (stage/panel/actions/creator/caption/MORE FROM) sits 15px lower
            than round 3 — marginTop 24→39; internal positioning unchanged. */}
        <div style={{ marginTop: 39 }}>
          <DesktopPostView posts={nav} index={pos} onStep={step} location={null} framing="lightbox" belowLeft={moreFromRow} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
