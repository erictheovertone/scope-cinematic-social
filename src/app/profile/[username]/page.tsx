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
import PressPop from "@/components/PressPop";
import { profileTabFlow, gridSpacerCss } from "@/components/profile/profileTabFlow";
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
import ProfileTabRow from "@/components/profile/ProfileTabRow";

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
  const [activeTab, setActiveTab] = useState<"main" | "decks" | "collected">("main");
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
  // Brief F6b §1 — shared tab/grid flow, identical to own-profile. Ends the fork that had
  // dropped the safe-area term from public's grid spacers (→ tab row over grid content).
  const { tabAnchor, tabCap, gridSpacer, tabRowOffset } = profileTabFlow(headerH, gridScrollY);
  const headerOpacity = Math.max(0, 1 - gridScrollY / 20);

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

  // Brief W8 §2 — ONE resolved held-badges list shared by the cluster + the bio sheet.
  const resolvedBadges = resolveBadges({ isFoundingMember, isTopCollector, isScreeningRoomHolder, isPaidMember, isInHouseCreator, firstCutCount, composerTrackCount });

  return (
    <div className="bg-black relative w-full app-shell screen-min mx-auto pb-[60px]" style={{ background: 'var(--canvas)', overscrollBehavior: 'none' }}>{/* Brief F6 — canvas #050505 (matches own). Brief F6b §4a — overscroll-behavior:none on the app-shell root kills the rubber-band scroll-chain (the F5 §4a / decks-page pattern). */}

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
          analytics={{ followers: followerCount, collectors: 0, portfolioMc: profile?.portfolio_mc || 0, following: followingCount, totalPosts: posts.length, decks: publicDecks.length }}
          expanded={profileDataOpen}
          badges={resolvedBadges
            .filter((b) => b.bannerSrc)
            .map((b) => ({ key: b.key, src: (b.framedSrc ?? b.bannerSrc) as string, title: b.title }))}
          onOpenBadges={() => setShowBadgeSheet(true)}
          onMeasure={setHeaderH}
          controls={
            <>
              {/* top-right: BIO (bio entry) + paper-plane (DM entry) */}
              <div style={{ position: 'absolute', top: -2, right: 6, display: 'flex', alignItems: 'center', gap: 8, zIndex: 6, opacity: profileDataOpen ? 0 : 1, pointerEvents: profileDataOpen ? 'none' : 'auto', transition: 'opacity 200ms ease' }}>
                <button
                  ref={infoBtnRef}
                  onClick={() => setProfileDataOpen(true)}
                  className="tap-target"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 7, animation: iPulse ? 'i-land-pulse 300ms ease-out' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  aria-label="View profile info"
                >
                  {/* Brief F6b §2 — the ⓘ glyph becomes the word BIO, styled exactly as
                      own-profile's control (65 Medium, --ink-100, 15.5px). The F6 +2px ⓘ
                      sizing is superseded. Behavior unchanged (opens the bio/data sheet;
                      the follow flyer still lands on this ref). */}
                  <PressPop><span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 15.5, letterSpacing: 'var(--track-body)', color: 'var(--ink-100)', display: 'block' }}>BIO</span></PressPop>
                </button>
                {user && !isOwnProfile && targetPrivyId && (
                  <button
                    onClick={() => router.push(`/dm/${encodeURIComponent(username)}`)}
                    className="tap-target"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.55 }}
                    aria-label="Direct message"
                  >
                    {/* Brief F6b §5 — minimal geometric paper plane (Telegram-style:
                        triangular, pointing up-and-right), thin ivory stroke matching the
                        house-icon language (1.6 weight, round joins). Replaces the envelope. */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M21.5 3 L2.5 9.8 L11 13 L14 21.5 L21.5 3 Z" stroke="#E5E1DB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M11 13 L21.5 3" stroke="#E5E1DB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
              {/* FOLLOW — minimal text, just above the divider in the right zone. 75 Bold,
                  ink-100. Brief F6b §3 — the control renders ONLY while NOT following; once
                  the viewer follows, it disappears entirely (no FOLLOWING label, no layout
                  hole — it's absolute). Unfollow lives in the bio sheet's UNFOLLOW affordance
                  (ProfileDataSheet, wired via onUnfollow). The fly-to-BIO confirm still fires
                  (handleFollow captures the rects before this unmounts). */}
              {user && !isOwnProfile && targetPrivyId && !followingUser && (
                <button
                  ref={followBtnRef}
                  onClick={handleFollow}
                  disabled={followLoading}
                  className="tap-target"
                  style={{ position: 'absolute', right: 8, bottom: 13, zIndex: 6, background: 'transparent', border: 'none', cursor: followLoading ? 'default' : 'pointer', padding: '4px 2px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-11)', letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', textTransform: 'uppercase', opacity: profileDataOpen ? 0 : 1, pointerEvents: profileDataOpen ? 'none' : 'auto', transition: 'opacity 200ms ease', animation: justFollowed ? 'follow-pop 180ms ease-out' : 'none' }}
                >
                  FOLLOW
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
        {/* Brief F6a — adopt own-profile's tab set via shared <ProfileTabRow>:
            MAIN · COLLECTED · DECKS (text, own styling). The old icon 4-tab row +
            its THEATRE tab are retired; theatre stays reachable via rotation in
            ProfilePostViewer. */}
        <ProfileTabRow
          activeTab={activeTab}
          headerSnapped={headerSnapped}
          headerUnsnapping={headerUnsnapping}
          snapAnimKey={snapAnimKey}
          onDismissSnap={dismissSnapMenu}
          onMain={() => setActiveTab('main')}
          onCollected={() => setActiveTab('collected')}
          onDecks={() => { setActiveTab('decks'); setShowDecks(true); }}
        />
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
            <div style={{ height: gridSpacerCss(gridSpacer) }} />
            {profile?.user_id
              ? <CollectedGrid userId={profile.user_id} isOwn={!!isOwnProfile} />
              : <div style={{ minHeight: '30vh' }} />}
          </div>
        ) : posts.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', flex: 1, minHeight: '50vh', paddingTop: gridSpacerCss(gridSpacer) }}>
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
            <div style={{ height: gridSpacerCss(gridSpacer), flexShrink: 0 }} />
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

      {/* Brief F6a — the page-level THEATRE tab is retired (own-profile tab set).
          Theatre remains reachable via rotation inside ProfilePostViewer, which owns
          its own full-screen overlay — no page-level activeTab='theatre' needed. */}

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
        badges={resolvedBadges}
        bannerClearH={headerH}
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
