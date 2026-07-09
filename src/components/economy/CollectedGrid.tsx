'use client';
// ── COLLECTED — REPERTORY (curated programs) + the collage of everything held ─
//
// Two layers, per Eric's reference:
//  1. REPERTORY — curated PROGRAMS of collected work: ultrawide banner rows
//     (baked hero + scrim + title + held count) → detail sheet (grid + owner
//     tools). HOLD-ONLY SEMANTICS: membership rows persist, every render
//     FILTERS by current holdings — selling drops an item everywhere, re-
//     collecting restores it (the row never died). Counts = held items only.
//  2. COLLECTED ITEMS — ALL held items in a randomized collage (mixed cells via
//     the canonical collage aspect cycle), session-stable shuffle, grid/list
//     toggle, ALL/FIRST CUT/RECENT filter, LOAD MORE. Cells open the lightbox
//     ONLY (no theatre icon — ratified).
//
// One component serves BOTH profiles (own + public); editing is owner-only.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEconomy } from '@/components/EconomyProvider';
import PostCell from '@/components/PostCell';
import PostModal from '@/components/PostModal';
import TheatreMode from '@/components/TheatreMode';
import type { Holding } from '@/lib/economy/types';
import { feedImage } from '@/lib/mediaUrl';
import { getAspectRatio } from '@/lib/aspectRatio';
import { PIECE_SUPPLY } from '@/lib/economy/mock';
import {
  getStacks, createStack, addStackItems, removeStackItem, renameStack, deleteStack,
  setStackHero, bakeHeroBanner, uploadHeroBanner, STACK_TITLE_MAX, BANNER_RATIO,
  type CollectedStack,
} from '@/lib/collectedStacks';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

// Session-stable shuffle: fresh per visit, stable within the session.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sessionSeed(): number {
  if (typeof window === 'undefined') return 1;
  const k = 'scope:collageSeed';
  const cur = sessionStorage.getItem(k);
  if (cur) return parseInt(cur, 10);
  const s = Math.floor(Math.random() * 2 ** 31);
  sessionStorage.setItem(k, String(s));
  return s;
}
function seededShuffle<T>(list: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const mcOf = (h: Holding): string => {
  if (h.priceUsd == null) return 'MC: —';
  const mc = h.priceUsd * PIECE_SUPPLY; // the boundary's own MC math (one source)
  return mc >= 1000 ? `MC: $${Math.round(mc).toLocaleString()}` : `MC: $${mc.toFixed(2)}`;
};

const thumbOf = (h: Holding): string | null => {
  const p = h.post as { poster_url?: string; thumbnail_url?: string; media_urls?: string[] };
  return p.poster_url || p.thumbnail_url || p.media_urls?.[0] || h.thumbUrl || null;
};


export default function CollectedGrid({
  userId,
  isOwn = false,
}: {
  /** The PROFILE user (Supabase id) whose collected positions to show. */
  userId: string;
  /** Own profile gets edit tools + empty-state prompts; public is read-only. */
  isOwn?: boolean;
}) {
  const economy = useEconomy();
  const [rows, setRows] = useState<Holding[] | null>(null);
  const [fcCoins, setFcCoins] = useState<Set<string>>(new Set());
  // SCOPED LIGHTBOX — one mechanism, two scopes: a program's items when
  // filtering, everything held otherwise. Index steps in scope order.
  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);
  const [lbTheatre, setLbTheatre] = useState(false);

  // REPERTORY state
  const [stacks, setStacks] = useState<CollectedStack[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);


  // Collage state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // IN-PLACE PROGRAM FILTER: tapping a banner filters the grid on the page —
  // no navigation. activeStackId=null → all items. The swap animates: outgoing
  // fade/scale (~150ms) → incoming stagger (~200ms, 25ms). Reduced-motion =
  // instant swap.
  const [activeStackId, setActiveStackId] = useState<string | null>(null);
  const [swapPhase, setSwapPhase] = useState<'in' | 'out'>('in');
  const [editStackId, setEditStackId] = useState<string | null>(null);
  // FULL-SCREEN PROGRAM VIEW — a portaled takeover (name + grid only, black,
  // edge-to-edge). The page underneath is untouched, so grid scroll survives
  // expand/collapse by construction. 'closing' plays the reverse animation.
  const [fullscreen, setFullscreen] = useState<'open' | 'closing' | null>(null);
  const [fsTheatre, setFsTheatre] = useState(false);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const switchTo = (id: string | null) => {
    const next = id === activeStackId ? null : id;
    if (reducedMotion) { setActiveStackId(next); setVisible(20); return; }
    setSwapPhase('out');
    window.setTimeout(() => { setActiveStackId(next); setVisible(20); setSwapPhase('in'); }, 150);
  };
  const [visible, setVisible] = useState(20);
  // The collage lands as a TASTE: 4 items (two 2-col rows) + VIEW ALL; the
  // paginated LOAD MORE takes over once expanded. Programs show ALL items
  // (curated + small — no gate; LOAD MORE still guards a >20 outlier).
  const [expanded, setExpanded] = useState(false);
  const seed = useMemo(() => sessionSeed(), []);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    economy.getCollected(userId)
      .then((h) => { if (!cancelled) setRows(h); })
      .catch((e) => { console.error('[collected] load error:', e); if (!cancelled) setRows([]); });
    economy.getFirstCutCoins(userId)
      .then((coins) => { if (!cancelled) setFcCoins(new Set(coins)); })
      .catch(() => { /* no marks on failure — never blocks the grid */ });
    getStacks(userId)
      .then((s) => { if (!cancelled) setStacks(s); })
      .catch(() => { if (!cancelled) setStacks([]); });
    const onBadges = () => {
      economy.getFirstCutCoins(userId)
        .then((coins) => { if (!cancelled) setFcCoins(new Set(coins)); })
        .catch(() => {});
    };
    window.addEventListener('scope:badges-changed', onBadges);
    return () => { cancelled = true; window.removeEventListener('scope:badges-changed', onBadges); };
  }, [userId, economy]);

  // Takeover standdown while the full-screen program view is up.
  useEffect(() => {
    if (!fullscreen || fullscreen === 'closing') return;
    document.documentElement.dataset.suiteOpen = '1';
    window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    return () => {
      delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    };
  }, [fullscreen]);
  const closeFullscreen = () => {
    if (reducedMotion) { setFullscreen(null); return; }
    setFullscreen('closing');
    window.setTimeout(() => setFullscreen(null), 220);
  };

  // HOLD-ONLY truth: postId → Holding for everything currently held.
  const held = useMemo(() => new Map((rows ?? []).map((h) => [h.postId, h])), [rows]);
  const heldItems = (s: CollectedStack): Holding[] =>
    s.itemPostIds.map((id) => held.get(id)).filter(Boolean) as Holding[];

  // No sort control (killed in the polish pass) — position, then recent.
  const sortedStacks = useMemo(() => {
    const list = [...(stacks ?? [])];
    list.sort((a, b) => a.position - b.position || b.created_at.localeCompare(a.created_at));
    return list;
  }, [stacks]);

  // Collage list: filter → session-stable shuffle (RECENT keeps natural order).
  const activeStack = activeStackId ? (stacks ?? []).find((x) => x.id === activeStackId) ?? null : null;
  const collage = useMemo(() => {
    let list = rows ?? [];
    if (activeStack) list = list.filter((h) => activeStack.itemPostIds.includes(h.postId)); // program filter (held-only by construction)
    return seededShuffle(list, seed);
  }, [rows, seed, activeStack]);

  // TRUE-RATIO MASONRY (2 cols): greedy shortest-column packing — each cell
  // keeps its post's OWN canonical ratio (no imposed cycle, no forced crop);
  // the collage feel comes from the natural variety of the five ratios.
  const ratioOf = (h: Holding): number => {
    const ar = String(getAspectRatio((h.post as { layout_id?: string }).layout_id || '2x-scope')).split('/').map((x) => parseFloat(x));
    return isFinite(ar[0]) && isFinite(ar[1]) && ar[1] > 0 ? ar[0] / ar[1] : 2.39;
  };
  const shownCount = activeStack ? collage.length : expanded ? visible : Math.min(4, collage.length);
  const columns = useMemo(() => {
    const cols: [Holding[], Holding[]] = [[], []];
    const heights = [0, 0];
    for (const h of collage.slice(0, shownCount)) {
      const c = heights[0] <= heights[1] ? 0 : 1;
      cols[c].push(h);
      heights[c] += 1 / ratioOf(h); // height units at unit width
    }
    return cols;
  }, [collage, shownCount]);

  const refreshStacks = () => { getStacks(userId).then(setStacks).catch(() => {}); };
  const openLightbox = (postId: string) => {
    const i = collage.findIndex((h) => h.postId === postId);
    setLightbox({ index: Math.max(0, i) });
  };
  const stepLightbox = (dir: 1 | -1) => {
    setLightbox((lb) => {
      if (!lb) return lb;
      const n = lb.index + dir;
      return n < 0 || n >= collage.length ? lb : { index: n }; // rubber-band: no wrap
    });
  };

  if (rows === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '30vh' }}>
        <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LOADING…</p>
      </div>
    );
  }

  // Programs visible on this surface: owner sees all (empty ones carry the
  // curate prompt); public sees only programs with held items.
  const visibleStacks = sortedStacks.filter((s) => isOwn || heldItems(s).length > 0);

  // EMPTY-STATE GUARD (bug fix): the tab BLANKED when rows was empty but the
  // old guard only fired if stacks were ALSO empty — so a public profile
  // holding nothing (or whose programs hold no items) rendered NOTHING:
  // REPERTORY hidden (no visible programs, not own) + COLLECTED ITEMS hidden
  // (rows 0). Now: nothing-to-render → a visible empty state, never blank.
  // Own always renders (REPERTORY's isOwn create-prompt), so this only catches
  // the public/empty case + the truly-empty own profile.
  if (rows.length === 0 && visibleStacks.length === 0) {
    return isOwn ? (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '30vh', padding: '0 32px' }}>
        <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.08em', lineHeight: 1.8 }}>
          NOTHING COLLECTED YET.<br />COLLECT IS HOW YOU KEEP THINGS ON SCOPE.
        </p>
      </div>
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '30vh', padding: '0 32px' }}>
        <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.08em' }}>
          NOTHING COLLECTED YET
        </p>
      </div>
    );
  }
  const detailStack = editStackId ? (stacks ?? []).find((s) => s.id === editStackId) ?? null : null;

  return (
    <>
      {/* ═══ REPERTORY ═══ */}
      {(visibleStacks.length > 0 || isOwn) && (
        <div style={{ padding: '2px 0 38px' }}>
          {/* Title block — its own air (Figma): 33px title over a red-centered
              radial hairline; + NEW PROGRAM small/regular in the understated
              gradient-stroke box. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 10px 37px' }}>
            <span style={{ ...SKB, fontSize: 33, color: '#FFF', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1 }}>REPERTORY</span>
            {isOwn && (
              <button
                onClick={() => setCreateOpen(true)}
                style={{
                  ...SKR, fontSize: 12, color: '#FFF', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em',
                  padding: '7px 12px', border: '0.5px solid transparent',
                  background: 'linear-gradient(#000, #000) padding-box, linear-gradient(135deg, rgba(255,0,0,0.7), rgba(255,0,0,0.15)) border-box',
                }}
              >
                + NEW PROGRAM
              </button>
            )}
          </div>


          {visibleStacks.length === 0 && isOwn && (
            <button onClick={() => setCreateOpen(true)} style={{ display: 'block', width: '100%', background: 'transparent', border: '1px dashed rgba(255,255,255,0.18)', cursor: 'pointer', padding: '18px 0', margin: '0 0 2px' }}>
              <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>CURATE YOUR FIRST PROGRAM</span>
            </button>
          )}

          {visibleStacks.map((s) => {
            const items = heldItems(s);
            const heroHeld = !!s.hero_post_id && held.has(s.hero_post_id);
            const bannerSrc = heroHeld && s.hero_banner_url
              ? s.hero_banner_url
              : items[0] ? feedImage(thumbOf(items[0]) ?? '', 1280) : null;
            return (
              <button
                key={s.id}
                onClick={() => switchTo(s.id)}
                style={{
                  position: 'relative', display: 'block', width: '100%', aspectRatio: `${BANNER_RATIO} / 1`, overflow: 'hidden', cursor: 'pointer', padding: 0, marginBottom: 4, boxSizing: 'border-box',
                  // ACTIVE = a quiet 0.5px gradient stroke (red fading diagonally to
                  // near-nothing) via the padding-box/border-box double background —
                  // a glow of selection, not an alert.
                  border: '0.5px solid transparent',
                  background: activeStackId === s.id
                    ? 'linear-gradient(#0d0d0d, #0d0d0d) padding-box, linear-gradient(135deg, rgba(255,0,0,0.55), rgba(255,0,0,0.08)) border-box'
                    : '#0d0d0d',
                }}
              >
                {bannerSrc && (
                  <img src={bannerSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                )}
                {/* side vignettes — soft black feathering in from BOTH edges so the
                    title (left) and chip/› (right) pop; the hero stays readable. */}
                <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.52) 100%)' }} />
                {/* left→right scrim for legibility */}
                <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 42%, rgba(0,0,0,0) 75%)' }} />
                <span style={{ position: 'absolute', left: 12, bottom: 8 }}>
                  <span style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.title}</span>
                </span>
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.3)', padding: '2px 6px', fontVariantNumeric: 'tabular-nums' }}>{items.length}</span>
                  <span style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.7)' }}>›</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ COLLECTED ITEMS — the randomized collage ═══ */}
      {rows.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>
            {activeStack ? (
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.16em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeStack.title}</span>
            ) : (
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>COLLECTED ITEMS</span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
              {activeStack && isOwn && (
                <button onClick={() => setEditStackId(activeStack.id)} style={{ ...SKB, fontSize: 'var(--fs-7)', color: '#FF0000', background: 'transparent', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', padding: 0 }}>EDIT</button>
              )}
              {activeStack && (
                <button onClick={() => setFullscreen('open')} aria-label="Full-screen program" style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.6)', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 0 }}>⤢</button>
              )}
              {activeStack && (
                <button onClick={() => switchTo(null)} aria-label="Show all items" style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.6)', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
              )}
              {/* grid / list toggle — icons only */}
              <button onClick={() => setViewMode('grid')} aria-label="Grid view" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, opacity: viewMode === 'grid' ? 1 : 0.4 }}>
                <svg width="13" height="13" viewBox="0 0 13 13"><rect x="0" y="0" width="5.5" height="5.5" fill="#FFF"/><rect x="7.5" y="0" width="5.5" height="5.5" fill="#FFF"/><rect x="0" y="7.5" width="5.5" height="5.5" fill="#FFF"/><rect x="7.5" y="7.5" width="5.5" height="5.5" fill="#FFF"/></svg>
              </button>
              <button onClick={() => setViewMode('list')} aria-label="List view" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, opacity: viewMode === 'list' ? 1 : 0.4 }}>
                <svg width="13" height="13" viewBox="0 0 13 13"><rect x="0" y="1" width="13" height="2" fill="#FFF"/><rect x="0" y="5.5" width="13" height="2" fill="#FFF"/><rect x="0" y="10" width="13" height="2" fill="#FFF"/></svg>
              </button>
            </span>
          </div>

          {viewMode === 'grid' ? (
            /* TRUE-RATIO masonry: two shortest-column-packed flex columns; each
               cell renders its post's OWN canonical ratio (PostCell paddingTop). */
            <div className={swapPhase === 'out' ? 'collage-swap-out' : ''} style={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              {columns.map((col, ci) => (
                <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  {col.map((h, i) => (
                    <div key={h.postId} className={swapPhase === 'in' && !reducedMotion ? 'collage-cell-in' : ''} style={{ animationDelay: swapPhase === 'in' && !reducedMotion ? `${(ci + i * 2) * 25}ms` : undefined }}>
                      <PostCell
                        post={h.post as any}
                        layoutId={(h.post as { layout_id?: string }).layout_id || '2x-scope'}
                        index={0}
                        onClick={() => openLightbox(h.postId)}
                        fcMark={fcCoins.has(String((h.post as { coin_address?: string | null }).coin_address ?? '').toLowerCase())}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className={swapPhase === 'out' ? 'collage-swap-out' : ''}>
              {collage.slice(0, shownCount).map((h) => (
                <button key={h.postId} onClick={() => openLightbox(h.postId)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', padding: '8px 10px', textAlign: 'left' }}>
                  <img src={feedImage(thumbOf(h) ?? '', 96)} alt="" style={{ width: 56, height: 34, objectFit: 'cover', display: 'block', background: '#111', flexShrink: 0 }} />
                  <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#FFF', textTransform: 'uppercase', flex: 1 }}>{h.ticker ? `[ ${h.ticker} ]` : '—'}</span>
                  {/* PUBLIC data only — the post's MCAP (the feed's MC language).
                      NEVER holdings/position values here (owner economics live in
                      the wallet's PORTFOLIO/COLLECTED, not on a public surface). */}
                  <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>{mcOf(h)}</span>
                </button>
              ))}
            </div>
          )}

          {!activeStack && !expanded && collage.length > 4 && (
            <button onClick={() => { setExpanded(true); setVisible(20); }} style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 0 18px' }}>
              <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>VIEW ALL · {collage.length}</span>
            </button>
          )}
          {(activeStack ? false : expanded) && collage.length > visible && (
            <button onClick={() => setVisible((v) => v + 20)} style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 0 18px' }}>
              <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>LOAD MORE</span>
            </button>
          )}
        </div>
      )}

      {/* ═══ FULL-SCREEN PROGRAM VIEW — name + grid only, edge-to-edge black.
          Purely for viewing: no EDIT here (it stays in the filtered header).
          The eye enters theatre SCOPED to this program's held posts (the
          consolidated TheatreMode takes any posts[] — we pass exactly them);
          exiting theatre returns HERE. Collapse returns to the filtered page
          (activeStack persists), scroll intact (the page never moved). */}
      {fullscreen && activeStack && createPortal(
        <div
          data-swipe-exclude
          style={{
            position: 'fixed', inset: 0, zIndex: 540, background: '#000',
            display: 'flex', flexDirection: 'column',
            animation: reducedMotion ? 'none' : fullscreen === 'closing' ? 'fsProgramOut 220ms ease both' : 'fsProgramIn 250ms ease both',
          }}
        >
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(12px + env(safe-area-inset-top, 0px)) 14px 10px' }}>
            <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.16em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeStack.title}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
              <button onClick={() => setFsTheatre(true)} aria-label="Theatre mode" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
                <img src="/theatre-mode-eye-framed-v2.png" alt="" style={{ height: 22, width: 'auto', display: 'block', opacity: 0.92 }} />
              </button>
              <button onClick={closeFullscreen} aria-label="Collapse" style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.7)', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 0 }}>⤡</button>
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              {columns.map((col, ci) => (
                <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  {col.map((h) => (
                    <PostCell
                      key={h.postId}
                      post={h.post as any}
                      layoutId={(h.post as { layout_id?: string }).layout_id || '2x-scope'}
                      index={0}
                      onClick={() => openLightbox(h.postId)}
                      fcMark={fcCoins.has(String((h.post as { coin_address?: string | null }).coin_address ?? '').toLowerCase())}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          {fsTheatre && (
            <TheatreMode posts={collage.map((h) => h.post as Record<string, unknown>)} source="feed" onClose={() => setFsTheatre(false)} />
          )}
        </div>,
        document.body,
      )}

      <style>{`
        @keyframes fsProgramIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fsProgramOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(10px); } }
        .collage-swap-out { opacity: 0; transform: scale(0.97); transition: opacity 150ms ease, transform 150ms ease; }
        .collage-cell-in { animation: collageCellIn 200ms ease both; }
        @keyframes collageCellIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      {lightbox && collage[lightbox.index] && (
        <PostModal
          post={collage[lightbox.index].post as any}
          onClose={() => setLightbox(null)}
          zIndex={fullscreen ? 560 : undefined}
          nav={{ index: lightbox.index, total: collage.length, onStep: stepLightbox }}
          onTheaterMode={() => setLbTheatre(true)}
        />
      )}
      {lbTheatre && lightbox && (
        <TheatreMode
          posts={collage.map((h) => h.post as Record<string, unknown>)}
          startIndex={lightbox.index}
          source="feed"
          zBase={fullscreen ? 580 : 500}
          onClose={() => setLbTheatre(false)}
        />
      )}

      {createOpen && (
        <ProgramSheet
          mode="create"
          userId={userId}
          held={rows}
          onDone={() => { setCreateOpen(false); refreshStacks(); }}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {detailStack && (
        <ProgramDetail
          stack={detailStack}
          items={heldItems(detailStack)}
          heldAll={rows}
          isOwn={isOwn}
          userId={userId}
          fcCoins={fcCoins}
          onChanged={refreshStacks}
          onOpenPost={(p) => openLightbox(String((p as { id?: string }).id ?? ''))}
          onClose={() => setEditStackId(null)}
        />
      )}
    </>
  );
}

// ── CREATE sheet — one flow: name → select items → pick hero → bake → done ────
function ProgramSheet({
  userId, held, onDone, onClose,
}: {
  mode: 'create';
  userId: string;
  held: Holding[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hero, setHero] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canCreate = title.trim().length > 0 && selected.size > 0 && !busy;

  const toggle = (postId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) { next.delete(postId); if (hero === postId) setHero(null); }
      else next.add(postId);
      return next;
    });
  };

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    const ids = [...selected];
    const heroId = hero ?? ids[0];
    const stack = await createStack(userId, title, ids, heroId);
    if (stack) {
      // Hero bake — center-crop the held item's image to the banner ratio.
      const h = held.find((x) => x.postId === heroId);
      const src = h ? thumbOf(h) : null;
      if (src) {
        const blob = await bakeHeroBanner(feedImage(src, 1600));
        if (blob) {
          const url = await uploadHeroBanner(userId, stack.id, blob);
          if (url) await setStackHero(stack.id, heroId, url);
        }
      }
    }
    setBusy(false);
    onDone();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 520 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '86dvh', overflowY: 'auto', background: '#080808', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '18px 14px calc(22px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.12em' }}>NEW PROGRAM</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }}>
            <span style={{ ...SKR, fontSize: 'var(--fs-16)', color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>×</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, STACK_TITLE_MAX))}
            maxLength={STACK_TITLE_MAX}
            placeholder="PROGRAM NAME"
            style={{ ...SKB, flex: 1, fontSize: 'max(16px, var(--fs-12))', color: '#FFF', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.25)', outline: 'none', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 0' }}
          />
          <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>{title.length}/{STACK_TITLE_MAX}</span>
        </div>
        <p style={{ ...SKR, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '10px 0 8px' }}>
          SELECT WORKS · TAP AGAIN TO SET THE HERO {hero ? '· HERO SET' : ''}
        </p>
        <div className="grid grid-cols-3 gap-[2px]">
          {held.map((h) => {
            const sel = selected.has(h.postId);
            const isHero = hero === h.postId;
            return (
              <button
                key={h.postId}
                onClick={() => { if (sel) { if (isHero) toggle(h.postId); else setHero(h.postId); } else toggle(h.postId); }}
                style={{ position: 'relative', aspectRatio: '16 / 10', overflow: 'hidden', background: '#111', border: isHero ? '1px solid #FF0000' : sel ? '1px solid rgba(255,255,255,0.8)' : '1px solid transparent', cursor: 'pointer', padding: 0 }}
              >
                <img src={feedImage(thumbOf(h) ?? '', 300)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: sel ? 1 : 0.55 }} />
                {isHero && <span style={{ position: 'absolute', left: 4, bottom: 3, ...SKB, fontSize: 9, color: '#FF0000', textTransform: 'uppercase' }}>HERO</span>}
              </button>
            );
          })}
        </div>

        <button
          onClick={create}
          disabled={!canCreate}
          style={{ display: 'block', width: '100%', marginTop: 16, background: canCreate ? '#FF0000' : 'rgba(255,255,255,0.08)', border: 'none', cursor: canCreate ? 'pointer' : 'default', padding: '13px 0' }}
        >
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: canCreate ? '#FFF' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {busy ? 'CREATING…' : 'CREATE PROGRAM'}
          </span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ── DETAIL sheet — the program's held items + v1-simple owner tools ───────────
function ProgramDetail({
  stack, items, heldAll, isOwn, userId, fcCoins, onChanged, onOpenPost, onClose,
}: {
  stack: CollectedStack;
  items: Holding[];
  heldAll: Holding[];
  isOwn: boolean;
  userId: string;
  fcCoins: Set<string>;
  onChanged: () => void;
  onOpenPost: (p: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(stack.title);
  const [busyHero, setBusyHero] = useState<string | null>(null);
  const heroSold = !!stack.hero_post_id && !items.some((h) => h.postId === stack.hero_post_id);
  const addable = heldAll.filter((h) => !stack.itemPostIds.includes(h.postId));

  const [heroError, setHeroError] = useState<string | null>(null);
  const doSetHero = async (h: Holding) => {
    setBusyHero(h.postId); setHeroError(null);
    const src = thumbOf(h);
    let url: string | null = null;
    if (src) {
      const blob = await bakeHeroBanner(feedImage(src, 1600));
      if (blob) url = await uploadHeroBanner(userId, stack.id, blob);
    }
    if (!url) {
      // The old path persisted NULL here — hero_post_id updated, banner_url
      // wiped → the render fell back to the first item and the tap read as
      // "nothing happened" (3 of 4 stacks were in this state). Now: persist
      // NOTHING on failure, tell the owner.
      setBusyHero(null);
      setHeroError('HERO BAKE FAILED — TRY AGAIN');
      return;
    }
    await setStackHero(stack.id, h.postId, url);
    setBusyHero(null);
    onChanged();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 510 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '88dvh', overflowY: 'auto', background: '#080808', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '18px 14px calc(22px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          {renaming ? (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, STACK_TITLE_MAX))}
                maxLength={STACK_TITLE_MAX}
                autoFocus
                style={{ ...SKB, fontSize: 'max(16px, var(--fs-12))', color: '#FFF', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.3)', outline: 'none', textTransform: 'uppercase', letterSpacing: '0.06em', width: '55%' }}
              />
              <button onClick={async () => { if (await renameStack(stack.id, name)) { setRenaming(false); onChanged(); } }} style={{ ...SKB, fontSize: 'var(--fs-8)', color: '#FF0000', background: 'transparent', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>SAVE</button>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-13)', color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{stack.title}</span>
              <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{items.length} ITEMS</span>
            </span>
          )}
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }}>
            <span style={{ ...SKR, fontSize: 'var(--fs-16)', color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>×</span>
          </button>
        </div>

        {isOwn && (
          <div style={{ display: 'flex', gap: 16, margin: '6px 0 12px' }}>
            <button onClick={() => setAdding((a) => !a)} style={{ ...SKR, fontSize: 'var(--fs-8)', color: adding ? '#FFF' : 'rgba(255,255,255,0.55)', background: 'transparent', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em', padding: 0 }}>+ ADD ITEMS</button>
            <button onClick={() => setRenaming((r) => !r)} style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.55)', background: 'transparent', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em', padding: 0 }}>RENAME</button>
            <button onClick={async () => { if (await deleteStack(stack.id)) { onChanged(); onClose(); } }} style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,0,0,0.7)', background: 'transparent', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em', padding: 0 }}>DELETE</button>
          </div>
        )}

        {heroError && (
          <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>{heroError}</p>
        )}
        {isOwn && heroSold && items.length > 0 && (
          /* HERO SOLD — the banner already falls back; this is the owner nudge. */
          <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
            HERO NO LONGER HELD · <span style={{ color: '#FF0000' }}>SET NEW HERO</span> — tap SET HERO on any item
          </p>
        )}
        {items.length === 0 && (
          <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 12px' }}>
            0 ITEMS — {isOwn ? 'EVERYTHING HERE WAS SOLD. ADD HELD WORKS TO REVIVE IT.' : 'NOTHING HELD.'}
          </p>
        )}

        {adding && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ ...SKR, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>TAP TO ADD</p>
            <div className="grid grid-cols-4 gap-[2px]">
              {addable.map((h) => (
                <button key={h.postId} onClick={async () => { if (await addStackItems(stack.id, [h.postId], stack.itemPostIds.length)) onChanged(); }} style={{ aspectRatio: '16 / 10', overflow: 'hidden', background: '#111', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', padding: 0 }}>
                  <img src={feedImage(thumbOf(h) ?? '', 300)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
              {addable.length === 0 && <p style={{ ...SKR, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', gridColumn: 'span 4', padding: '8px 0' }}>EVERYTHING HELD IS ALREADY IN THIS PROGRAM.</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-[1px] gap-y-[2px]">
          {items.map((h, i) => (
            <div key={h.postId} style={{ position: 'relative' }}>
              <PostCell
                post={h.post as any}
                layoutId={(h.post as { layout_id?: string }).layout_id || '2x-scope'}
                index={i}
                onClick={() => onOpenPost(h.post)}
                fcMark={fcCoins.has(String((h.post as { coin_address?: string | null }).coin_address ?? '').toLowerCase())}
              />
              {isOwn && (
                <span style={{ position: 'absolute', left: 4, bottom: 4, display: 'flex', gap: 6, zIndex: 7 }}>
                  <button onClick={() => doSetHero(h)} disabled={busyHero !== null} style={{ ...SKB, fontSize: 8.5, color: stack.hero_post_id === h.postId ? '#FF0000' : 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', padding: '2px 5px', textTransform: 'uppercase' }}>
                    {busyHero === h.postId ? 'BAKING…' : stack.hero_post_id === h.postId ? 'HERO' : 'SET HERO'}
                  </button>
                  <button onClick={async () => { if (await removeStackItem(stack.id, h.postId)) onChanged(); }} style={{ ...SKB, fontSize: 8.5, color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', padding: '2px 5px' }}>✕</button>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
