"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, getFollowerCount, getFollowingCount, getUserDecks, createDeck, getProfileLinks, isProMember, type Deck, type ProfileLink } from "@/lib/userService";
import ProfileDataSheet from "@/components/ProfileDataSheet";
import { getUserPosts } from '@/lib/postsService';
import CreatePostFlow from "@/components/CreatePostFlow";
import FollowListModal from "@/components/FollowListModal";
import TheaterCarousel from "@/components/TheaterCarousel";
import ProfilePostViewer from "@/components/ProfilePostViewer";
import BadgeExplainerSheet from "@/components/BadgeExplainerSheet";
import MembershipSheet from "@/components/MembershipSheet";
import BottomToolbar from "@/components/BottomToolbar";
import MediaRenderer from "@/components/MediaRenderer";
import PostModal from "@/components/PostModal";
import OnboardingModal from "@/components/OnboardingModal";
import AddToHomeScreenSheet from "@/components/AddToHomeScreenSheet";
import { shouldShowA2HS } from "@/lib/pwaUtils";
import PostCell from "@/components/PostCell";
import { getColCount } from "@/lib/aspectRatio";
import { getScopeLimitType } from "@/lib/limits";
import { useUpsell } from "@/components/UpsellProvider";
import FrameLoader from "@/components/FrameLoader";
import BannerBadgeStrip from "@/components/BannerBadgeStrip";
import { resolveBadges } from "@/lib/economy/badges";
import { useEconomy } from "@/components/EconomyProvider";
import { economyPreviewEnabled } from "@/lib/economy/flag";
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
  const [showTheater, setShowTheater] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxPost, setLightboxPost] = useState<any>(null);
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
  const [foundingMemberNumber, setFoundingMemberNumber] = useState<number | null>(null);
  const [paidMemberUntil, setPaidMemberUntil] = useState<Date | null>(null);
  const [showMembershipSheet, setShowMembershipSheet] = useState(false);
  const [showA2HS, setShowA2HS] = useState(false);
  // First Cut count drives the pfp stack's First Cut coin. Read ONLY through the
  // economy boundary, and ONLY when the preview flag is on — so nothing implies
  // founding positions that aren't real yet. Off-flag it stays 0 (coin absent).
  const economy = useEconomy();
  const [firstCutCount, setFirstCutCount] = useState(0);
  useEffect(() => {
    if (!economyPreviewEnabled() || !supabaseUserId) { setFirstCutCount(0); return; }
    let cancelled = false;
    economy.getBadges(supabaseUserId)
      .then((b) => { if (!cancelled) setFirstCutCount(b.firstCutCount ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [economy, supabaseUserId]);

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
  const [gridScrollY, setGridScrollY] = useState(0);
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
  const tabRowOffset = Math.min(gridScrollY, 101);
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
            setFoundingMemberNumber(profile.founding_member_number || null);
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

  useEffect(() => {
  if (rawProfile?.grid_layout) {
    setStableLayoutId(rawProfile.grid_layout); 
  }
  }, [rawProfile?.grid_layout]);

  useEffect(() => {
    if (!showDecks || !user) return;
    setDecksLoading(true);
    getUserDecks(user.id)
      .then(setUserDecks)
      .catch(console.error)
      .finally(() => setDecksLoading(false));
  }, [showDecks, user?.id]);

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

  return (
    <div className="bg-black relative w-full max-w-[375px] min-h-screen mx-auto pb-[60px]">
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

      {/* Header */}
      <div
        onClick={profileDataOpen ? () => setProfileDataOpen(false) : undefined}
        style={{
          position: 'relative',
          height: 124,
          background: '#000',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          boxSizing: 'content-box',
          opacity: profileDataOpen ? 1 : Math.max(0, 1 - gridScrollY / 20),
          pointerEvents: (profileDataOpen || gridScrollY < 20) ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
          zIndex: profileDataOpen ? 200 : 10,
        }}
      >

      {/* Badge backdrop strip — PIECE 1. Sits to the LEFT of the PFP with a
          0.5px divider between (default hairline; Piece 2 colours it). Same
          component on own + public. Renders the user's earned badges generically
          (min-design icons, fixed 16px, symmetric for any count). */}
      <div style={{ position: 'absolute', left: 12, top: 10, zIndex: 3 }}>
        <BannerBadgeStrip
          height={80}
          badges={resolveBadges({ isFoundingMember, isTopCollector, isPaidMember, isInHouseCreator, firstCutCount })
            .filter((b) => b.bannerSrc)
            .map((b) => ({ key: b.key, src: b.bannerSrc as string, title: b.title }))}
          onPress={() => setShowBadgeSheet(true)}
        />
      </div>

      {/* PFP container — shifted right (40) to make room for the 27px strip. */}
      <div style={{ position: 'absolute', left: 40, top: 10, width: 80, height: 80 }}>

        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1 }}>
          {userProfile.profileImage ? (
            <img src={userProfile.profileImage} alt="Profile" style={{ width: 80, height: 80, objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: 80, height: 80, backgroundColor: '#222' }} />
          )}
        </div>

        {/* Legacy badge UI removed (clean slate) — the BadgeStack coins, the
            right-edge membership stripes, and the unlock flare are replaced by
            the BannerBadgeStrip (left of the PFP) + Piece 2's divider colour. */}
      </div>

      {/* Name */}
      <div style={{ position: 'absolute', left: 130, top: 10 }}>
        <p style={{ ...SKB, fontSize: 13, color: 'white', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0, textTransform: 'uppercase' }}>
          {userProfile.displayName}
        </p>
      </div>

      {/* Handle */}
      <div style={{ position: 'absolute', left: 130, top: 26 }}>
        <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0, textTransform: 'uppercase' }}>
          {userProfile.username ? `@${userProfile.username}` : ''}
        </p>
      </div>

      {/* Info sheet trigger */}
      <button
        onClick={() => setProfileDataOpen(true)}
        style={{
          position: 'absolute', top: 0, right: 0,
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 7,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
          opacity: profileDataOpen ? 0 : 1,
          pointerEvents: profileDataOpen ? 'none' : 'auto',
          transition: 'opacity 200ms ease',
        }}
        aria-label="View profile info"
      >
        <div style={{
          width: 14.6, height: 11.2,
          border: '0.5px solid #FFFFFF',
          background: profileDataOpen ? '#FFFFFF' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxSizing: 'border-box',
          transition: 'background 200ms ease',
        }}>
          <span style={{
            fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700,
            fontSize: 15.7, letterSpacing: '-0.02em',
            color: profileDataOpen ? '#000000' : '#FFFFFF',
            lineHeight: 1, display: 'block',
            transform: 'translateY(-1px)',
            transition: 'color 200ms ease',
          }}>i</span>
        </div>
      </button>

      </div>{/* end header */}

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
          <svg width="28" height="14" viewBox="0 0 32 16" fill="none">
            <line x1="1" y1="1" x2="1" y2="6" stroke="#FF0000" strokeWidth="1.1"/>
            <line x1="1" y1="1" x2="7" y2="1" stroke="#FF0000" strokeWidth="0.85"/>
            <line x1="31" y1="1" x2="31" y2="6" stroke="#FF0000" strokeWidth="1.1"/>
            <line x1="25" y1="1" x2="31" y2="1" stroke="#FF0000" strokeWidth="0.85"/>
            <line x1="1" y1="15" x2="1" y2="10" stroke="#FF0000" strokeWidth="1.1"/>
            <line x1="1" y1="15" x2="7" y2="15" stroke="#FF0000" strokeWidth="0.85"/>
            <line x1="31" y1="15" x2="31" y2="10" stroke="#FF0000" strokeWidth="1.1"/>
            <line x1="25" y1="15" x2="31" y2="15" stroke="#FF0000" strokeWidth="0.85"/>
          </svg>
        </div>
      )}

      {/* Tab row — absolute until scrolled past 101px, then fixed. When snapped, always fixed + aligned with frame icon. */}
      <div style={{
        position: (headerSnapped || headerUnsnapping || gridScrollY > 101) ? 'fixed' : 'absolute',
        top: (headerSnapped || headerUnsnapping) ? 0 : gridScrollY > 101 ? 2 : `${103 - tabRowOffset}px`,
        left: (headerSnapped || headerUnsnapping || gridScrollY > 101) ? '50%' : 0,
        right: (headerSnapped || headerUnsnapping || gridScrollY > 101) ? 'auto' : 0,
        transform: (headerSnapped || headerUnsnapping || gridScrollY > 101) ? 'translateX(-50%)' : 'none',
        width: (headerSnapped || headerUnsnapping || gridScrollY > 101) ? '100%' : 'auto',
        maxWidth: 375,
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
        <div key={snapAnimKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', height: 20 }}>
          {/* First slot: frame icon when snapped or unsnapping (dismiss), MAIN text when at top */}
          {(headerSnapped || headerUnsnapping) ? (
            <button
              onClick={dismissSnapMenu}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', animation: headerUnsnapping ? 'snapOutLeft 0.28s cubic-bezier(0.16,1,0.3,1) 165ms both' : 'snapInLeft 0.32s cubic-bezier(0.16,1,0.3,1) 0ms both' }}
            >
              <svg width="28" height="14" viewBox="0 0 32 16" fill="none">
                <line x1="1" y1="1" x2="1" y2="6" stroke="#FF0000" strokeWidth="1.1"/>
                <line x1="1" y1="1" x2="7" y2="1" stroke="#FF0000" strokeWidth="0.85"/>
                <line x1="31" y1="1" x2="31" y2="6" stroke="#FF0000" strokeWidth="1.1"/>
                <line x1="25" y1="1" x2="31" y2="1" stroke="#FF0000" strokeWidth="0.85"/>
                <line x1="1" y1="15" x2="1" y2="10" stroke="#FF0000" strokeWidth="1.1"/>
                <line x1="1" y1="15" x2="7" y2="15" stroke="#FF0000" strokeWidth="0.85"/>
                <line x1="31" y1="15" x2="31" y2="10" stroke="#FF0000" strokeWidth="1.1"/>
                <line x1="25" y1="15" x2="31" y2="15" stroke="#FF0000" strokeWidth="0.85"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('main')}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: activeTab === 'main' ? '#FF0000' : 'white', textTransform: 'uppercase', letterSpacing: '-0.16px' }}>MAIN</span>
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
              src="/theatre-mode-logo-new-lg.png"
              style={{ height: 26, width: 'auto', display: 'block', opacity: activeTab === 'theatre' ? 1 : 0.7, position: 'relative', left: (headerSnapped || headerUnsnapping) ? 0 : 10 }}
              alt="Theatre"
            />
          </button>

          <button
            onClick={() => setActiveTab('collected')}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', animation: headerUnsnapping ? 'snapOutRight 0.28s cubic-bezier(0.16,1,0.3,1) 0ms both' : headerSnapped ? 'snapInRight 0.32s cubic-bezier(0.16,1,0.3,1) 165ms both' : 'none' }}
          >
            <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: activeTab === 'collected' ? '#FF0000' : 'white', textTransform: 'uppercase', letterSpacing: '-0.16px' }}>COLLECTED</span>
          </button>
        </div>
      </div>

      {/* COLLECTED — the real page (ownership as identity): posts this user
          holds pieces of, EXCLUDING their own (ratified). */}
      {activeTab === 'collected' && supabaseUserId && (
        <div style={{ position: 'absolute', top: 140, left: 0, right: 0, bottom: 60, overflowY: 'auto' }}>
          <CollectedGrid userId={supabaseUserId} isOwn />
        </div>
      )}

      {/* Posts grid — header space reserved by spacer in scroll content, not by moving the container. */}
      {layoutLoaded && activeTab === 'main' && (
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
                paddingTop: 140,
              }}
              onClick={() => {
                setSpinning(true);
                setTimeout(() => {
                  setSpinning(false);
                  setShowCreatePost(true);
                }, 600);
              }}
            >
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: '11px', color: 'white', margin: 0, lineHeight: '1.4', textTransform: 'uppercase' }}>
                Create<br/>your<br/>first<br/>post
              </p>
              <div style={{ position: 'relative', width: '48px', height: '48px', flexShrink: 0, animation: spinning ? 'spin 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : 'none' }}>
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'white', transform: 'translateY(-50%)' }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'white', transform: 'translateX(-50%)' }} />
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
              <div style={{ height: 140, flexShrink: 0 }} />
              {(() => {
                const openPost = (post: any, index: number) => {
                  const isVid = post.media_type === 'video' ||
                    ['mp4','mov','webm'].includes(
                      post.media_urls?.[0]?.split('?')[0].split('.').pop()?.toLowerCase() || ''
                    );
                  if (isVid) {
                    setLightboxPost(post);
                    setShowLightbox(true);
                  } else {
                    setViewerIndex(index);
                    setShowViewer(true);
                  }
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

      {showLightbox && lightboxPost && (
        <PostModal
          post={lightboxPost}
          onClose={() => { setShowLightbox(false); setLightboxPost(null); }}
          onScrollDown={() => {
            setShowLightbox(false);
            setLightboxPost(null);
            const idx = userPosts.findIndex(p => p.id === lightboxPost.id);
            setViewerIndex(idx >= 0 ? idx : 0);
            setShowViewer(true);
          }}
          isOwner={true}
          supabaseUserId={supabaseUserId}
          onTheaterMode={() => { setShowLightbox(false); setLightboxPost(null); setActiveTab('theatre'); }}
          onDeleted={(deletedPostId) => setUserPosts(prev => prev.filter(p => p.id !== deletedPostId))}
          layoutId={userLayoutId}
        />
      )}

      {showTheater && (
        <TheaterCarousel
          posts={userPosts}
          onClose={() => setShowTheater(false)}
          supabaseUserId={supabaseUserId}
          viewerUsername={userProfile.username}
        />
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
        {/* Header */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 16px 10px', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 40, height: 3, backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 11, color: 'white', letterSpacing: '0.05em', textTransform: 'uppercase' }}>DECKS</span>
          <button
            onClick={() => { setShowDecks(false); setActiveTab('main'); setShowNewDeckForm(false); setNewDeckTitle(''); setNewDeckDesc(''); }}
            style={{ position: 'absolute', right: 16, fontSize: 18, color: 'white', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Deck list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {decksLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}>
              <FrameLoader />
            </div>
          ) : userDecks.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}>
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 11, color: 'white', textTransform: 'uppercase' }}>No decks yet</span>
            </div>
          ) : (
            userDecks.map(deck => (
              <div
                key={deck.id}
                onClick={() => { setShowDecks(false); router.push(`/profile/${userProfile.username}/decks/${deck.id}`); }}
                style={{ marginBottom: 12, cursor: 'pointer' }}
              >
                {/* Thumbnail */}
                <div style={{ width: '100%', aspectRatio: getDeckAspect(deck.grid_layout), overflow: 'hidden', background: '#1a1a1a' }}>
                  {deck.thumbnail_urls.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: thumbCols(deck.thumbnail_urls.length), width: '100%', height: '100%' }}>
                      {deck.thumbnail_urls.map((url, i) => (
                        <img key={i} src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ))}
                    </div>
                  ) : null}
                </div>
                {/* Title + count */}
                <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 10, color: 'white', margin: '4px 0 0', textTransform: 'uppercase' }}>{deck.title}</p>
                <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 9, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>{deck.item_count} frames</p>
              </div>
            ))
          )}
        </div>

        {/* NEW DECK footer — own profile only */}
        <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          {!showNewDeckForm ? (
            <button
              onClick={() => setShowNewDeckForm(true)}
              style={{ display: 'block', width: '100%', border: '1px solid white', background: 'transparent', color: 'white', fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 11, textTransform: 'uppercase', padding: '8px', cursor: 'pointer', borderRadius: 0 }}
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
                style={{ display: 'block', width: '100%', background: 'transparent', border: '1px solid white', color: 'white', ...SKR, fontSize: 10, padding: '8px', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newDeckDesc}
                onChange={e => setNewDeckDesc(e.target.value)}
                style={{ display: 'block', width: '100%', background: 'transparent', border: '1px solid white', color: 'white', ...SKR, fontSize: 10, padding: '8px', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
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
                  style={{ flex: 1, border: '1px solid white', background: 'transparent', color: 'white', ...SKR, fontSize: 10, padding: '8px', cursor: 'pointer', opacity: newDeckTitle.trim() ? 1 : 0.4, textTransform: 'uppercase' }}
                >
                  {creatingDeck ? 'Creating…' : 'CREATE'}
                </button>
                <button
                  onClick={() => { setShowNewDeckForm(false); setNewDeckTitle(''); setNewDeckDesc(''); }}
                  style={{ flex: 1, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: 'rgba(255,255,255,0.6)', ...SKR, fontSize: 10, padding: '8px', cursor: 'pointer', textTransform: 'uppercase' }}
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
        profile={rawProfile}
        links={profileLinks}
        isOwnProfile={true}
        followers={analytics.followers}
        following={analytics.following}
        totalPosts={analytics.totalPosts}
        collectors={analytics.collectors}
        portfolioMc={analytics.portfolioMc}
        firstCutCount={firstCutCount}
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

      <BottomToolbar
        page="profile"
        onHamburgerPress={() => router.push('/profile/preferences')}
      />



    </div>
  );
}
