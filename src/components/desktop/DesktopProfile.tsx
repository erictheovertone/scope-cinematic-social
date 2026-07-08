'use client';
// ── DESKTOP PROFILE — Figma 229:455 at the 1440 reference ─────────────────────
//
// One component, own + public (isOwn gating), self-fetching via the existing
// services so the mobile pages stay untouched. The rail (71px) is global; this
// renders the content column. Static layout only — the grid→post-scroll
// transform is BRIEF 2 (the grid-mode icon slot stays unbuilt).

import { useEffect, useMemo, useState } from 'react';
import {
  getProfile, getFollowerCount, getFollowingCount, getUserDecks, getProfileLinks,
  isProMember, type ProfileLink, type Deck,
} from '@/lib/userService';
import { getUserPosts } from '@/lib/postsService';
import { useEconomy } from '@/components/EconomyProvider';
import { resolveBadges } from '@/lib/economy/badges';
import { feedImage } from '@/lib/mediaUrl';
import PostModal from '@/components/PostModal';
import ProfileDataSheet from '@/components/ProfileDataSheet';
import BadgeExplainerSheet from '@/components/BadgeExplainerSheet';
import CollectedGrid from '@/components/economy/CollectedGrid';
import TheatreMode from '@/components/TheatreMode';
import DesktopPostView from '@/components/desktop/DesktopPostView';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(255,255,255,0.14)';
const RED = '#f20d0d';

// DM button: rendered DISABLED behind this flag (Eric decides on sight —
// flip to false to hide entirely). DMs are their own upcoming build.
const SHOW_INERT_MESSAGE_BUTTON = true;

interface Props {
  /** Supabase users.id of the PROFILE user. */
  userId: string;
  /** The profile user's privy DID (for the follower/link services). */
  privyId: string;
  isOwn: boolean;
}

type Tab = 'portfolio' | 'collected' | 'decks';

export default function DesktopProfile({ userId, privyId, isOwn }: Props) {
  const economy = useEconomy();

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [posts, setPosts] = useState<Record<string, unknown>[]>([]);
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
  const [msgToast, setMsgToast] = useState(false);

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
  }).filter((b) => b.framedSrc ?? b.bannerSrc), [profile, fcCount]);
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
        <div style={{ position: 'relative', paddingTop: 36, minHeight: 222, boxSizing: 'border-box' }}> {/* the BADGES define the zone's minimum: cards+labels+markers (~205) + ~15px air; still 37px tighter than the original 259 */}
          {/* Pro dividing line — the mobile PFP-side accent, desktop-proportioned
              (Pro only, same conditional). */}
          {/* The frame's x96 hairline TOUCHES the PFP's left edge (183px, exactly
              the PFP height). SHIPPED: Pro-conditional red accent (round 2 item
              6); the frame reads as the Pro treatment — if a base hairline for
              all users is intended, that's a one-line change (flagged). */}
          {profile && isProMember(profile as { is_paid_member?: boolean; paid_member_until?: string | null }) && (
            <div style={{ position: 'absolute', left: 0, top: 23, width: 1.5, height: 146, zIndex: 2, background: 'linear-gradient(180deg, rgba(242,13,13,0.9), rgba(242,13,13,0.25))' }} />
          )}
          {/* PFP — hairline-framed. In post-scroll mode it COMPRESSES into the
              43-wide BADGE RAIL (gradient strip, badges stacked small, divider
              at its right edge) — one motion with the grid morph. */}
          <motion.div
            animate={{ width: postView != null ? 43 : 150 }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 42 }}
            style={{ position: 'absolute', left: 0, top: 23, height: 146, border: `1px solid ${HAIR}`, borderRight: postView != null ? `1px solid rgba(255,255,255,0.3)` : `1px solid ${HAIR}`, overflow: 'hidden', background: postView != null ? 'linear-gradient(180deg, rgba(12,12,12,0.9), rgba(51,48,48,0.9))' : 'transparent' }}
          >
            {postView == null ? (
              pfp ? (
                <img src={feedImage(pfp, 400)} alt="" style={{ width: 150, height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : <div style={{ width: 150, height: '100%', background: '#141414' }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 10 }}>
                {badges.slice(0, 5).map((b) => (
                  <img key={b.key} src={(b.bannerSrc ?? b.src) as string} alt={b.title} style={{ width: 20, height: 20, objectFit: 'contain', display: 'block' }} />
                ))}
              </div>
            )}
          </motion.div>

          {/* Text block ANCHORED to the PFP: name cap-height starts at the PFP's
              top line (frame: PFP y25/name y33 — top 27 ≈ cap at 33 after the
              ascender gap). Frame rhythm: handle tight beneath (~25px pitch). */}
          <motion.div
            animate={{ left: postView != null ? 107 : 177 }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 42 }}
            style={{ position: 'absolute', left: 214, top: 17, right: 0 }}
          >
            <p style={{ ...SKB, fontSize: 24, color: '#FFF', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: 0, lineHeight: 1 }}>{name}</p>
            <p style={{ ...SKB, fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', margin: '3px 0 0' }}>{handle ? `@${handle}` : ''}</p>
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

          </motion.div>

          {/* TOP-RIGHT cluster — MESSAGE (public, inert v1) then the ⓘ box,
              10px gap. Own profile: ⓘ alone (editing lives in Settings). */}
          <div style={{ position: 'absolute', right: 0, top: 36, display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isOwn && SHOW_INERT_MESSAGE_BUTTON && (
              /* Public profiles only (own = correctly absent — the round-2 shot
                 showed it rendering on public; the 45% disabled text read as
                 missing). Full-white per the frame; tap → COMING SOON toast. */
              <button onClick={() => { setMsgToast(true); window.setTimeout(() => setMsgToast(false), 1800); }} aria-label="Messages coming soon" style={{ ...SKB, fontSize: 11, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em', width: 123, height: 33, borderRadius: 4, border: '0.5px solid rgba(255,255,255,0.3)', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E08A', display: 'inline-block' }} />
                MESSAGE
              </button>
            )}
            {msgToast && (
              <span style={{ position: 'absolute', top: 40, right: 0, ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em', background: '#0b0b0b', border: '1px solid rgba(255,255,255,0.18)', padding: '6px 10px', whiteSpace: 'nowrap' }}>
                MESSAGES · COMING SOON
              </span>
            )}
            <button onClick={() => setInfoOpen(true)} aria-label="Profile info" style={{ width: 34, height: 33, borderRadius: 4, border: '0.5px solid rgba(255,255,255,0.3)', background: 'transparent', cursor: 'pointer', ...SKB, fontSize: 13, color: '#FFF' }}>
              <span>i</span> {/* upright — the frame's rotation was an authoring artifact */}
            </button>
          </div>

          {/* ═══ BADGES (right side) ═══ */}
          <div style={{ position: 'absolute', right: 0, top: 92 }}>
            <p style={{ ...SKB, fontSize: 13, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 10px' }}>BADGES</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {badges.slice(0, badges.length > 5 ? 4 : 5).map((b) => {
                const count = b.key === 'firstCut' ? Math.max(1, fcCount) : b.key === 'srh' ? srhCount : null;
                return (
                  <div key={b.key} onClick={() => setBadgesOpen(true)} style={{ position: 'relative', width: 78, height: 99, cursor: 'pointer' }}>
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
          {postView != null && (
            /* the 3-red-box return — reverses the morph (grid restored) */
            <button onClick={closePostView} aria-label="Back to grid" style={{ display: 'inline-flex', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 18, height: 12, border: '0.5px solid #f20d0d', display: 'inline-block' }} />
              ))}
            </button>
          )}
          {/* THEATRE — far right (SORT BY's old seat; sort was temp, removed) */}
          <button onClick={() => setTheatreOpen(true)} aria-label="Theatre mode" style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
            <img src="/theatre-mode-eye-framed-v2.png" alt="" style={{ height: 22, width: 'auto', display: 'block', opacity: 0.92 }} />
          </button>
          {/* grid-mode icon slot (frame x487) — BRIEF 2 (post-scroll mode); unbuilt */}
        </div>

        {/* ═══ CONTENT ═══ */}
        {tab === 'portfolio' && postView == null && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, paddingBottom: 80 }}>
            {sortedPosts.map((p, i) => {
              const src = (p.poster_url as string) || (p.thumbnail_url as string) || ((p.media_urls as string[])?.[0] ?? '');
              const pid = String(p.id);
              return (
                <motion.button
                  key={pid}
                  layoutId={reducedMotion ? undefined : `dpost-${pid}`}
                  initial={false}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                  onClick={() => openPostView(i)}
                  style={{ position: 'relative', aspectRatio: '2.75 / 1', overflow: 'hidden', background: '#101010', border: 'none', cursor: 'pointer', padding: 0, outline: returnHighlight === pid ? '1px solid rgba(242,13,13,0.65)' : 'none', transition: 'outline-color 400ms ease' }}
                >
                  {src && <img src={feedImage(src, 600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                </motion.button>
              );
            })}
            {sortedPosts.length === 0 && <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', gridColumn: 'span 4', padding: '40px 0', textAlign: 'center' }}>NO POSTS YET</p>}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, paddingBottom: 80 }}>
            {decks.map((d) => (
              <div key={d.id} style={{ position: 'relative', aspectRatio: '2.75 / 1', overflow: 'hidden', background: '#101010' }}>
                {(d.cover_image_url || d.thumbnail_urls?.[0]) && (
                  <img src={feedImage((d.cover_image_url || d.thumbnail_urls[0]) as string, 600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.85 }} />
                )}
                <span style={{ position: 'absolute', left: 10, bottom: 8, ...SKB, fontSize: 11, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d.title}</span>
              </div>
            ))}
            {decks.length === 0 && <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', gridColumn: 'span 4', padding: '40px 0', textAlign: 'center' }}>NO DECKS YET</p>}
          </div>
        )}
      </div>

      {theatreOpen && (
        <TheatreMode posts={sortedPosts as Record<string, unknown>[]} source="profile" onClose={() => setTheatreOpen(false)} />
      )}
      {/* Desktop lightbox v1: PostModal (portaled) renders as the full overlay —
          acceptable centered presentation for v1. */}
      {openPost && <PostModal post={openPost as any} onClose={() => setOpenPost(null)} />}
      <ProfileDataSheet
        isOpen={infoOpen}
        onClose={() => setInfoOpen(false)}
        profile={profile as any}
        links={links}
        isOwnProfile={isOwn}
        followers={followers}
        following={following}
        totalPosts={posts.length}
        collectors={collectors}
        firstCutCount={fcCount}
      />
      <BadgeExplainerSheet
        visible={badgesOpen}
        onClose={() => setBadgesOpen(false)}
        onJoinPress={() => setBadgesOpen(false)}
        userTiers={{
          isFree: true,
          isInHouseCreator: !!profile?.is_in_house_creator,
          isPaidMember: profile ? isProMember(profile as { is_paid_member?: boolean; paid_member_until?: string | null }) : false,
          isTopCollector: !!profile?.is_top_collector,
          isScreeningRoomHolder: !!profile?.is_screening_room_holder,
          isFoundingMember: !!profile?.is_founding_member,
          foundingMemberNumber: (profile?.founding_member_number as number) ?? null,
        }}
      />
    </div>
  );
}
