"use client";

import { useState, useEffect, useRef } from "react";
import DesktopProfile from '@/components/desktop/DesktopProfile';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { feedImage, THUMB_WIDTH } from "@/lib/mediaUrl";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, getFollowerCount, getFollowingCount, getUserDecks, createDeck, getProfileLinks, isProMember, type Deck, type ProfileLink } from "@/lib/userService";
import ProfileDataSheet from "@/components/ProfileDataSheet";
import PressPop from "@/components/PressPop";
import { profileTabFlow, gridSpacerCss } from "@/components/profile/profileTabFlow";
import PageTitle from "@/components/PageTitle";
import DeckThumbnail from "@/components/DeckThumbnail";
import { getUserPosts } from '@/lib/postsService';
import CreatePostFlow from "@/components/CreatePostFlow";
import FollowListModal from "@/components/FollowListModal";
import ProfilePostViewer from "@/components/ProfilePostViewer";
import BadgeExplainerSheet from "@/components/BadgeExplainerSheet";
import MembershipSheet from "@/components/MembershipSheet";
import BottomToolbar from "@/components/BottomToolbar";
import MediaRenderer from "@/components/MediaRenderer";
import TheatreMode from "@/components/TheatreMode";
import OnboardingModal from "@/components/OnboardingModal";
import AddToHomeScreenSheet from "@/components/AddToHomeScreenSheet";
import { shouldShowA2HS } from "@/lib/pwaUtils";
import PostCell from "@/components/PostCell";
import { getColCount } from "@/lib/aspectRatio";
import { resolveLayout, legacyLayoutId } from "@/lib/layoutModel";
import { getScopeLimitType } from "@/lib/limits";
import { useUpsell } from "@/components/UpsellProvider";
import FrameLoader from "@/components/FrameLoader";
import BadgeCluster from "@/components/BadgeCluster";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileTabRow from "@/components/profile/ProfileTabRow";
import { resolveBadges } from "@/lib/economy/badges";
import { dividerBackground } from "@/lib/economy/dividerLines";
import { useEconomy } from "@/components/EconomyProvider";
import CollectedGrid from "@/components/economy/CollectedGrid";

function getGridCols(layoutId: string): string {
  if (layoutId.startsWith('2x-')) return 'grid-cols-2';
  if (layoutId.startsWith('3x-')) return 'grid-cols-3';
  if (layoutId.startsWith('1x-')) return 'grid-cols-1';
  if (layoutId === 'collage') return 'grid-cols-2';
  // legacy
  if (layoutId === '2x-super-wide' || layoutId === '2x-regular-wide') return 'grid-cols-2';
  if (layoutId === '3x-square') return 'grid-cols-3';
  if (layoutId === 'legacy') return 'grid-cols-2';
  return 'grid-cols-1';
}

function getPostAspect(layoutId: string, index: number): string {
  switch (layoutId) {
    case '2x-pana': case '1x-pana': return 'aspect-[2.75/1]';
    case '2x-scope': case '1x-scope': return 'aspect-[2.39/1]';
    case '2x-cine': case '1x-cine': return 'aspect-[1.85/1]';
    case '3x-legacy': return 'aspect-[4/3]';
    case 'collage': return ['aspect-[2.39/1]','aspect-[2.75/1]','aspect-[4/3]','aspect-[1.85/1]'][index % 4];
    // legacy
    case '2x-super-wide': case '1x-super-wide': return 'aspect-[2.39/1]';
    case '2x-regular-wide': return 'aspect-video';
    case '3x-square': return 'aspect-square';
    default: return 'aspect-[2.39/1]';
  }
}

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function Profile() {
  const { user } = usePrivy();
  const router = useRouter();
  const { showUpsell } = useUpsell();
  const searchParams = useSearchParams();
  const [profileDataOpen, setProfileDataOpen] = useState(false);
  const [rawProfile, setRawProfile] = useState<any>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [supabaseUserId, setSupabaseUserId] = useState<string | undefined>();
  const [userProfile, setUserProfile] = useState({
    displayName: "",
    username: "",
    bio: "",
    profileImage: null as string | null,
    websiteUrl: "",
  });
 const [stableLayoutId, setStableLayoutId] = useState<string>('scope');
const userLayoutId = stableLayoutId;
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'collected' | 'decks' | 'theatre'>('main');
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState({
    collectors: 0,
    totalPosts: 0,
    followers: 0,
    following: 0,
    portfolioMc: 0,
  });
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showDecks, setShowDecks] = useState(false);
  const [userDecks, setUserDecks] = useState<(Deck & { item_count: number; thumbnail_urls: string[] })[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [showNewDeckForm, setShowNewDeckForm] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [profileLinks, setProfileLinks] = useState<ProfileLink[]>([]);
  const [showBadgeSheet, setShowBadgeSheet] = useState(false);
  const [isPaidMember, setIsPaidMember] = useState(false);
  const [isTopCollector, setIsTopCollector] = useState(false);
  const [isInHouseCreator, setIsInHouseCreator] = useState(false);
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [isScreeningRoomHolder, setIsScreeningRoomHolder] = useState(false); // SRH (cron-awarded)
  const [foundingMemberNumber, setFoundingMemberNumber] = useState<number | null>(null);
  const [paidMemberUntil, setPaidMemberUntil] = useState<Date | null>(null);
  const [showMembershipSheet, setShowMembershipSheet] = useState(false);
  const [showA2HS, setShowA2HS] = useState(false);
  // First Cut count drives the pfp stack's First Cut coin. Read ONLY through the
  // economy boundary, and ONLY when the preview flag is on — so nothing implies
  // founding positions that aren't real yet. Off-flag it stays 0 (coin absent).
  const economy = useEconomy();
  const [firstCutCount, setFirstCutCount] = useState(0);
  const [composerTrackCount, setComposerTrackCount] = useState(0);
  // Bumped by scope:badges-changed (a sell just released a First Cut slot) —
  // re-runs the badge fetch so banner + pill update without a reload.
  const [badgeTick, setBadgeTick] = useState(0);
  useEffect(() => {
    const bump = () => setBadgeTick((t) => t + 1);
    window.addEventListener('scope:badges-changed', bump);
    return () => window.removeEventListener('scope:badges-changed', bump);
  }, []);
  const [badgesLoaded, setBadgesLoaded] = useState(false); // firstCutCount has resolved
  const [firstCutPull, setFirstCutPull] = useState<string | null>(null); // Moment 2 focus-pull
  const [arriveKeys, setArriveKeys] = useState<string[] | null>(null);     // badge-arrival entrance (pro etc.)
  const [dividerLine, setDividerLine] = useState<string | null>(null); // chosen banner divider (Piece 2)
  const [holoBanner, setHoloBanner] = useState(false); // Augmented holo backdrop (Piece 3)
  useEffect(() => {
    // First Cut is a REAL, table-backed award (first_cut_awards) — NOT mock
    // preview data — so it must NOT be gated behind the economy-preview flag.
    // (That gate forced firstCutCount=0 with the flag off, hiding the badge even
    // though the row resolves: row user_id = users.id = supabaseUserId.)
    if (!supabaseUserId) { setFirstCutCount(0); setBadgesLoaded(true); return; }
    let cancelled = false;
    economy.getBadges(supabaseUserId)
      .then((b) => { if (!cancelled) { setFirstCutCount(b.firstCutCount ?? 0); setComposerTrackCount(b.composerTrackCount ?? 0); setBadgesLoaded(true); } })
      .catch(() => { if (!cancelled) setBadgesLoaded(true); });
    return () => { cancelled = true; };
  }, [economy, supabaseUserId, badgeTick]);

  // ── Moment 2 (Step 3) — profile focus-pull via client-diff ──────────────────
  // The first time the user sees their OWN profile after newly earning First
  // Cut, the badge focus-pulls into the banner. We diff the resolved badge keys
  // against a locally stored last-seen set: a COLD start (no stored set) seeds
  // silently — only a genuine NEW arrival animates, never pre-existing badges.
  // Runs only after badges have loaded (firstCutCount resolves async, so a
  // pre-load seed would falsely flag an old award as new). Reads the STORED
  // award (firstCutCount ← the immutable table), so it can never contradict
  // what Moment 1 celebrated. The strip itself gates the pull on an open slot.
  useEffect(() => {
    if (!badgesLoaded || !supabaseUserId) return;
    const keys = resolveBadges({ isFoundingMember, isTopCollector, isScreeningRoomHolder, isPaidMember, isInHouseCreator, firstCutCount, composerTrackCount }).map((b) => b.key);
    const storeKey = `scope:seenBadges:${supabaseUserId}`;
    let seen: string[] | null = null;
    try { const raw = localStorage.getItem(storeKey); seen = raw ? JSON.parse(raw) : null; } catch {}
    // GENERALIZED ARRIVALS: any key newly present vs the seen set gets an
    // entrance. firstCut keeps its ratified focus-pull; every other newcomer
    // (pro today; top1k / future counts tomorrow) plays the badge-arrival
    // primitive in the strip. Cold start (no stored set) still seeds silently —
    // pre-existing badges never animate.
    const newKeys = Array.isArray(seen) ? keys.filter((k) => !seen!.includes(k)) : [];
    if (newKeys.includes('firstCut')) {
      setFirstCutPull('firstCut');
      setTimeout(() => setFirstCutPull(null), 2200);
    }
    const arrivals = newKeys.filter((k) => k !== 'firstCut');
    if (arrivals.length > 0) {
      setArriveKeys(arrivals);
      setTimeout(() => setArriveKeys(null), 2600); // class removed after the play
    }
    try { localStorage.setItem(storeKey, JSON.stringify(keys)); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badgesLoaded, supabaseUserId, firstCutCount, composerTrackCount, isFoundingMember, isTopCollector, isScreeningRoomHolder, isPaidMember, isInHouseCreator]);

  // PORTFOLIO MC — VALUATION RULE 2 (ratified): the PUBLIC number counts
  // EXTERNAL positions only (coins collected from others), never the user's
  // own allocations/backing. Public metrics measure taste, not self-stake —
  // the firewall that keeps the wallet's complete ledger harmless. Same
  // philosophy as the COLLECTED-grid rule and the First Cut creator exclusion.
  useEffect(() => {
    if (!supabaseUserId) return;
    let cancelled = false;
    economy.getHoldings()
      .then((h) => {
        if (cancelled) return;
        const externalMc = h
          .filter((x) => (x.post as { user_id?: string }).user_id !== supabaseUserId)
          .reduce((s, x) => s + x.valueUsd, 0);
        setAnalytics((prev) => ({ ...prev, portfolioMc: Math.round(externalMc * 100) / 100 }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [economy, supabaseUserId]);
  const isDesktop = useIsDesktop();
  const [gridScrollY, setGridScrollY] = useState(0);
  useEffect(() => { setGridScrollY(0); }, [activeTab]);
  const [headerSnapped, setHeaderSnapped] = useState(false);
  const [headerUnsnapping, setHeaderUnsnapping] = useState(false);
  const [snapAnimKey, setSnapAnimKey] = useState(0);
  const snapScrollYRef = useRef(0);
  const dismissSnapMenu = () => {
    setHeaderUnsnapping(true);
    setTimeout(() => {
      setHeaderSnapped(false);
      setTimeout(() => setHeaderUnsnapping(false), 50);
    }, 500);
  };
  const headerOpacity = Math.max(0, 1 - gridScrollY / 80);
  // Brief 2.2c — the header composition self-sizes (flow); its MEASURED content height
  // drives everything below (tab-row anchor, grid spacers) so overlaps are impossible
  // by construction — no stale magic heights.
  // Brief F6 — the header composition + its measurement (nameSize/pfpSize/headerRef)
  // moved into the shared <ProfileHeader>; the page keeps headerH (set via onMeasure)
  // to drive the tab anchor + grid spacer below.
  const [headerH, setHeaderH] = useState(120); // measured (excl. safe-area); default ≈ old
  // Brief F6b §1 — the tab/grid flow math is now the SHARED profileTabFlow() (own + public
  // consume it identically → the fork that let public drop the safe-area term is gone).
  // tabAnchor = rest top below the divider; tabCap pins at top:2; gridSpacer reserves the
  // tab's FULL padded height + 6px gap (2.2d, kills the 22px overlap); tabRowOffset drives
  // the pin. Output is byte-identical to the prior inline math (own unchanged).
  const { tabAnchor, tabCap, gridSpacer, tabRowOffset } = profileTabFlow(headerH, gridScrollY);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const rafPendingRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      let sbId: string | null = null;
      try {
        const supabaseUser = await getUserByPrivyId(user.id);
        if (supabaseUser) {
          sbId = supabaseUser.id;
          setSupabaseUserId(supabaseUser.id);
          const profile = await getProfile(supabaseUser.id) as any;
          if (profile) {
            setRawProfile(profile);
            setUserProfile({
              displayName: profile.display_name || "",
              username: profile.username || "",
              bio: profile.bio || "",
              profileImage: profile.profile_image_url || null,
              websiteUrl: profile.website_url || "",
            });
            setLayoutLoaded(true);
            const memberUntil = profile.paid_member_until ? new Date(profile.paid_member_until) : null;
            setIsPaidMember(isProMember(profile));
            setPaidMemberUntil(memberUntil);
            setIsTopCollector(profile.is_top_collector || false);
            setIsInHouseCreator(profile.is_in_house_creator || false);
            setIsFoundingMember(profile.is_founding_member || false);
            setIsScreeningRoomHolder((profile as any).is_screening_room_holder || false);
            setFoundingMemberNumber(profile.founding_member_number || null);
            setDividerLine((profile as any).divider_line || null);
            setHoloBanner(!!(profile as any).holo_banner);
          }
          getProfileLinks(user.id).then(setProfileLinks).catch(() => {});
        }
        setLayoutLoaded(true);
      } catch (error) {
        console.error('Error loading profile:', error);
        setLayoutLoaded(true);
      }
      try {
        const [posts, fc, fgc] = await Promise.all([
          getUserPosts(sbId ?? user.id),
          getFollowerCount(user.id),
          getFollowingCount(user.id),
        ]);
        setUserPosts(posts);
        setAnalytics(prev => ({ ...prev, totalPosts: posts.length, followers: fc, following: fgc }));
      } catch (error) {
        console.error('Error loading posts:', error);
      } finally {
        // Empty-vs-content is only known once posts resolve — flip this so the
        // "create your first post" state can't flash before the real data lands.
        setPostsLoaded(true);
      }
    };
    loadData();
  }, [user]);

  useEffect(() => {
    if (searchParams?.get('showMembership') === 'true') {
      setShowMembershipSheet(true);
    }
    if (searchParams?.get('upgraded') === 'true') {
      setTimeout(() => {
        if (user) {
          getUserByPrivyId(user.id).then(async (supabaseUser) => {
            if (supabaseUser) {
              const profile = await getProfile(supabaseUser.id) as any;
              if (profile) {
                setIsPaidMember(isProMember(profile));
              }
            }
          });
        }
      }, 1500);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user || showCreatePost || !supabaseUserId) return;
    const load = () => getUserPosts(supabaseUserId)
      .then(posts => {
        setUserPosts(posts);
        setAnalytics(prev => ({ ...prev, totalPosts: posts.length }));
      })
      .catch(console.error);
    load();
    // When a coin lands or trades ('scope:market-moved'), refetch the rows so
    // the freshly-coined tile gains its [ TICKER ]/MC chrome without a reload —
    // the mint moment's tile resolution.
    const onMoved = () => load();
    window.addEventListener('scope:market-moved', onMoved);
    return () => window.removeEventListener('scope:market-moved', onMoved);
  }, [showCreatePost, supabaseUserId]);

  // Mobile profile grid = the SHARED aspect × the MOBILE count (resolveLayout —
  // the one resolver both platforms use). Rebuild a canonical layout id from the
  // resolved values so the existing getColCount/getAspectClass rendering (incl.
  // collage) is reused unchanged. Reflects a shared AR set on EITHER surface.
  useEffect(() => {
    if (!rawProfile) return;
    const R = resolveLayout(rawProfile as Parameters<typeof resolveLayout>[0]);
    setStableLayoutId(legacyLayoutId(R.aspect, R.mobileCount));
  }, [rawProfile]);

  useEffect(() => {
    if (!showDecks || !user) return;
    setDecksLoading(true);
    getUserDecks(user.id)
      .then(setUserDecks)
      .catch(console.error)
      .finally(() => setDecksLoading(false));
  }, [showDecks, user?.id]);

  // Footer pill stands down while the DECKS pull-up is open (the takeover discipline
  // — same as collect/theatre/create). This inline sheet, NOT DeckPickerSheet, is the
  // one with the +NEW DECK footer; last round wired the wrong sheet. Cleared on close.
  useEffect(() => {
    if (!showDecks) return;
    document.documentElement.dataset.suiteOpen = '1';
    window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    return () => {
      delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    };
  }, [showDecks]);

  const fmt = (n: number) => n.toLocaleString();

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

  useEffect(() => {
    if (headerSnapped && !headerUnsnapping && (gridScrollY > snapScrollYRef.current + 30 || gridScrollY < 20)) setHeaderSnapped(false);
  }, [gridScrollY, headerSnapped, headerUnsnapping]);

  // Brief F6 — name split + step-down + header measurement now live inside
  // <ProfileHeader>; headerH arrives via its onMeasure callback (setHeaderH).

  // ── DESKTOP SEAM (Brief 1): ≥1024 renders the desktop profile — its own
  // component tree, zero responsive CSS threaded into this mobile page. ──
  if (isDesktop) {
    return supabaseUserId && user?.id
      ? <DesktopProfile userId={supabaseUserId} privyId={user.id} isOwn />
      : <div className="bg-black" style={{ position: 'fixed', inset: 0 }} />;
  }

  // Brief W8 §2 — ONE resolved held-badges list; the cluster (ProfileHeader) and the bio
  // sheet both consume it, so they can never diverge (COMPOSER was dropping in the sheet
  // because it re-derived without composerTrackCount).
  const resolvedBadges = resolveBadges({ isFoundingMember, isTopCollector, isScreeningRoomHolder, isPaidMember, isInHouseCreator, firstCutCount, composerTrackCount });

  return (
    <div className="relative">{/* Non-scrolling viewport root — fixed chrome (footer + snapped frame) is lifted OUT below as SIBLINGS of the scroller, so on iOS standalone it anchors to the VIEWPORT, not the .screen-min scroll container (which floated the footer above the screen bottom). */}
    <div className="bg-black relative w-full app-shell screen-min mx-auto" style={{ background: 'var(--canvas)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>{/* Brief 2.2c note 1 — page canvas #050505. Brief W2 §3 — was pb-[60px] pill-clearance → safe-bottom only, so grid content scrolls under the pill glass. */}
      <OnboardingModal
        onComplete={() => {
          if (user?.id && shouldShowA2HS(user.id)) {
            setShowA2HS(true);
          }
        }}
      />
      <AddToHomeScreenSheet
        isOpen={showA2HS}
        onClose={() => setShowA2HS(false)}
        privyId={user?.id ?? ''}
      />

      {/* Top blur feather (IG pattern) — same overlay as the home feed: blurs grid
          content passing under the status bar, feathered out via a mask. Sits ABOVE the
          grid (zIndex 5) but BELOW the header chrome (PFP / handle / info at z10), which
          stay on top + clickable + unmoved. Deliberate, contained blur exception. */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        maskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%)',
        zIndex: 5, pointerEvents: 'none',
      }} />

      {/* ══ HEADER — Brief 2.2c scorched-earth rebuild. ONE flow composition whose
          HEIGHT DERIVES FROM CONTENT (headerRef measured → tab row + grid spacers
          follow). Canvas = --canvas (#050505); the residual #000 is killed. */}
      <div
        onClick={profileDataOpen ? () => setProfileDataOpen(false) : undefined}
        style={{
          position: 'relative',
          background: 'var(--canvas)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          opacity: profileDataOpen ? 1 : Math.max(0, 1 - gridScrollY / 20),
          pointerEvents: (profileDataOpen || gridScrollY < 20) ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
          zIndex: profileDataOpen ? 200 : 10,
        }}
      >
        {/* Brief F6 — shared header composition (was inline; extracted verbatim so
            this page's render is byte-identical). onMeasure feeds headerH → tab
            anchor + grid spacer. Controls slot = own-profile's BIO button. */}
        <ProfileHeader
          displayName={userProfile.displayName}
          username={userProfile.username}
          profileImage={userProfile.profileImage}
          isPaidMember={isPaidMember}
          analytics={{ followers: analytics.followers, collectors: analytics.collectors, portfolioMc: analytics.portfolioMc, following: analytics.following, totalPosts: analytics.totalPosts, decks: userDecks.length }}
          expanded={profileDataOpen}
          badges={resolvedBadges
            .filter((b) => b.bannerSrc)
            .map((b) => ({ key: b.key, src: (b.framedSrc ?? b.bannerSrc) as string, title: b.title }))}
          onOpenBadges={() => setShowBadgeSheet(true)}
          onMeasure={setHeaderH}
          controls={
            <button
              onClick={() => setProfileDataOpen(true)}
              style={{ position: 'absolute', top: -4, right: 6, background: 'transparent', border: 'none', cursor: 'pointer', padding: '11px 12px', opacity: profileDataOpen ? 0 : 1, pointerEvents: profileDataOpen ? 'none' : 'auto', transition: 'opacity 200ms ease', zIndex: 6 }}
              aria-label="View profile info"
            >
              <PressPop><span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 15.5, letterSpacing: 'var(--track-body)', color: 'var(--ink-100)', display: 'block' }}>BIO</span></PressPop>
            </button>
          }
        />
      </div>{/* end header */}

      {/* Snapped frame icon — LIFTED out of this scroller to sibling level (see end of return)
          so it anchors to the viewport, not the scroll container. */}

      {/* Tab row — absolute until scrolled past the header, then fixed. When snapped,
          always fixed. Brief 2.2d: the grid spacer now reserves the tab's FULL padded
          height (TAB_ROW_H) so the first grid row clears it (no more 22px overlap). */}
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
          ? 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 80%, transparent 100%)'
          : 'transparent',
        paddingTop: (headerSnapped || headerUnsnapping) ? 6 : 10,
        paddingBottom: (headerSnapped || headerUnsnapping) ? 8 : 12,
        opacity: headerSnapped ? 1 : Math.max(0, 1 - gridScrollY / 20),
        transition: (headerUnsnapping && !headerSnapped) ? 'none' : 'opacity 0.25s ease',
        pointerEvents: (headerSnapped || gridScrollY < 20) ? 'auto' : 'none',
      }}>
        {/* Brief F6a — inner tabs extracted to shared <ProfileTabRow> (verbatim →
            render byte-identical). MAIN · COLLECTED · DECKS; theatre stays entered by
            rotation in ProfilePostViewer + the lightbox path, never a tab. */}
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

      {/* THEATRE MODE — landscape full-screen viewing of this profile's posts,
          toggled by the eye icon in the tab row. Full-screen overlay. */}
      {activeTab === 'theatre' && (
        <TheatreMode posts={userPosts} onClose={() => setActiveTab('main')} />
      )}

      {/* COLLECTED — the real page (ownership as identity): posts this user
          holds pieces of, EXCLUDING their own (ratified). */}
      {/* COLLECTED — the SAME scroll-push mechanic as the posts grid: the
          container owns the full viewport, a spacer reserves the header's
          space IN the scroll content, and scrollTop feeds gridScrollY so the
          header fades/pushes and the tab row pins compactly — 1:1 with the
          finger, one continuous flow. */}
      {activeTab === 'collected' && supabaseUserId && (
        <div
          style={{ position: 'absolute', inset: 0, bottom: 60, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
          onScroll={(e) => {
            if (rafPendingRef.current) return;
            rafPendingRef.current = true;
            const el = e.currentTarget;
            requestAnimationFrame(() => {
              setGridScrollY(Math.max(0, el.scrollTop));
              rafPendingRef.current = false;
            });
          }}
        >
          <div style={{ height: gridSpacerCss(gridSpacer) }} />
          <CollectedGrid userId={supabaseUserId} isOwn />
        </div>
      )}

      {/* Posts grid — header space reserved by spacer in scroll content, not by moving the container. */}
      {layoutLoaded && postsLoaded && activeTab === 'main' && (
        <div style={{ position: 'absolute', inset: 0 }}>
          {userPosts.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                flex: 1,
                minHeight: '50vh',
                cursor: 'pointer',
                gap: '16px',
                paddingTop: gridSpacerCss(gridSpacer),
              }}
              onClick={() => {
                setSpinning(true);
                setTimeout(() => {
                  setSpinning(false);
                  setShowCreatePost(true);
                }, 600);
              }}
            >
              {/* Brief 2.2 (node 142:873) — house ghost CTA: 301×23, radius 3,
                  fill rgba(217,217,217,0.07), 0.25px hairline border. The outer div
                  still owns the spin→create tap (behavior unchanged); the plus keeps
                  its spin. */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: 301, maxWidth: '82%', height: 23, borderRadius: 3,
                background: 'rgba(217,217,217,0.07)', border: '0.25px solid var(--hairline)',
                padding: '0 12px', boxSizing: 'border-box',
              }}>
                <span style={{ position: 'relative', width: 11, height: 12, flexShrink: 0, display: 'inline-block', animation: spinning ? 'spin 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : 'none' }}>
                  <span style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--ink-100)', transform: 'translateY(-50%)' }} />
                  <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'var(--ink-100)', transform: 'translateX(-50%)' }} />
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10.5, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', textTransform: 'uppercase' }}>Create your first post</span>
              </div>
            </div>
          ) : (
            <div
              ref={gridScrollRef}
              className="overflow-y-auto h-full px-[1px]"
              onScroll={(e) => {
                if (rafPendingRef.current) return;
                rafPendingRef.current = true;
                const el = e.currentTarget;
                requestAnimationFrame(() => {
                  setGridScrollY(Math.max(0, el.scrollTop));
                  rafPendingRef.current = false;
                });
              }}
            >
              <div style={{ height: gridSpacerCss(gridSpacer), flexShrink: 0 }} />
              {(() => {
                // Brief M6 — ONE pipeline for all media: every grid tap (image OR
                // video) opens the post-scroll (ProfilePostViewer) landing on the
                // tapped post. No solo video lightbox — GradedVideo renders video in
                // post-scroll (empty-media-safe on stream_uid), and rotate→theatre
                // works there via the shared M3a hook.
                const openPost = (_post: any, index: number) => {
                  setViewerIndex(index);
                  setShowViewer(true);
                };
                // Collage → masonry mosaic: each post at its own layout_id AR.
                if (userLayoutId === 'collage') {
                  return (
                    <div style={{ columnCount: 2, columnGap: 2 }}>
                      {userPosts.map((post, index) => (
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
                            onClick={() => openPost(post, index)}
                          />
                        </div>
                      ))}
                    </div>
                  );
                }
                // Non-collage → unchanged uniform grid.
                return (
                  <div className={`grid ${getColCount(userLayoutId)} gap-x-[1px] gap-y-[2px]`}>
                    {userPosts.map((post, index) => (
                      <PostCell
                        key={post.id}
                        post={post}
                        layoutId={userLayoutId}
                        index={index}
                        onClick={() => openPost(post, index)}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      <CreatePostFlow
        isOpen={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        userLayoutId={userLayoutId}
      />

      {showViewer && (
        <>
          <ProfilePostViewer
            posts={userPosts}
            initialIndex={viewerIndex}
            ownerUsername={userProfile.username}
            ownerAvatarUrl={userProfile.profileImage}
            onClose={() => setShowViewer(false)}
            isOwnProfile={true}
            onDeleted={(deletedPostId) => setUserPosts(prev => prev.filter(p => p.id !== deletedPostId))}
          />
        </>
      )}

      {showFollowersModal && user && (
        <FollowListModal
          type="followers"
          privyUserId={user.id}
          onClose={() => setShowFollowersModal(false)}
        />
      )}

      {showFollowingModal && user && (
        <FollowListModal
          type="following"
          privyUserId={user.id}
          onClose={() => setShowFollowingModal(false)}
        />
      )}

      {/* Decks bottom sheet overlay */}
      {showDecks && (
        <div
          className="bg-black"
          onClick={() => { setShowDecks(false); setActiveTab('main'); setShowNewDeckForm(false); setNewDeckTitle(''); setNewDeckDesc(''); }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 200 }}
        />
      )}

      {/* Decks bottom sheet */}
      <div
        className="bg-black"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: '70vh',
          backgroundColor: '#000000',
          borderTop: '1px solid white',
          zIndex: 201,
          transform: showDecks ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms ease',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header — Brief M5 §2: the shared PageTitle SHEET variant ("Decks", 26px, top-left,
            no logomark, clear space below). Drag handle + × close overlaid (sheet affordances). */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 40, height: 3, backgroundColor: 'rgba(229,225,219,0.3)', zIndex: 1 }} />
          <PageTitle title="Decks" variant="sheet" paddingBottom={14} />
          <button
            onClick={() => { setShowDecks(false); setActiveTab('main'); setShowNewDeckForm(false); setNewDeckTitle(''); setNewDeckDesc(''); }}
            style={{ position: 'absolute', top: 10, right: 16, fontSize: 'var(--fs-18)', color: '#E5E1DB', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Deck list — Brief M5 §6: contain overscroll so the sheet list can't rubber-band-
            chain to the locked body. */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '0 16px' }}>
          {decksLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}>
              <FrameLoader />
            </div>
          ) : userDecks.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}>
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase' }}>No decks yet</span>
            </div>
          ) : (
            userDecks.map(deck => (
              <div
                key={deck.id}
                /* Brief M5 §3 — navigate DIRECTLY; do NOT setShowDecks(false) first (that
                   uncovered the profile for a frame → the flash). The sheet stays up over
                   the profile until the route swaps to the deck's own loader. Back remounts
                   the profile fresh (showDecks defaults false → sheet closed). */
                onClick={() => router.push(`/profile/${userProfile.username}/decks/${deck.id}`)}
                style={{ marginBottom: 12, cursor: 'pointer' }}
              >
                {/* Cover — Brief M5 §1: the BAKED collage WebP (thumbnail_url, fast path) if
                    present; else a live COLLAGE of the deck's first 3–4 post thumbnails
                    (feedImage 600-class, video posters included via getUserDecks); else the
                    quiet placeholder tile (DeckThumbnail n===0). */}
                {deck.thumbnail_url ? (
                  <div style={{ width: '100%', aspectRatio: getDeckAspect(deck.grid_layout), overflow: 'hidden', background: '#1a1a1a' }}>
                    <img src={deck.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ) : (
                  <DeckThumbnail
                    imageUrls={deck.thumbnail_urls.slice(0, 4).map((u) => feedImage(u, THUMB_WIDTH))}
                    title={deck.title}
                    aspectRatio={getDeckAspect(deck.grid_layout)}
                  />
                )}
                {/* Title + count */}
                <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-10)', color: '#E5E1DB', margin: '4px 0 0', textTransform: 'uppercase' }}>{deck.title}</p>
                <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.5)', margin: '2px 0 0' }}>{deck.item_count} frames</p>
              </div>
            ))
          )}
        </div>

        {/* NEW DECK footer — own profile only. Bottom padding clears the home
            indicator + the app footer band so the button is never buried at the edge. */}
        <div style={{ flexShrink: 0, padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid rgba(229,225,219,0.12)' }}>
          {!showNewDeckForm ? (
            <button
              onClick={() => setShowNewDeckForm(true)}
              style={{ display: 'block', width: '100%', border: '1px solid white', background: 'transparent', color: '#E5E1DB', fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-11)', textTransform: 'uppercase', padding: '8px', cursor: 'pointer', borderRadius: 0 }}
            >
              ＋ NEW DECK
            </button>
          ) : (
            <div>
              <input
                autoFocus
                type="text"
                placeholder="Deck title"
                value={newDeckTitle}
                onChange={e => setNewDeckTitle(e.target.value)}
                style={{ display: 'block', width: '100%', background: 'transparent', border: '1px solid white', color: '#E5E1DB', ...SKR, fontSize: 'max(16px, var(--fs-10))', padding: '8px', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newDeckDesc}
                onChange={e => setNewDeckDesc(e.target.value)}
                style={{ display: 'block', width: '100%', background: 'transparent', border: '1px solid white', color: '#E5E1DB', ...SKR, fontSize: 'max(16px, var(--fs-10))', padding: '8px', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={async () => {
                    if (!newDeckTitle.trim() || !user || creatingDeck) return;
                    setCreatingDeck(true);
                    try {
                      const deck = await createDeck(user.id, userProfile.username, newDeckTitle.trim(), newDeckDesc.trim());
                      // Land the user straight inside the new deck's editor, ready
                      // to fill it — dismiss the pull-up + form so nothing stacks behind.
                      setNewDeckTitle(''); setNewDeckDesc(''); setShowNewDeckForm(false); setShowDecks(false);
                      router.push(`/profile/${userProfile.username}/decks/${deck.id}`);
                    } catch (e: any) {
                      const lt = getScopeLimitType(e);
                      if (lt) { setCreatingDeck(false); showUpsell(lt); return; }
                      console.error('createDeck error:', e);
                    } finally { setCreatingDeck(false); }
                  }}
                  disabled={!newDeckTitle.trim() || creatingDeck}
                  style={{ flex: 1, border: '1px solid white', background: 'transparent', color: '#E5E1DB', ...SKR, fontSize: 'var(--fs-10)', padding: '8px', cursor: 'pointer', opacity: newDeckTitle.trim() ? 1 : 0.4, textTransform: 'uppercase' }}
                >
                  {creatingDeck ? 'Creating…' : 'CREATE'}
                </button>
                <button
                  onClick={() => { setShowNewDeckForm(false); setNewDeckTitle(''); setNewDeckDesc(''); }}
                  style={{ flex: 1, border: '1px solid rgba(229,225,219,0.4)', background: 'transparent', color: 'rgba(229,225,219,0.6)', ...SKR, fontSize: 'var(--fs-10)', padding: '8px', cursor: 'pointer', textTransform: 'uppercase' }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ProfileDataSheet
        isOpen={profileDataOpen}
        onClose={() => setProfileDataOpen(false)}
        onExploreBadges={() => { setProfileDataOpen(false); setShowBadgeSheet(true); }}
        profile={rawProfile}
        links={profileLinks}
        isOwnProfile={true}
        followers={analytics.followers}
        following={analytics.following}
        totalPosts={analytics.totalPosts}
        collectors={analytics.collectors}
        portfolioMc={analytics.portfolioMc}
        decks={userDecks.length}
        firstCutCount={firstCutCount}
        badges={resolvedBadges}
        bannerClearH={headerH}
      />

      <BadgeExplainerSheet
        visible={showBadgeSheet}
        onClose={() => setShowBadgeSheet(false)}
        onJoinPress={() => { setShowBadgeSheet(false); setShowMembershipSheet(true); }}
        userTiers={{
          isFree: !isPaidMember && !isTopCollector && !isFoundingMember && !isInHouseCreator,
          isInHouseCreator,
          isPaidMember,
          isTopCollector,
          isFoundingMember,
          foundingMemberNumber,
        }}
        isPaidMember={isPaidMember}
        paidMemberUntil={paidMemberUntil}
        onManageMembership={() => { setShowBadgeSheet(false); router.push('/membership/manage'); }}
      />

      <MembershipSheet
        visible={showMembershipSheet}
        onClose={() => setShowMembershipSheet(false)}
        isPaidMember={isPaidMember}
        paidMemberUntil={paidMemberUntil}
        onSuccess={(plan, txHash) => {
          setShowMembershipSheet(false);
          setIsPaidMember(true);
          const foundingParam = isFoundingMember ? `&founding=true&founding_number=${foundingMemberNumber || 1}` : '';
          window.location.href = `/membership/success?plan=${plan}${foundingParam}`;
        }}
      />

    </div>

      {/* ── Fixed chrome LIFTED out of the scroller → SIBLINGS of it, so on iOS
          standalone they anchor to the VIEWPORT, not the .screen-min scroll container
          (which floated the footer above the screen bottom). State (gridScrollY,
          headerSnapped, …) is component-level, so it's in scope here unchanged. ── */}
      {!headerSnapped && gridScrollY > 20 && (
        <div
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); snapScrollYRef.current = gridScrollY; setHeaderSnapped(true); setSnapAnimKey(k => k + 1); }}
          style={{
            position: 'fixed',
            top: 'calc(8px + env(safe-area-inset-top, 0px))',
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

      <BottomToolbar
        page="profile"
        onHamburgerPress={() => router.push('/profile/preferences')}
      />
    </div>
  );
}
