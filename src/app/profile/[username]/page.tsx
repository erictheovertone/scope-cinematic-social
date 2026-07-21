"use client";

import { useState, useEffect, useRef } from "react";
import DesktopProfile from '@/components/desktop/DesktopProfile';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { createPortal } from "react-dom";
import { feedImage } from "@/lib/mediaUrl";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  resolveProfileByUsername, getUserById, followUser, unfollowUser,
  isFollowing, getFollowerCount, getFollowingCount,
  getDecksByUsername, getProfileLinks, isProMember, type Deck, type ProfileLink,
} from "@/lib/userService";
import ProfileDataSheet from "@/components/ProfileDataSheet";
import { getUserPosts } from "@/lib/postsService";
import ProfilePostViewer from "@/components/ProfilePostViewer";
import FollowListModal from "@/components/FollowListModal";
import BadgeExplainerSheet from "@/components/BadgeExplainerSheet";
import MembershipSheet from "@/components/MembershipSheet";
import BottomToolbar from "@/components/BottomToolbar";
import MediaRenderer from "@/components/MediaRenderer";
import PostCell from "@/components/PostCell";
import { getColCount } from "@/lib/aspectRatio";
import { resolveLayout, legacyLayoutId } from "@/lib/layoutModel";
import FrameLoader from "@/components/FrameLoader";
import BadgeCluster from "@/components/BadgeCluster";
import ProfileHeader from "@/components/profile/ProfileHeader";
import { resolveBadges } from "@/lib/economy/badges";
import { dividerBackground } from "@/lib/economy/dividerLines";
import { useEconomy } from "@/components/EconomyProvider";
import CollectedGrid from "@/components/economy/CollectedGrid";
import TheatreMode from "@/components/TheatreMode";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = usePrivy();
  const username = params?.username as string;

  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"main" | "decks" | "theatre" | "collected">("main");
  const [profileDataOpen, setProfileDataOpen] = useState(false);
  const [showDecks, setShowDecks] = useState(false);
  const [publicDecks, setPublicDecks] = useState<(Deck & { item_count: number; thumbnail_urls: string[] })[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [profileLinks, setProfileLinks] = useState<ProfileLink[]>([]);
  const [showBadgeSheet, setShowBadgeSheet] = useState(false);
  const [showMembershipSheet, setShowMembershipSheet] = useState(false);

  // Follow state
  const [targetPrivyId, setTargetPrivyId] = useState<string | null>(null);
  const [followingUser, setFollowingUser] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  // FOLLOW feedback: instant red confirm (justFollowed holds the button through
  // the beat before the existing followed-state removes it) + a flyer that arcs
  // to the ⓘ, which pulses on landing. Cosmetic only — never blocks/reports.
  const [justFollowed, setJustFollowed] = useState(false);
  const [flyer, setFlyer] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [iPulse, setIPulse] = useState(false);
  const followBtnRef = useRef<HTMLButtonElement>(null);
  const infoBtnRef = useRef<HTMLButtonElement>(null);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);

  // Badge state
  const [isPaidMember, setIsPaidMember] = useState(false);
  const [isTopCollector, setIsTopCollector] = useState(false);
  const [isInHouseCreator, setIsInHouseCreator] = useState(false);
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [isScreeningRoomHolder, setIsScreeningRoomHolder] = useState(false); // SRH (cron-awarded)
  // First Cut coin for the VIEWED user's stack — boundary-only, preview-gated.
  const economy = useEconomy();
  const [firstCutCount, setFirstCutCount] = useState(0);
  const [composerTrackCount, setComposerTrackCount] = useState(0);
  useEffect(() => {
    const uid = profile?.user_id;
    // First Cut is a REAL, table-backed award — not preview/mock data — so it is
    // NOT gated behind the economy-preview flag (which hid the resolving badge).
    if (!uid) { setFirstCutCount(0); setComposerTrackCount(0); return; }
    let cancelled = false;
    economy.getBadges(uid)
      .then((b) => { if (!cancelled) { setFirstCutCount(b.firstCutCount ?? 0); setComposerTrackCount(b.composerTrackCount ?? 0); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [economy, profile?.user_id]);
  const [foundingMemberNumber, setFoundingMemberNumber] = useState<number | null>(null);
  const [paidMemberUntil, setPaidMemberUntil] = useState<Date | null>(null);

  // Scroll animation
  const isDesktop = useIsDesktop();
  const [gridScrollY, setGridScrollY] = useState(0);
  useEffect(() => { setGridScrollY(0); }, [activeTab]);
  const [headerSnapped, setHeaderSnapped] = useState(false);
  const [headerUnsnapping, setHeaderUnsnapping] = useState(false);
  const [snapAnimKey, setSnapAnimKey] = useState(0);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const rafPendingRef = useRef(false);
  const snapScrollYRef = useRef(0);
  const dismissSnapMenu = () => {
    setHeaderUnsnapping(true);
    setTimeout(() => {
      setHeaderSnapped(false);
      setTimeout(() => setHeaderUnsnapping(false), 50);
    }, 500);
  };
  // Brief F6 — measured header (matches own-profile 2.2d): headerH arrives from
  // <ProfileHeader> onMeasure and drives the tab anchor + grid spacer, replacing the
  // old fixed height:124 / magic 101·103·140.
  const [headerH, setHeaderH] = useState(120);
  const TAB_ROW_H = 42;
  const tabAnchor = headerH + 8;
  const tabCap = tabAnchor - 2;
  const gridSpacer = tabAnchor + TAB_ROW_H + 6;
  const headerOpacity = Math.max(0, 1 - gridScrollY / 20);
  const tabRowOffset = Math.min(gridScrollY, tabCap);

  useEffect(() => {
    if (!showDecks || !username) return;
    setDecksLoading(true);
    getDecksByUsername(username).then(d => setPublicDecks(d as any)).catch(console.error).finally(() => setDecksLoading(false));
  }, [showDecks, username]);

  // Footer pill stands down while the DECKS pull-up is open (takeover discipline —
  // the hide-list must cover EVERY decks sheet, this public one included).
  useEffect(() => {
    if (!showDecks) return;
    document.documentElement.dataset.suiteOpen = '1';
    window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    return () => {
      delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    };
  }, [showDecks]);

  useEffect(() => {
    if (headerSnapped && !headerUnsnapping && (gridScrollY > snapScrollYRef.current + 30 || gridScrollY < 20)) setHeaderSnapped(false);
  }, [gridScrollY, headerSnapped, headerUnsnapping]);

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      try {
        const { profile: p, redirectTo } = await resolveProfileByUsername(username);
        if (!p) { setNotFound(true); setLoaded(true); return; }
        if (redirectTo) { router.replace(`/profile/${redirectTo}`); return; }
        setProfile(p);

        // Badge flags
        const memberUntil = p.paid_member_until ? new Date(p.paid_member_until) : null;
        setIsPaidMember(isProMember(p as any));
        setPaidMemberUntil(memberUntil);
        setIsTopCollector(p.is_top_collector || false);
        setIsInHouseCreator(p.is_in_house_creator || false);
        setIsFoundingMember(p.is_founding_member || false);
        setIsScreeningRoomHolder((p as any).is_screening_room_holder || false);
        setFoundingMemberNumber(p.founding_member_number || null);

        const [userPosts, targetUser] = await Promise.all([
          getUserPosts(p.user_id),
          getUserById(p.user_id),
        ]);
        setPosts(userPosts);

        if (targetUser) {
          setTargetPrivyId(targetUser.privy_id);
          getProfileLinks(targetUser.privy_id).then(setProfileLinks).catch(() => {});
          const [fc, fgc] = await Promise.all([getFollowerCount(targetUser.privy_id), getFollowingCount(targetUser.privy_id)]);
          setFollowerCount(fc);
          setFollowingCount(fgc);
          if (user) {
            const isF = await isFollowing(user.id, targetUser.privy_id);
            setFollowingUser(isF);
          }
        }
      } catch (e) {
        console.error("Error loading public profile:", e);
        setNotFound(true);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, [username, user?.id]);

  const handleFollow = async () => {
    if (!user || !targetPrivyId || followLoading) return;
    setFollowLoading(true);
    try {
      if (followingUser) {
        await unfollowUser(user.id, targetPrivyId);
        setFollowingUser(false);
        setFollowerCount(c => c - 1);
      } else {
        // OPTIMISTIC red confirm + the fly-to-ⓘ (reverts on failure below).
        setFollowingUser(true);
        setFollowerCount((c) => c + 1);
        setJustFollowed(true);
        window.setTimeout(() => setJustFollowed(false), 950);
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const from = followBtnRef.current?.getBoundingClientRect();
        const to = infoBtnRef.current?.getBoundingClientRect();
        if (!reduced && from && to) {
          setFlyer({ x: from.left + from.width / 2, y: from.top + from.height / 2,
                     dx: (to.left + to.width / 2) - (from.left + from.width / 2),
                     dy: (to.top + to.height / 2) - (from.top + from.height / 2) });
          window.setTimeout(() => { setFlyer(null); setIPulse(true); window.setTimeout(() => setIPulse(false), 320); }, 560);
        }
        try {
          await followUser(user.id, targetPrivyId);
        } catch (err) {
          // Revert the optimistic state — the animation was cosmetic.
          setFollowingUser(false);
          setFollowerCount((c) => Math.max(0, c - 1));
          setJustFollowed(false);
          throw err;
        }
      }
    } catch (e) { console.error("Follow error:", e); }
    finally { setFollowLoading(false); }
  };

  const isOwnProfile = user && targetPrivyId && user.id === targetPrivyId;
  // SHARED model: the grid AR is the resolved shared aspect × mobile count (the
  // one resolver), so an AR set on EITHER surface shows here — not the stale
  // legacy grid_layout string alone.
  const _rl = resolveLayout(profile as Parameters<typeof resolveLayout>[0]);
  const layoutId = profile ? legacyLayoutId(_rl.aspect, _rl.mobileCount) : "1x-scope";
  const getDeckAspect = (gl?: string | null) => {
    if (!gl) return '2.39 / 1';
    switch (gl) {
      case '2x-pana': case '1x-pana': return '2.75 / 1';
      case '2x-scope': case '1x-scope': return '2.39 / 1';
      case '2x-cine': case '1x-cine': return '1.85 / 1';
      case '3x-legacy': return '4 / 3';
      default:
        if (gl.includes('16:9') || gl.includes('16-9')) return '16 / 9';
        if (gl.includes('4:3') || gl.includes('4-3')) return '4 / 3';
        return '2.39 / 1';
    }
  };
  const thumbCols = (n: number) => n <= 1 ? '1fr' : n <= 4 ? '1fr 1fr' : '1fr 1fr 1fr';

  if (loaded && notFound) return (
    <div className="bg-black w-full app-shell screen-min mx-auto flex items-center justify-center">
      <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: "#E5E1DB" }}>PROFILE NOT FOUND</p>
    </div>
  );

  if (!loaded) return (
    <div className="bg-black w-full app-shell screen-min mx-auto flex items-center justify-center">
      <FrameLoader variant="page" />
    </div>
  );

  // ── DESKTOP SEAM (Brief 1) — same component, isOwn gating. ──
  if (isDesktop) {
    return profile?.user_id && targetPrivyId
      ? <DesktopProfile userId={profile.user_id} privyId={targetPrivyId} isOwn={!!isOwnProfile} />
      : <div className="bg-black" style={{ position: 'fixed', inset: 0 }} />;
  }

  return (
    <div className="bg-black relative w-full app-shell screen-min mx-auto pb-[60px]" style={{ background: 'var(--canvas)' }}>{/* Brief F6 — canvas #050505 (matches own) */}

      {/* Brief F6 — the public header now MATCHES own-profile: the shared
          <ProfileHeader> composition (square PFP + ivory frame, name step-down, PRO,
          tight handle, stats + Market Cap + dash + divider, badge cluster) on canvas
          #050505. onMeasure → headerH drives the tab anchor + grid spacer below.
          Public-specific chrome (ⓘ +2px · mail DM · FOLLOW text) is the controls slot. */}
      <div
        onClick={profileDataOpen ? () => setProfileDataOpen(false) : undefined}
        style={{
          position: 'relative',
          background: 'var(--canvas)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          opacity: profileDataOpen ? 1 : headerOpacity,
          transition: 'opacity 0.25s ease',
          pointerEvents: (profileDataOpen || gridScrollY < 20) ? 'auto' : 'none',
          zIndex: profileDataOpen ? 200 : 10,
        }}
      >
        <ProfileHeader
          displayName={profile?.display_name || username}
          username={username}
          profileImage={profile?.profile_image_url}
          isPaidMember={isPaidMember}
          analytics={{ followers: followerCount, collectors: 0, portfolioMc: profile?.portfolio_mc || 0 }}
          badges={resolveBadges({ isFoundingMember, isTopCollector, isScreeningRoomHolder, isPaidMember, isInHouseCreator, firstCutCount, composerTrackCount })
            .filter((b) => b.bannerSrc)
            .map((b) => ({ key: b.key, src: (b.framedSrc ?? b.bannerSrc) as string, title: b.title }))}
          onOpenBadges={() => setShowBadgeSheet(true)}
          onMeasure={setHeaderH}
          controls={
            <>
              {/* top-right: ⓘ (bio entry, +2px) + mail (DM entry) */}
              <div style={{ position: 'absolute', top: -2, right: 6, display: 'flex', alignItems: 'center', gap: 8, zIndex: 6, opacity: profileDataOpen ? 0 : 1, pointerEvents: profileDataOpen ? 'none' : 'auto', transition: 'opacity 200ms ease' }}>
                <button
                  ref={infoBtnRef}
                  onClick={() => setProfileDataOpen(true)}
                  className="tap-target"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 7, animation: iPulse ? 'i-land-pulse 300ms ease-out' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  aria-label="View profile info"
                >
                  <div style={{ width: 16.6, height: 13.2, border: '0.5px solid #E5E1DB', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                    <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'calc(var(--fs-15_7) + 2px)', letterSpacing: '-0.02em', color: '#E5E1DB', lineHeight: 1, display: 'block', transform: 'translateY(-1px)' }}>i</span>
                  </div>
                </button>
                {user && !isOwnProfile && targetPrivyId && (
                  <button
                    onClick={() => router.push(`/dm/${encodeURIComponent(username)}`)}
                    className="tap-target"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.55 }}
                    aria-label="Direct message"
                  >
                    {/* thin ivory envelope — house-icon stroke language, sharp corners */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="5.5" width="18" height="13" stroke="#E5E1DB" strokeWidth="1.6" strokeLinejoin="round" />
                      <path d="M3.5 6.5 L12 13 L20.5 6.5" stroke="#E5E1DB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
              {/* FOLLOW — minimal text, just above the divider in the right zone. 75 Bold;
                  FOLLOW = ink-100, FOLLOWING = ~55%. handleFollow toggles both states
                  (unchanged logic; the fly-to-ⓘ still fires). */}
              {user && !isOwnProfile && targetPrivyId && (
                <button
                  ref={followBtnRef}
                  onClick={handleFollow}
                  disabled={followLoading}
                  className="tap-target"
                  style={{ position: 'absolute', right: 8, bottom: 13, zIndex: 6, background: 'transparent', border: 'none', cursor: followLoading ? 'default' : 'pointer', padding: '4px 2px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-11)', letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', textTransform: 'uppercase', opacity: profileDataOpen ? 0 : (followingUser ? 0.55 : 1), pointerEvents: profileDataOpen ? 'none' : 'auto', transition: 'opacity 200ms ease', animation: justFollowed ? 'follow-pop 180ms ease-out' : 'none' }}
                >
                  {followingUser ? 'FOLLOWING' : 'FOLLOW'}
                </button>
              )}
            </>
          }
        />
      </div>{/* end header */}

      {/* FOLLOW flyer — a red pill arcing from the button to the ⓘ. The arc:
          X and Y animate with DIFFERENT easings (X ease-out, Y ease-in) on
          nested elements — a curved path from two GPU translates, no layout. */}
      {flyer && createPortal(
        <div style={{ position: 'fixed', left: flyer.x, top: flyer.y, zIndex: 1300, pointerEvents: 'none' }}>
          <div style={{ animation: 'follow-fly-x 560ms cubic-bezier(0.2,0.7,0.3,1) both', ['--fx' as string]: `${flyer.dx}px` }}>
            <div style={{ animation: 'follow-fly-y 560ms cubic-bezier(0.55,0,0.85,0.55) both', ['--fy' as string]: `${flyer.dy}px` }}>
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#E5E1DB', boxShadow: '0 0 8px rgba(229,225,219,0.7)', transform: 'translate(-50%, -50%)' }} />
            </div>
          </div>
        </div>,
        document.body
      )}
      <style>{`
        @keyframes follow-fly-x { from { transform: translateX(0); } to { transform: translateX(var(--fx)); } }
        @keyframes follow-fly-y { from { transform: translateY(0) scale(1); opacity: 1; } to { transform: translateY(var(--fy)) scale(0.4); opacity: 0.15; } }
        @keyframes follow-pop { 0% { transform: scale(1); } 40% { transform: scale(1.08); } 100% { transform: scale(1); } }
        @keyframes i-land-pulse { 0% { transform: scale(1); filter: none; } 40% { transform: scale(1.25); filter: drop-shadow(0 0 6px rgba(229,225,219,0.9)); } 100% { transform: scale(1); filter: none; } }
      `}</style>

      {/* Frame icon — appears when header is hidden, tapping snaps header back */}
      {!headerSnapped && gridScrollY > 20 && (
        <div
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); snapScrollYRef.current = gridScrollY; setHeaderSnapped(true); setSnapAnimKey(k => k + 1); }}
          style={{
            position: 'fixed',
            top: 8,
            left: 8,
            zIndex: 50,
            cursor: 'pointer',
            pointerEvents: 'auto',
            opacity: Math.min(1, (gridScrollY - 20) / 20),
            transition: 'opacity 0.2s ease',
            filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.9)) drop-shadow(0 2px 12px rgba(0,0,0,0.75))',
          }}
        >
          <img src="/logomark-plain-white.png" alt="" style={{ width: 32, height: 20, objectFit: 'contain', display: 'block' }} />
        </div>
      )}

      {/* Tab row — absolute until scrolled past 101px, then fixed. When snapped, always fixed + aligned with frame icon. */}
      <div style={{
        position: (headerSnapped || headerUnsnapping || gridScrollY > tabCap) ? 'fixed' : 'absolute',
        top: (headerSnapped || headerUnsnapping) ? 'env(safe-area-inset-top, 0px)' : gridScrollY > tabCap ? 'calc(2px + env(safe-area-inset-top, 0px))' : `calc(${tabAnchor - tabRowOffset}px + env(safe-area-inset-top, 0px))`,
        left: (headerSnapped || headerUnsnapping || gridScrollY > tabCap) ? '50%' : 0,
        right: (headerSnapped || headerUnsnapping || gridScrollY > tabCap) ? 'auto' : 0,
        transform: (headerSnapped || headerUnsnapping || gridScrollY > tabCap) ? 'translateX(-50%)' : 'none',
        width: (headerSnapped || headerUnsnapping || gridScrollY > tabCap) ? '100%' : 'auto',
        maxWidth: '30rem',
        zIndex: 40,
        background: (headerSnapped || headerUnsnapping)
          ? 'linear-gradient(to bottom, rgba(0,0,0,0.31) 0%, rgba(0,0,0,0.14) 80%, transparent 100%)'
          : 'transparent',
        paddingTop: (headerSnapped || headerUnsnapping) ? 6 : 10,
        paddingBottom: (headerSnapped || headerUnsnapping) ? 8 : 12,
        opacity: headerSnapped ? 1 : Math.max(0, 1 - gridScrollY / 20),
        transition: (headerUnsnapping && !headerSnapped) ? 'none' : 'opacity 0.25s ease',
        pointerEvents: (headerSnapped || gridScrollY < 20) ? 'auto' : 'none',
      }}>
        <div key={snapAnimKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', height: 20 }}>
          {(headerSnapped || headerUnsnapping) ? (
            <button
              onClick={dismissSnapMenu}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', animation: headerUnsnapping ? 'snapOutLeft 0.28s cubic-bezier(0.16,1,0.3,1) 165ms both' : 'snapInLeft 0.32s cubic-bezier(0.16,1,0.3,1) 0ms both' }}
            >
              <img src="/logomark-plain-white.png" alt="" style={{ width: 32, height: 20, objectFit: 'contain', display: 'block' }} />
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('main')}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-9_5)', color: activeTab === 'main' ? 'rgba(229,225,219,0.8)' : 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '-0.16px' }}>MAIN</span>
            </button>
          )}

          <button
            onClick={() => { setActiveTab('decks'); setShowDecks(true); }}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', position: 'relative', left: (headerSnapped || headerUnsnapping) ? -8 : 5, animation: headerUnsnapping ? 'snapOutUp 0.28s cubic-bezier(0.16,1,0.3,1) 110ms both' : headerSnapped ? 'snapInUp 0.32s cubic-bezier(0.16,1,0.3,1) 55ms both' : 'none' }}
          >
            <img src="/decks-logo-new-lg.png" style={{ height: 8, width: 'auto', display: 'block', filter: activeTab === 'decks' ? 'invert(27%) sepia(100%) saturate(7000%) hue-rotate(0deg) brightness(100%) contrast(100%)' : 'none' }} alt="Decks" />
          </button>

          <button
            onClick={() => setActiveTab('theatre')}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', animation: headerUnsnapping ? 'snapOutUp 0.28s cubic-bezier(0.16,1,0.3,1) 55ms both' : headerSnapped ? 'snapInUp 0.32s cubic-bezier(0.16,1,0.3,1) 110ms both' : 'none' }}
          >
            <img
              src="/theatre-mode-eye-solo.png"
              style={{ height: 15.6, width: 'auto', display: 'block', opacity: activeTab === 'theatre' ? 1 : 0.7, position: 'relative', left: (headerSnapped || headerUnsnapping) ? 0 : 10 }}
              alt="Theatre"
            />
          </button>

          <button
            onClick={() => setActiveTab('collected')}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', animation: headerUnsnapping ? 'snapOutRight 0.28s cubic-bezier(0.16,1,0.3,1) 0ms both' : headerSnapped ? 'snapInRight 0.32s cubic-bezier(0.16,1,0.3,1) 165ms both' : 'none' }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-9_5)', color: activeTab === 'collected' ? 'rgba(229,225,219,0.8)' : 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '-0.16px' }}>COLLECTED</span>
          </button>
        </div>
      </div>

      {/* Posts grid — header space reserved by spacer in scroll content, not by moving the container. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {activeTab === 'collected' ? (
          /* COLLECTED — the curator résumé, public by nature (on-chain data).
             Excludes the profile user's own posts (ratified). */
          <div
            style={{ position: 'absolute', inset: 0, bottom: 60, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
            onScroll={(e) => {
              const el = e.currentTarget;
              requestAnimationFrame(() => setGridScrollY(Math.max(0, el.scrollTop)));
            }}
          >
            <div style={{ height: gridSpacer }} />
            {profile?.user_id
              ? <CollectedGrid userId={profile.user_id} isOwn={!!isOwnProfile} />
              : <div style={{ minHeight: '30vh' }} />}
          </div>
        ) : posts.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', flex: 1, minHeight: '50vh', paddingTop: gridSpacer }}>
            <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase' }}>NO POSTS YET</p>
          </div>
        ) : (
          <div ref={gridScrollRef} className="overflow-y-auto h-full px-[1px]" onScroll={(e) => {
            if (rafPendingRef.current) return;
            rafPendingRef.current = true;
            const el = e.currentTarget;
            requestAnimationFrame(() => {
              setGridScrollY(Math.max(0, el.scrollTop));
              rafPendingRef.current = false;
            });
          }}>
            <div style={{ height: gridSpacer, flexShrink: 0 }} />
            {layoutId === 'collage' ? (
              // Collage → masonry mosaic: each post at its own layout_id AR.
              <div style={{ columnCount: 2, columnGap: 2 }}>
                {posts.map((post, index) => (
                  <div key={post.id} style={{
                    breakInside: 'avoid',
                    // @ts-ignore — webkit prefix for older Safari
                    WebkitColumnBreakInside: 'avoid',
                    marginBottom: 2,
                  }}>
                    <PostCell
                      post={post}
                      layoutId={post.layout_id || 'scope'}
                      index={index}
                      onClick={() => { setViewerIndex(index); setShowViewer(true); }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className={`grid ${getColCount(layoutId)} gap-x-[1px] gap-y-[2px]`}>
                {posts.map((post, index) => (
                  <PostCell
                    key={post.id}
                    post={post}
                    layoutId={layoutId}
                    index={index}
                    onClick={() => { setViewerIndex(index); setShowViewer(true); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showViewer && <ProfilePostViewer posts={posts} initialIndex={viewerIndex} ownerUsername={username} ownerAvatarUrl={profile?.profile_image_url} onClose={() => setShowViewer(false)} />}
      {showFollowersModal && targetPrivyId && <FollowListModal type="followers" privyUserId={targetPrivyId} onClose={() => setShowFollowersModal(false)} />}
      {showFollowingModal && targetPrivyId && <FollowListModal type="following" privyUserId={targetPrivyId} onClose={() => setShowFollowingModal(false)} />}

      {/* Decks overlay */}
      {showDecks && <div onClick={() => { setShowDecks(false); setActiveTab('main'); }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 59 }} />}

      {/* Decks sheet */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '70vh', backgroundColor: '#000', borderTop: '1px solid white', zIndex: 60, transform: showDecks ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 300ms ease', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 16px 10px', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 40, height: 3, backgroundColor: 'rgba(229,225,219,0.3)' }} />
          <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', letterSpacing: '0.05em', textTransform: 'uppercase' }}>DECKS</span>
          <button onClick={() => { setShowDecks(false); setActiveTab('main'); }} style={{ position: 'absolute', right: 16, fontSize: 'var(--fs-18)', color: '#E5E1DB', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {decksLoading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}><FrameLoader /></div>
          : publicDecks.length === 0 ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}><span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase' }}>NO DECKS YET</span></div>
          : publicDecks.map(deck => (
            <div key={deck.id} onClick={() => { setShowDecks(false); router.push(`/profile/${username}/decks/${deck.id}`); }} style={{ marginBottom: 12, cursor: 'pointer' }}>
              <div style={{ width: '100%', aspectRatio: getDeckAspect(deck.grid_layout), overflow: 'hidden', background: '#1a1a1a' }}>
                {/* Baked collage cover (one ~600px WebP), not the live N-image composite. */}
                {deck.thumbnail_url
                  ? <img src={deck.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : deck.thumbnail_urls.length > 0
                  ? <img src={feedImage(deck.thumbnail_urls[0], 600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : null}
              </div>
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#E5E1DB', margin: '4px 0 0', textTransform: 'uppercase' }}>{deck.title}</p>
              <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.5)', margin: '2px 0 0', textTransform: 'uppercase' }}>{deck.item_count} FRAMES</p>
            </div>
          ))}
        </div>
      </div>

      {/* THEATRE MODE — landscape full-screen viewing of this profile's posts,
          toggled by the eye icon in the tab row. Full-screen overlay. */}
      {activeTab === 'theatre' && (
        <TheatreMode posts={posts} onClose={() => setActiveTab('main')} />
      )}

      <ProfileDataSheet
        isOpen={profileDataOpen}
        onClose={() => setProfileDataOpen(false)}
        onExploreBadges={() => { setProfileDataOpen(false); setShowBadgeSheet(true); }}
        profile={profile}
        links={profileLinks}
        isOwnProfile={!!isOwnProfile}
        followers={followerCount}
        following={followingCount}
        totalPosts={posts.length}
        collectors={0}
        portfolioMc={profile?.portfolio_mc || 0}
        decks={publicDecks.length}
        firstCutCount={firstCutCount}
        isFollowing={!!followingUser}
        followBusy={followLoading}
        onUnfollow={handleFollow}
      />

      <BadgeExplainerSheet
        visible={showBadgeSheet}
        onClose={() => setShowBadgeSheet(false)}
        onJoinPress={() => { setShowBadgeSheet(false); setShowMembershipSheet(true); }}
        userTiers={{ isFree: !isPaidMember && !isTopCollector && !isFoundingMember && !isInHouseCreator, isInHouseCreator, isPaidMember, isTopCollector, isFoundingMember, foundingMemberNumber }}
      />

      <MembershipSheet
        visible={showMembershipSheet}
        onClose={() => setShowMembershipSheet(false)}
        isPaidMember={isPaidMember}
        paidMemberUntil={paidMemberUntil}
        onSuccess={(plan) => {
          setShowMembershipSheet(false);
          setIsPaidMember(true);
          window.location.href = `/membership/success?plan=${plan}`;
        }}
      />

      <BottomToolbar page="public-profile" />

    </div>
  );
}
