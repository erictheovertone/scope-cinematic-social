'use client';
// ── DESKTOP PROFILE — Figma 229:455 at the 1440 reference ─────────────────────
//
// One component, own + public (isOwn gating), self-fetching via the existing
// services so the mobile pages stay untouched. The rail (71px) is global; this
// renders the content column. Static layout only — the grid→post-scroll
// transform is BRIEF 2 (the grid-mode icon slot stays unbuilt).

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getProfile, getFollowerCount, getFollowingCount, getUserDecks, getProfileLinks,
  createDeck, isProMember, type ProfileLink, type Deck,
} from '@/lib/userService';
import { createPortal } from 'react-dom';
import { updateProfileFields } from '@/lib/userService';
import { bakeAndStoreDeckCover } from '@/lib/deckCollage';
import { getUserPosts } from '@/lib/postsService';
import { useEconomy } from '@/components/EconomyProvider';
import { resolveBadges } from '@/lib/economy/badges';
import { feedImage } from '@/lib/mediaUrl';
import PostModal from '@/components/PostModal';
import DesktopBioSheet from '@/components/desktop/DesktopBioSheet';
import DesktopBadgesSheet from '@/components/desktop/DesktopBadgesSheet';
import CollectedGrid from '@/components/economy/CollectedGrid';
import TheatreMode from '@/components/TheatreMode';
import GradedVideo from '@/components/finishing/GradedVideo';
import DesktopPostView from '@/components/desktop/DesktopPostView';
import { resolveLayout, ratioForAspect, type AspectId } from '@/lib/layoutModel';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const SKL: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 300 };
const HAIR = 'rgba(255,255,255,0.14)';
const RED = '#f20d0d';

// DM button: rendered DISABLED behind this flag (Eric decides on sight —
// flip to false to hide entirely). DMs are their own upcoming build.
const SHOW_MESSAGE_BUTTON = true;

interface Props {
  /** Supabase users.id of the PROFILE user. */
  userId: string;
  /** The profile user's privy DID (for the follower/link services). */
  privyId: string;
  isOwn: boolean;
}

type Tab = 'portfolio' | 'collected' | 'decks';

export default function DesktopProfile({ userId, privyId, isOwn }: Props) {
  const router = useRouter();
  const economy = useEconomy();

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [posts, setPosts] = useState<Record<string, unknown>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [decks, setDecks] = useState<(Deck & { item_count: number; thumbnail_urls: string[] })[]>([]);
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [collectors, setCollectors] = useState(0);
  const [fcCount, setFcCount] = useState(0);
  const [joined, setJoined] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('portfolio');
  const [theatreOpen, setTheatreOpen] = useState(false);
  const [openPost, setOpenPost] = useState<Record<string, unknown> | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);
  // Profile grid = the SHARED aspect × the DESKTOP count (resolveLayout).
  const [gridConf, setGridConf] = useState<{ aspect: AspectId; count: number }>({ aspect: 'scope', count: 4 });
  const [deckCreateOpen, setDeckCreateOpen] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [decksCount, setDecksCount] = useState(4); // desktop decks grid columns (3|4|5)
  const bakingRef = useRef<Set<string>>(new Set());

  const submitDeck = async () => {
    const title = newDeckTitle.trim();
    if (!title || creatingDeck) return;
    setCreatingDeck(true);
    try {
      const deck = await createDeck(privyId, handle, title, newDeckDesc.trim());
      if (deck?.id) router.push(`/profile/${handle}/decks/${deck.id}`); // → editor to add posts (cover bakes there)
    } catch (e) { console.error('[desktop-profile] createDeck error:', e); }
    finally { setCreatingDeck(false); setDeckCreateOpen(false); setNewDeckTitle(''); setNewDeckDesc(''); }
  };

  // Per-user desktop decks grid count (3|4|5) — persisted, applies immediately.
  const changeDecksCount = (n: number) => {
    setDecksCount(n);
    if (userId) void updateProfileFields(userId, { decks_count: n }).catch(() => {});
  };

  // LAZY BAKE: the owner bakes any deck whose collage cover is missing (null
  // thumbnail_url) — on first display and after add/remove cleared it. One small
  // WebP per deck; graceful (a failed bake just keeps the first-post fallback).
  useEffect(() => {
    if (!isOwn) return;
    const toBake = decks.filter((d) => !d.thumbnail_url && (d.thumbnail_urls?.length ?? 0) > 0 && !bakingRef.current.has(d.id));
    if (!toBake.length) return;
    toBake.forEach((d) => bakingRef.current.add(d.id));
    let dead = false;
    (async () => {
      for (const d of toBake) {
        const url = await bakeAndStoreDeckCover(d.id, d.thumbnail_urls, privyId, ratioForAspect(gridConf.aspect));
        if (!dead && url) setDecks((cur) => cur.map((x) => (x.id === d.id ? { ...x, thumbnail_url: url } : x)));
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks, isOwn, privyId, gridConf.aspect]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, fw, fg, ps, dk, ln, badges] = await Promise.all([
          getProfile(userId),
          getFollowerCount(privyId),
          getFollowingCount(privyId),
          getUserPosts(userId),
          getUserDecks(privyId).catch(() => []),
          getProfileLinks(privyId).catch(() => []),
          economy.getBadges(userId).catch(() => ({} as { firstCutCount?: number })),
        ]);
        if (!alive) return;
        setProfile(p as Record<string, unknown> | null);
        setDecksCount(Number((p as { decks_count?: number } | null)?.decks_count) || 4);
        { const R = resolveLayout(p as Parameters<typeof resolveLayout>[0]); setGridConf({ aspect: R.aspect, count: R.desktopCount }); }
        setFollowers(fw); setFollowing(fg);
        setPosts((ps as unknown as Record<string, unknown>[]) ?? []);
        setDecks(dk); setLinks(ln);
        setFcCount(badges.firstCutCount ?? 0);
        const { supabase } = await import('@/lib/supabase/client');
        // JOINED = users.created_at (no schema change)
        const { data: u } = await supabase.from('users').select('created_at').eq('id', userId).maybeSingle();
        if (u?.created_at) setJoined(new Date(u.created_at).getFullYear().toString());
        // COLLECTORS — distinct collectors of this user's work (the same
        // receipt-true collect events the analytics number counts; one query,
        // no per-coin holder amplification).
        const { data: collectRows } = await supabase.from('notifications').select('sender_id').eq('recipient_id', privyId).eq('type', 'collect');
        setCollectors(new Set((collectRows ?? []).map((r) => r.sender_id)).size);
      } catch (e) { console.error('[desktop-profile] load error:', e); }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [userId, privyId, economy]);

  const name = String(profile?.display_name ?? '');
  const handle = String(profile?.username ?? '');
  // DESKTOP BIO = profiles.short_bio ONLY (minimal by design; the full
  // mobile bio never renders here — absent when unset).
  const bio = String(profile?.short_bio ?? '');
  const pfp = profile?.profile_image_url ? String(profile.profile_image_url) : null;
  const location = profile?.location ? String(profile.location) : null;
  const primaryLink = links.find((l) => (l as { is_primary?: boolean }).is_primary) ?? null;

  const badges = useMemo(() => resolveBadges({
    isFoundingMember: !!profile?.is_founding_member,
    isTopCollector: !!profile?.is_top_collector,
    isScreeningRoomHolder: !!profile?.is_screening_room_holder,
    isPaidMember: profile ? isProMember(profile as { is_paid_member?: boolean; paid_member_until?: string | null }) : false,
    isInHouseCreator: !!profile?.is_in_house_creator,
    firstCutCount: fcCount,
  }).filter((b) => b.framedSrc ?? b.bannerSrc ?? b.src), [profile, fcCount]);
  const srhCount = Math.max(1, Number(profile?.srh_count ?? 0) || 1);

  const sortedPosts = posts; // recent order (SORT BY was a temp control — removed)

  // ── BRIEF 2: the grid → POST SCROLL transform. In-page state (no route).
  // postView = index into sortedPosts; return restores scroll + highlights
  // the viewed cell briefly. reduced-motion: instant swap (layout anim off).
  const [postView, setPostView] = useState<number | null>(null);
  const [returnHighlight, setReturnHighlight] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const reducedMotion = !!useReducedMotion();
  const openPostView = (i: number) => {
    savedScroll.current = scrollerRef.current?.scrollTop ?? 0;
    setPostView(i);
  };
  const closePostView = () => {
    const viewedId = postView != null ? String(sortedPosts[postView]?.id ?? '') : null;
    setPostView(null);
    requestAnimationFrame(() => {
      if (scrollerRef.current) scrollerRef.current.scrollTop = savedScroll.current;
      if (viewedId) { setReturnHighlight(viewedId); window.setTimeout(() => setReturnHighlight(null), 900); }
    });
  };
  // keyboard: Esc returns; ←/→ step (post-scroll mode only)
  useEffect(() => {
    if (postView == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePostView();
      else if (e.key === 'ArrowRight') setPostView((i) => (i != null && i < sortedPosts.length - 1 ? i + 1 : i));
      else if (e.key === 'ArrowLeft') setPostView((i) => (i != null && i > 0 ? i - 1 : i));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postView == null, sortedPosts.length]);


  const stats: [string, string | number][] = [
    ['FOLLOWERS', followers], ['FOLLOWING', following], ['COLLECTORS', collectors],
    ['POSTS', posts.length], ['DECKS', decks.length],
  ];

  // 1440 reference — content scales proportionally; the rail is fixed 71.
  // ONE shared left edge for header + tabs + grid; tightened inset (item 4/7).
  const scaleWrap: React.CSSProperties = { maxWidth: 1369, margin: '0 auto', padding: '0 24px' };

  return (
    <div ref={scrollerRef} className="bg-black" style={{ position: 'fixed', inset: 0, left: 71, overflowY: 'auto' }}>
      <div style={scaleWrap}>

        {/* ═══ HEADER ZONE ═══ */}
        <div style={{ position: 'relative', paddingTop: 36, minHeight: 237, boxSizing: 'border-box' }}> {/* badges (~205) + ~30px air to the divider (Eric: +15) */}
          {/* Pro dividing line — the mobile PFP-side accent, desktop-proportioned
              (Pro only, same conditional). */}
          {/* The frame's x96 hairline TOUCHES the PFP's left edge (183px, exactly
              the PFP height). SHIPPED: Pro-conditional red accent (round 2 item
              6); the frame reads as the Pro treatment — if a base hairline for
              all users is intended, that's a one-line change (flagged). */}
          {profile && isProMember(profile as { is_paid_member?: boolean; paid_member_until?: string | null }) && (
            <div style={{ position: 'absolute', left: 0, top: 23, width: 1.5, height: 146, zIndex: 2, background: 'linear-gradient(180deg, rgba(242,13,13,0.9), rgba(242,13,13,0.25))' }} />
          )}
          {/* PFP — hairline-framed. The header NEVER changes in post-scroll
              (the frame's compressed header was overruled — path deleted). */}
          <div style={{ position: 'absolute', left: 0, top: 23, width: 150, height: 146, border: `1px solid ${HAIR}`, overflow: 'hidden' }}>
            {pfp ? (
              <img src={feedImage(pfp, 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : <div style={{ width: '100%', height: '100%', background: '#141414' }} />}
          </div>

          {/* Text block ANCHORED to the PFP: name cap-height starts at the PFP's
              top line (frame: PFP y25/name y33 — top 27 ≈ cap at 33 after the
              ascender gap). Frame rhythm: handle tight beneath (~25px pitch). */}
          <div style={{ position: 'absolute', left: 177, top: 17, right: 0 }}>
            <p style={{ ...SKB, fontSize: 24, color: '#FFF', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: 0, lineHeight: 1 }}>{name}</p>
            <p style={{ ...SKB, fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', margin: '4.6px 0 0' }}>{handle ? `@${handle}` : ''}</p>
            {bio && <p style={{ ...SKR, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: '10px 0 0', maxWidth: 320 }}>{bio}</p>}

            {/* META ROW — location · primary link · joined (frame ~y140) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, margin: '26px 0 0' }}>
              {location && (
                <span style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.6"><path d="M12 21s-6.5-5.4-6.5-10.5A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.5C18.5 15.6 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></svg>
                  {location}
                </span>
              )}
              {primaryLink && (
                <a href={primaryLink.url} target="_blank" rel="noopener noreferrer" style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.6"><path d="M10 14l7-7M13 5h6v6M11 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
                  {primaryLink.title || primaryLink.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 28)}
                </a>
              )}
              {joined && (
                <span style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>JOINED {joined}</span>
              )}
            </div>
            <div style={{ height: 1, width: 496, maxWidth: '100%', background: HAIR, margin: '22px 0 0' }} /> {/* the line belongs to the stats row's top */}

            {/* STATS ROW — values over red labels, 33px hairline dividers */}
            <div style={{ display: 'flex', alignItems: 'stretch', margin: '6px 0 0' }}>
              {stats.map(([label, value], i) => (
                <div key={label} style={{ display: 'flex', alignItems: 'stretch' }}>
                  {i > 0 && <div style={{ width: 1, height: 33, background: HAIR, margin: '4px 22px 0' }} />}
                  <div>
                    <p style={{ ...SKB, fontSize: 12, color: '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                    <p style={{ ...SKB, fontSize: 9, color: 'rgba(242,13,13,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 0' }}>{label}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* TOP-RIGHT cluster — MESSAGE (public) then the ⓘ box, 10px gap.
              Own profile: ⓘ alone (editing lives in Settings). */}
          <div style={{ position: 'absolute', right: 0, top: 17, display: 'flex', alignItems: 'center', gap: 10 }}> {/* tops level with the name */}
            {!isOwn && SHOW_MESSAGE_BUTTON && (
              /* Public profiles only (own = correctly absent). Full-white per the
                 frame; tap → the DM surface with this user's thread active. */
              <button onClick={() => router.push(`/dm/${encodeURIComponent(handle)}`)} aria-label={`Message @${handle}`} style={{ ...SKB, fontSize: 11, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em', width: 123, height: 33, borderRadius: 4, border: '0.5px solid rgba(255,255,255,0.3)', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                {/* red dot kept as a live accent (the DM status colour). */}
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f20d0d', display: 'inline-block' }} />
                MESSAGE
              </button>
            )}
            <button onClick={() => setInfoOpen(true)} aria-label="Profile info" style={{ width: 34, height: 33, borderRadius: 4, border: '0.5px solid rgba(255,255,255,0.3)', background: 'transparent', cursor: 'pointer', ...SKB, fontSize: 13, color: '#FFF' }}>
              <span>i</span> {/* upright — the frame's rotation was an authoring artifact */}
            </button>
          </div>

          {/* ═══ BADGES (right side) ═══ */}
          <div style={{ position: 'absolute', right: 0, top: 92 }}>
            <button onClick={() => setBadgesOpen(true)} style={{ ...SKB, fontSize: 13, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 10px', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'block' }}>BADGES</button>
            <div style={{ display: 'flex', gap: 8 }}>
              {badges.slice(0, badges.length > 5 ? 4 : 5).map((b) => {
                const count = b.key === 'firstCut' ? Math.max(1, fcCount) : b.key === 'srh' ? srhCount : null;
                return (
                  <div key={b.key} className="tappable" onClick={() => setBadgesOpen(true)} style={{ position: 'relative', width: 78, height: 99, cursor: 'pointer' }}>
                    <img src="/badges/desktop-profile-badge-backdrop-v1.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
                    {/* UNFRAMED (desktop): the min-design no-background set — the backdrop
                        card IS the frame (frame-in-frame was redundant); mobile keeps framed. */}
                    <img src={(b.bannerSrc ?? b.src) as string} alt={b.title} style={{ position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)', width: 40, height: 40, objectFit: 'contain' }} />
                    {count != null && (
                      <span style={{ position: 'absolute', left: '50%', top: 52, transform: 'translateX(-50%)', background: '#0b0b0b', border: '1px solid transparent', borderRadius: 4.5, minWidth: 20, boxSizing: 'border-box', textAlign: 'center', padding: '0 7px', lineHeight: 1.25, ...SKB, fontSize: 9, color: '#FFF', fontVariantNumeric: 'tabular-nums', backgroundImage: 'linear-gradient(#0b0b0b, #0b0b0b), linear-gradient(180deg, #8f3a3a, #5d2020)', backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box' }}>
                        {count}
                      </span>
                    )}
                    <span style={{ position: 'absolute', left: 0, right: 0, bottom: 10, textAlign: 'center', ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {b.key === 'top1k' ? 'COLLECTOR' : b.title}
                    </span>
                  </div>
                );
              })}
              {badges.length > 5 && (
                <button onClick={() => setBadgesOpen(true)} style={{ position: 'relative', width: 78, height: 99, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <img src="/badges/desktop-profile-badge-backdrop-v1.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
                  <span style={{ position: 'relative', ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.46)', textTransform: 'uppercase' }}>+{badges.length - 4} MORE</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: HAIR, margin: '0 -100vw 0 -100vw', paddingLeft: '100vw', paddingRight: '100vw' }} />

        {/* ═══ TAB ROW (y285) ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 52, padding: '18px 0 12px' }}>
          {(['portfolio', 'collected', 'decks'] as Tab[]).map((t) => {
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)} style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 8px', ...SKB, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: active ? '#FFF' : 'rgba(255,255,255,0.5)' }}>
                {t.toUpperCase()}
                {active && <span style={{ position: 'absolute', left: 0, bottom: 0, width: 45, height: 1, background: `linear-gradient(90deg, ${RED} 0%, #FFF 55%, ${RED} 100%)` }} />}
              </button>
            );
          })}
          {/* THEATRE eye — the FOURTH tab-row element (frame ~x487), even spacing */}
          <button onClick={() => setTheatreOpen(true)} aria-label="Theatre mode" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
            <img src="/theatre-mode-eye-framed-v2.png" alt="" style={{ height: 22, width: 'auto', display: 'block', opacity: 0.92 }} />
          </button>
          {/* grid-mode icon slot (frame x487) — BRIEF 2 (post-scroll mode); unbuilt */}
        </div>

        {/* ═══ CONTENT ═══ */}
        {/* 3-red-box return — directly UNDER the PORTFOLIO title (frame y304) */}
        {postView != null && (
          <div style={{ margin: '-6px 0 2px' }}>
            <button onClick={closePostView} aria-label="Back to grid" style={{ display: 'inline-flex', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 18, height: 12, border: '0.5px solid #f20d0d', display: 'inline-block' }} />
              ))}
            </button>
          </div>
        )}

        {tab === 'portfolio' && postView == null && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridConf.count}, 1fr)`, gap: 4, paddingBottom: 80 }}>
            {sortedPosts.map((p, i) => {
              const src = (p.poster_url as string) || (p.thumbnail_url as string) || ((p.media_urls as string[])?.[0] ?? '');
              const pid = String(p.id);
              return (
                <motion.button
                  key={pid}
                  data-no-pop
                  layoutId={reducedMotion ? undefined : `dpost-${pid}`}
                  transition={{ layout: { duration: 0.18, ease: 'easeOut' } }}
                  initial={false}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                  onClick={() => openPostView(i)}
                  style={{ position: 'relative', aspectRatio: `${ratioForAspect(gridConf.aspect)}`, overflow: 'hidden', background: '#101010', border: 'none', cursor: 'pointer', padding: 0, outline: returnHighlight === pid ? '1px solid rgba(242,13,13,0.65)' : 'none', transition: 'outline-color 400ms ease' }}
                >
                  {p.media_type === 'video' ? (
                    /* living tile — the established treatment (was a static poster:
                       desktop grid had NO video element at all). Muted, gated,
                       gridMode = 0-bytes off-screen. */
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
                    src && <img src={feedImage(src, 600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                  {/* Pinned indicator — small white push-pin, top-right (mirrors mobile PostCell). */}
                  {!!p.is_pinned && (
                    <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 3, pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.75))' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
                        <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
                      </svg>
                    </div>
                  )}
                </motion.button>
              );
            })}
            {loaded && sortedPosts.length === 0 && (
              isOwn ? (
                <button onClick={() => router.push('/create')} style={{ gridColumn: `span ${gridConf.count}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: 'transparent', border: 'none', cursor: 'pointer', padding: '90px 0 100px' }}>
                  {/* large, delicate crosshair plus — 1px stroke, viewfinder-thin */}
                  <svg width="88" height="88" viewBox="0 0 88 88" fill="none" style={{ display: 'block' }}>
                    <path d="M44 6V82M6 44H82" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
                  </svg>
                  <span style={{ ...SKB, fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>CREATE YOUR FIRST POST</span>
                </button>
              ) : (
                <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', gridColumn: `span ${gridConf.count}`, padding: '40px 0', textAlign: 'center' }}>NO POSTS YET</p>
              )
            )}
          </div>
        )}
        {tab === 'portfolio' && postView != null && sortedPosts[postView] && (
          <DesktopPostView
            posts={sortedPosts}
            index={postView}
            onStep={(dir) => setPostView((i) => {
              if (i == null) return i;
              const n = i + dir;
              return n < 0 || n >= sortedPosts.length ? i : n; // rubber-band
            })}
            location={location}
          />
        )}
        {tab === 'collected' && (
          <div style={{ paddingBottom: 80 }}>
            {/* v1: the existing collected surface in the desktop column — the
                full desktop REPERTORY design is a later brief. */}
            <CollectedGrid userId={userId} isOwn={isOwn} />
          </div>
        )}
        {tab === 'decks' && (
          // DESKTOP DECKS: a full grid (default 4-across; per-user 3|4|5 via the
          // header control). Cover = the BAKED collage (thumbnail_url) → first post
          // → cover_image_url → placeholder. CREATE DECK is the first card (own).
          // Tapping a deck → the existing deck route (v1 presents as the current
          // deck page; a dedicated desktop deck view is a follow-up).
          <div style={{ paddingBottom: 80 }}>
            {/* count control (own profile only) — the decks-tab header */}
            {isOwn && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, margin: '0 0 16px' }}>
                <span style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>ACROSS</span>
                {[3, 4, 5].map((n) => (
                  <button key={n} onClick={() => changeDecksCount(n)} style={{ ...SKB, fontSize: 11, width: 24, height: 24, color: decksCount === n ? '#000' : 'rgba(255,255,255,0.6)', background: decksCount === n ? '#FFF' : 'transparent', border: `1px solid ${decksCount === n ? '#FFF' : HAIR}`, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>{n}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${decksCount}, 1fr)`, gap: 16 }}>
              {isOwn && (
                <button onClick={() => setDeckCreateOpen(true)} style={{ aspectRatio: `${ratioForAspect(gridConf.aspect)}`, border: `1px dashed ${HAIR}`, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <svg width="34" height="34" viewBox="0 0 34 34" fill="none"><path d="M17 6v22M6 17h22" stroke="rgba(255,255,255,0.7)" strokeWidth="1" /></svg>
                  <span style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>CREATE DECK</span>
                </button>
              )}
              {decks.map((d) => {
                const fallback = d.thumbnail_urls?.[0] || d.cover_image_url || null;
                const coverSrc = d.thumbnail_url || (fallback ? feedImage(fallback as string, 600) : null); // baked WebP is already display-sized
                return (
                  <button key={d.id} onClick={() => router.push(`/profile/${handle}/decks/${d.id}`)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', display: 'block' }}>
                    <div style={{ aspectRatio: `${ratioForAspect(gridConf.aspect)}`, overflow: 'hidden', background: '#101010', border: `1px solid ${HAIR}` }}>
                      {coverSrc && <img src={coverSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    </div>
                    <p style={{ ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '9px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</p>
                    <p style={{ ...SKR, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '3px 0 0' }}>{d.item_count} {d.item_count === 1 ? 'POST' : 'POSTS'}</p>
                  </button>
                );
              })}
              {decks.length === 0 && !isOwn && <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', gridColumn: `span ${decksCount}`, padding: '40px 0', textAlign: 'center' }}>NO DECKS YET</p>}
            </div>
          </div>
        )}
      </div>

      {theatreOpen && (
        <TheatreMode posts={sortedPosts as Record<string, unknown>[]} source="profile" onClose={() => setTheatreOpen(false)} />
      )}

      {/* CREATE DECK — desktop-presented modal → the existing createDeck flow,
          then straight into the new deck (matches mobile's create entry). */}
      {deckCreateOpen && createPortal(
        <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 680, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeckCreateOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />
          <div style={{ position: 'relative', width: 460, background: '#000', border: '1px solid #1a1a1a', padding: '30px 32px' }}>
            <h2 style={{ ...SKB, fontSize: 15, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 18px' }}>NEW DECK</h2>
            <input
              autoFocus value={newDeckTitle} onChange={(e) => setNewDeckTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submitDeck(); }}
              placeholder="DECK TITLE"
              style={{ ...SKR, width: '100%', fontSize: 14, color: '#FFF', background: 'transparent', border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none', padding: '8px 0', letterSpacing: '0.04em', boxSizing: 'border-box' }}
            />
            <input
              value={newDeckDesc} onChange={(e) => setNewDeckDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submitDeck(); }}
              placeholder="DESCRIPTION (OPTIONAL)"
              style={{ ...SKR, width: '100%', fontSize: 13, color: 'rgba(255,255,255,0.75)', background: 'transparent', border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none', padding: '8px 0', margin: '10px 0 0', letterSpacing: '0.04em', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setDeckCreateOpen(false)} style={{ ...SKB, flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: '12px 0' }}>CANCEL</button>
              <button onClick={() => void submitDeck()} disabled={!newDeckTitle.trim() || creatingDeck} style={{ ...SKB, flex: 1, fontSize: 11, color: '#000', textTransform: 'uppercase', letterSpacing: '0.08em', background: newDeckTitle.trim() ? '#FFF' : 'rgba(255,255,255,0.3)', border: 'none', cursor: newDeckTitle.trim() ? 'pointer' : 'default', padding: '12px 0' }}>{creatingDeck ? 'CREATING…' : 'CREATE'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {/* Desktop lightbox v1: PostModal (portaled) renders as the full overlay —
          acceptable centered presentation for v1. */}
      {openPost && <PostModal post={openPost as any} onClose={() => setOpenPost(null)} />}
      {/* Desktop bio SHEET — the personal-site treatment (replaces ProfileDataSheet). */}
      {infoOpen && (
        <DesktopBioSheet
          profile={profile}
          isOwn={isOwn}
          links={links}
          badges={badges}
          posts={posts}
          followers={followers}
          following={following}
          collectors={collectors}
          totalPosts={posts.length}
          firstCutCount={fcCount}
          onClose={() => setInfoOpen(false)}
          onViewBadges={() => { setInfoOpen(false); setBadgesOpen(true); }}
          onMessage={() => { setInfoOpen(false); router.push(`/dm/${encodeURIComponent(handle)}`); }}
        />
      )}
      {badgesOpen && (
        <DesktopBadgesSheet
          flags={{
            isPaidMember: profile ? isProMember(profile as { is_paid_member?: boolean; paid_member_until?: string | null }) : false,
            isFoundingMember: !!profile?.is_founding_member,
            isTopCollector: !!profile?.is_top_collector,
            isScreeningRoomHolder: !!profile?.is_screening_room_holder,
            isInHouseCreator: !!profile?.is_in_house_creator,
            firstCutCount: fcCount,
          }}
          isOwn={isOwn}
          onClose={() => setBadgesOpen(false)}
        />
      )}
    </div>
  );
}
