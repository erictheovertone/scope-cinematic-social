"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, getFollowerCount, getFollowingCount, getUserDecks, createDeck, getProfileLinks, type Deck, type ProfileLink } from "@/lib/userService";
import LinksSheet from "@/components/LinksSheet";
import { getUserPosts } from '@/lib/postsService';
import CreatePostFlow from "@/components/CreatePostFlow";
import FollowListModal from "@/components/FollowListModal";
import TheaterCarousel from "@/components/TheaterCarousel";
import ProfilePostViewer from "@/components/ProfilePostViewer";
import BadgeExplainerSheet from "@/components/BadgeExplainerSheet";
import MembershipSheet from "@/components/MembershipSheet";
import BottomToolbar from "@/components/BottomToolbar";
import MediaRenderer from "@/components/MediaRenderer";
import VideoLightbox from "@/components/VideoLightbox";

const COLLAGE_ASPECTS = ['aspect-video', 'aspect-[2.39/1]', 'aspect-[4/3]', 'aspect-square'];

function getGridCols(layoutId: string): string {
  switch (layoutId) {
    case '2x-super-wide':
    case '2x-regular-wide':
    case 'collage':
      return 'grid-cols-2';
    case '1x-super-wide':
      return 'grid-cols-1';
    case '3x-square':
    default:
      return 'grid-cols-3';
  }
}

function getPostAspect(layoutId: string, index: number): string {
  switch (layoutId) {
    case '2x-super-wide':
    case '1x-super-wide':
      return 'aspect-[2.39/1]';
    case '2x-regular-wide':
      return 'aspect-video';
    case '3x-square':
      return 'aspect-square';
    case 'collage':
      return COLLAGE_ASPECTS[index % COLLAGE_ASPECTS.length];
    default:
      return 'aspect-[2.39/1]';
  }
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function Profile() {
  const { user } = usePrivy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [showTheater, setShowTheater] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  console.log('[profile] showViewer state declared');
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
  const [userLayoutId, setUserLayoutId] = useState('1x-super-wide');
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
  const [showLinks, setShowLinks] = useState(false);
  const [profileLinks, setProfileLinks] = useState<ProfileLink[]>([]);
  const [showBadgeSheet, setShowBadgeSheet] = useState(false);
  const [isPaidMember, setIsPaidMember] = useState(false);
  const [isTopCollector, setIsTopCollector] = useState(false);
  const [isInHouseCreator, setIsInHouseCreator] = useState(false);
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [foundingMemberNumber, setFoundingMemberNumber] = useState<number | null>(null);
  const [paidMemberUntil, setPaidMemberUntil] = useState<Date | null>(null);
  const [showMembershipSheet, setShowMembershipSheet] = useState(false);
  const [badgeJustUnlocked, setBadgeJustUnlocked] = useState(false);
  const [gridScrollY, setGridScrollY] = useState(0);
  const headerOpacity = Math.max(0, 1 - gridScrollY / 80);
  const gridTop = Math.max(30, 140 - gridScrollY);
  const tabRowOffset = Math.min(gridScrollY, 101);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      try {
        const supabaseUser = await getUserByPrivyId(user.id);
        if (supabaseUser) {
          setSupabaseUserId(supabaseUser.id);
          const profile = await getProfile(supabaseUser.id) as any;
          if (profile) {
            setUserProfile({
              displayName: profile.display_name || "",
              username: profile.username || "",
              bio: profile.bio || "",
              profileImage: profile.profile_image_url || null,
              websiteUrl: profile.website_url || "",
            });
            if (profile.grid_layout) setUserLayoutId(profile.grid_layout);
            const memberUntil = profile.paid_member_until ? new Date(profile.paid_member_until) : null;
            const isActiveMember = memberUntil ? memberUntil > new Date() : false;
            setIsPaidMember(isActiveMember);
            setPaidMemberUntil(memberUntil);
            setIsTopCollector(profile.is_top_collector || false);
            setIsInHouseCreator(profile.is_in_house_creator || false);
            setIsFoundingMember(profile.is_founding_member || false);
            setFoundingMemberNumber(profile.founding_member_number || null);
            console.log('[profile] paid_member_until:', profile.paid_member_until, 'isActiveMember:', isActiveMember);
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
          getUserPosts(user.id),
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
      setBadgeJustUnlocked(true);
      setTimeout(() => setBadgeJustUnlocked(false), 3000);
      setTimeout(() => {
        if (user) {
          getUserByPrivyId(user.id).then(async (supabaseUser) => {
            if (supabaseUser) {
              const profile = await getProfile(supabaseUser.id) as any;
              if (profile) {
                const memberUntil = profile.paid_member_until ? new Date(profile.paid_member_until) : null;
                const isActiveMember = memberUntil ? memberUntil > new Date() : false;
                setIsPaidMember(isActiveMember);
              }
            }
          });
        }
      }, 1500);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user || showCreatePost) return;
    getUserPosts(user.id)
      .then(posts => {
        setUserPosts(posts);
        setAnalytics(prev => ({ ...prev, totalPosts: posts.length }));
      })
      .catch(console.error);
  }, [showCreatePost]);

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
    if (gl.includes('2.4') || gl.includes('2.39') || gl === 'collage') return '2.39 / 1';
    if (gl.includes('16:9') || gl.includes('16-9')) return '16 / 9';
    if (gl.includes('4:3') || gl.includes('4-3')) return '4 / 3';
    return '2.39 / 1';
  };
  const thumbCols = (n: number) => n <= 1 ? '1fr' : n <= 4 ? '1fr 1fr' : '1fr 1fr 1fr';

  return (
    <div className="bg-black relative w-full max-w-[375px] min-h-screen mx-auto pb-[60px]">

      {/* PFP container — left:11px, top:11px, 75×75px */}
      <div style={{ position: 'absolute', left: 11, top: 11, width: 75, height: 75, opacity: headerOpacity, pointerEvents: headerOpacity < 0.1 ? 'none' : 'auto' }}>

        {/* PFP image — fills container exactly */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1 }}>
          {userProfile.profileImage ? (
            <img src={userProfile.profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', backgroundColor: '#222' }} />
          )}
        </div>

        {/* Right-edge stripe only */}
        {isFoundingMember && (
          <div style={{
            position: 'absolute', right: 0, top: 0, width: 1, height: '100%',
            background: 'linear-gradient(180deg, #ff0080, #ffe100, #00cfff, #cc00ff)',
            backgroundSize: '100% 300%',
            animation: 'holoShift 4s linear infinite',
            zIndex: 2,
          }} />
        )}
        {isTopCollector && !isFoundingMember && (
          <div style={{ position: 'absolute', right: 0, top: 0, width: 1, height: '100%', backgroundColor: '#C9A84C', zIndex: 2 }} />
        )}
        {isPaidMember && !isTopCollector && !isFoundingMember && (
          <div style={{
            position: 'absolute', right: 0, top: 0, width: 1, height: '100%',
            backgroundColor: '#FF0000',
            zIndex: 2,
            animation: badgeJustUnlocked ? 'stripeShine 1.5s ease forwards' : 'none',
          }} />
        )}
        {isInHouseCreator && !isPaidMember && !isTopCollector && !isFoundingMember && (
          <div style={{ position: 'absolute', right: 0, top: 0, width: 1, height: '100%', backgroundColor: 'rgba(255,255,255,0.4)', zIndex: 2 }} />
        )}

        {/* Badge — bleeds outside top-left corner of PFP */}
        {(() => {
          let src = '';
          let size = 21;
          if (isFoundingMember) { src = '/augmented-member-founding-500-aperture.png'; size = 23.5; }
          else if (isTopCollector) { src = '/top-1k-collector-aperture-gold.png'; size = 23; }
          else if (isPaidMember) { src = '/scope-pro-icon-aperture.png'; size = 23; }
          else if (isInHouseCreator) { src = '/in-house-creator-logo-grey.png'; size = 21; }
          else { src = '/free-tier-aperture-logo-red.png'; size = 21; }
          return (
            <>
              <img
                src={src}
                alt="Badge"
                onClick={(e) => { e.stopPropagation(); setShowBadgeSheet(true); }}
                style={{
                  position: 'absolute',
                  top: -10,
                  left: -10,
                  width: size,
                  height: size,
                  zIndex: 10,
                  cursor: 'pointer',
                  display: 'block',
                  filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.9)) drop-shadow(0 0 3px rgba(0,0,0,0.8))',
                }}
              />
              {badgeJustUnlocked && (
                <div style={{
                  position: 'absolute',
                  top: -10,
                  left: -10,
                  width: '140%',
                  height: '140%',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.3) 30%, transparent 70%)',
                  animation: 'badgeFlare 1.8s ease forwards',
                  pointerEvents: 'none',
                  zIndex: 11,
                }} />
              )}
            </>
          );
        })()}
      </div>

      {/* Name */}
      <div style={{ position: 'absolute', left: 100, top: 11, opacity: headerOpacity, pointerEvents: headerOpacity < 0.1 ? 'none' : 'auto' }}>
        <p style={{ ...SKB, fontSize: 11, color: 'white', letterSpacing: '-0.22px', lineHeight: 1.4, margin: 0, textTransform: 'uppercase' }}>
          {userProfile.displayName}
        </p>
      </div>

      {/* Username */}
      <div style={{ position: 'absolute', left: 100, top: 24, display: 'flex', alignItems: 'center', gap: 0, opacity: headerOpacity, pointerEvents: headerOpacity < 0.1 ? 'none' : 'auto' }}>
        <p style={{ ...SKB, fontSize: 6, color: 'white', letterSpacing: '-0.12px', lineHeight: 1.4, margin: 0, textTransform: 'uppercase' }}>
          {userProfile.username ? `@${userProfile.username}` : ''}
        </p>
      </div>

      {/* Bio */}
      <div style={{ position: 'absolute', left: 98, top: 13, height: 73, width: 155, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden', paddingBottom: 0, opacity: headerOpacity, pointerEvents: headerOpacity < 0.1 ? 'none' : 'auto' }}>
        {(() => {
          const bioTruncated = userProfile.bio.slice(0, 72);
          const words = bioTruncated.toUpperCase().split(' ');
          let line1 = '';
          let line2 = '';
          for (const word of words) {
            if (!line1) {
              line1 = word;
            } else if ((line1 + ' ' + word).length <= 36) {
              line1 += ' ' + word;
            } else if (!line2) {
              line2 = word;
            } else if ((line2 + ' ' + word).length <= 36) {
              line2 += ' ' + word;
            } else {
              break;
            }
          }
          const bioLine1 = line1;
          const bioLine2 = line2;
          return (
            <>
              <p style={{ ...SKR, fontSize: 6, color: 'white', letterSpacing: '-0.12px', lineHeight: 1.4, margin: 0 }}>{bioLine1}</p>
              {bioLine2 && <p style={{ ...SKR, fontSize: 6, color: 'white', letterSpacing: '-0.12px', lineHeight: 1.4, margin: 0 }}>{bioLine2}</p>}
            </>
          );
        })()}
      </div>

      {/* VIEW DATA */}
      <button
        className="absolute bg-transparent border-none cursor-pointer"
        style={{ right: '4px', top: '11px', padding: 0, opacity: headerOpacity, pointerEvents: headerOpacity < 0.1 ? 'none' : 'auto' }}
        onClick={() => setIsDataOpen(v => !v)}
      >
        <span style={{ ...SKB, fontSize: 8, color: 'white', letterSpacing: '-0.2px', opacity: isDataOpen ? 0.45 : 1, transition: 'opacity 0.15s ease', textTransform: 'uppercase' }}>
          VIEW DATA
        </span>
      </button>

      {/* Links arrow */}
      <span
        onClick={() => setShowLinks(true)}
        style={{ position: 'absolute', left: 98, top: 44, fontSize: 24, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 300, color: 'white', opacity: headerOpacity * 0.8, cursor: 'pointer', lineHeight: 1, pointerEvents: headerOpacity < 0.1 ? 'none' : 'auto' }}
      >↗</span>

      {/* Stats cascade — ripples down one row at a time below VIEW DATA */}
      {isDataOpen && (
        <div className="absolute" style={{ right: '4px', top: '30px', backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 0, padding: 8 }}>
          {([
            ['COLLECTORS',   fmt(analytics.collectors),   null],
            ['TOTAL POSTS',  fmt(analytics.totalPosts),   null],
            ['FOLLOWERS',    fmt(analytics.followers),    () => setShowFollowersModal(true)],
            ['FOLLOWING',    fmt(analytics.following),    () => setShowFollowingModal(true)],
            ['PORTFOLIO MC', `$${fmt(analytics.portfolioMc)}`, null],
          ] as [string, string, (() => void) | null][]).map(([label, value, onClick], i) => (
            <div
              key={label}
              onClick={onClick ?? undefined}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '14px',
                animation: 'ripple-down 0.18s ease-out both',
                animationDelay: `${i * 50}ms`,
                cursor: onClick ? 'pointer' : 'default',
              }}
            >
              <span style={{ ...SKB, fontSize: '7px', color: 'rgba(255,255,255,0.55)', letterSpacing: '-0.1px', lineHeight: 1.7, textTransform: 'uppercase' }}>{label}</span>
              <span style={{ ...SKB, fontSize: '7px', color: 'white', letterSpacing: '-0.1px', lineHeight: 1.7 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tab row — absolute until scrolled past 101px, then fixed */}
      <div style={{
        position: gridScrollY > 101 ? 'fixed' : 'absolute',
        top: gridScrollY > 101 ? 2 : `${103 - tabRowOffset}px`,
        left: gridScrollY > 101 ? '50%' : 0,
        right: gridScrollY > 101 ? 'auto' : 0,
        transform: gridScrollY > 101 ? 'translateX(-50%)' : 'none',
        width: gridScrollY > 101 ? '100%' : 'auto',
        maxWidth: 375,
        zIndex: 40,
        background: gridScrollY > 20
          ? 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)'
          : 'transparent',
        paddingTop: 10,
        paddingBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', height: 20 }}>
          <button
            onClick={() => setActiveTab('main')}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: activeTab === 'main' ? '#FF0000' : 'white', textTransform: 'uppercase', letterSpacing: '-0.16px' }}>MAIN</span>
          </button>

          <button
            onClick={() => { setActiveTab('decks'); setShowDecks(true); }}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', position: 'relative', left: 35 }}
          >
            <img src="/decks-logo.png" style={{ height: 14, display: 'block', filter: activeTab === 'decks' ? 'invert(27%) sepia(100%) saturate(7000%) hue-rotate(0deg) brightness(100%) contrast(100%)' : 'none' }} alt="Decks" />
          </button>

          <button
            onClick={() => setActiveTab('theatre')}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', position: 'relative', left: 15 }}
          >
            <img src="/theatre-view-logo.png" style={{ height: 16, display: 'block', filter: activeTab === 'theatre' ? 'invert(27%) sepia(100%) saturate(7000%) hue-rotate(0deg) brightness(100%) contrast(100%)' : 'none' }} alt="Theatre" />
          </button>

          <button
            onClick={() => setActiveTab('collected')}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: activeTab === 'collected' ? '#FF0000' : 'white', textTransform: 'uppercase', letterSpacing: '-0.16px' }}>COLLECTED</span>
          </button>
        </div>
      </div>

      {activeTab === 'collected' && (
        <div style={{ position: 'absolute', top: 140, left: 0, right: 0, bottom: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.05em' }}>NO COLLECTED POSTS YET</p>
        </div>
      )}

      {/* Posts grid — top moves up as header fades. Only shown on main tab. */}
      {layoutLoaded && activeTab === 'main' && (
        <div style={{ position: 'absolute', inset: 0, top: `${gridTop}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
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
                setGridScrollY((e.target as HTMLElement).scrollTop);
              }}
            >
              <div className={`grid ${getGridCols(userLayoutId)} gap-x-[1px] gap-y-[2px] auto-rows-min`}>
                {userPosts.map((post, index) => (
                  <div
                    key={post.id}
                    className={`bg-[#222] overflow-hidden ${getPostAspect(userLayoutId, index)}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const post = userPosts[index];
                      const isVid = post.media_type === 'video' ||
                        ['mp4','mov','webm','mp4'].includes(
                          post.media_urls?.[0]?.split('?')[0].split('.').pop()?.toLowerCase() || ''
                        );
                      if (isVid) {
                        setLightboxPost(post);
                        setShowLightbox(true);
                      } else {
                        setViewerIndex(index);
                        setShowViewer(true);
                      }
                    }}
                  >
                    {post.media_urls?.[0] ? (
                      <MediaRenderer
                        url={post.media_urls[0]}
                        mediaType={post.media_type}
                        caption={post.caption || 'Post'}
                        thumbnailUrl={post.thumbnail_url}
                        autoplay={false}
                        showSoundToggle={false}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onClick={() => {
                          const p = userPosts[index];
                          const isVid = p.media_type === 'video' ||
                            ['mp4','mov','webm','mp4'].includes(
                              p.media_urls?.[0]?.split('?')[0].split('.').pop()?.toLowerCase() || ''
                            );
                          if (isVid) {
                            setLightboxPost(p);
                            setShowLightbox(true);
                          } else {
                            setViewerIndex(index);
                            setShowViewer(true);
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-[#222] flex items-center justify-center">
                        <span style={{ color: '#555', fontSize: '10px' }}>No media</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
          {console.log('[profile] rendering ProfilePostViewer')}
          <ProfilePostViewer
            posts={userPosts}
            initialIndex={viewerIndex}
            ownerUsername={userProfile.username}
            ownerAvatarUrl={userProfile.profileImage}
            onClose={() => {
              console.log('[profile] ProfilePostViewer onClose called');
              setShowViewer(false);
            }}
            isOwnProfile={true}
          />
        </>
      )}

      {showLightbox && lightboxPost && (
        <VideoLightbox
          post={lightboxPost}
          onClose={() => { setShowLightbox(false); setLightboxPost(null); }}
          onScrollDown={() => {
            setShowLightbox(false);
            setLightboxPost(null);
            const idx = userPosts.findIndex(p => p.id === lightboxPost.id);
            setViewerIndex(idx >= 0 ? idx : 0);
            setShowViewer(true);
          }}
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
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 59 }}
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
          zIndex: 60,
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
              <div style={{ width: 8, height: 8, background: '#FF0000', borderRadius: '50%' }} />
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
                style={{ display: 'block', width: '100%', background: 'transparent', border: '1px solid white', color: 'white', ...MONO, fontSize: 10, padding: '8px', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newDeckDesc}
                onChange={e => setNewDeckDesc(e.target.value)}
                style={{ display: 'block', width: '100%', background: 'transparent', border: '1px solid white', color: 'white', ...MONO, fontSize: 10, padding: '8px', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={async () => {
                    if (!newDeckTitle.trim() || !user || creatingDeck) return;
                    setCreatingDeck(true);
                    try {
                      await createDeck(user.id, userProfile.username, newDeckTitle.trim(), newDeckDesc.trim());
                      setNewDeckTitle(''); setNewDeckDesc(''); setShowNewDeckForm(false);
                      setDecksLoading(true);
                      getUserDecks(user.id).then(setUserDecks).catch(console.error).finally(() => setDecksLoading(false));
                    } catch (e) { console.error('createDeck error:', e); }
                    finally { setCreatingDeck(false); }
                  }}
                  disabled={!newDeckTitle.trim() || creatingDeck}
                  style={{ flex: 1, border: '1px solid white', background: 'transparent', color: 'white', ...MONO, fontSize: 10, padding: '8px', cursor: 'pointer', opacity: newDeckTitle.trim() ? 1 : 0.4 }}
                >
                  {creatingDeck ? 'Creating…' : 'CREATE'}
                </button>
                <button
                  onClick={() => { setShowNewDeckForm(false); setNewDeckTitle(''); setNewDeckDesc(''); }}
                  style={{ flex: 1, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: 'rgba(255,255,255,0.6)', ...MONO, fontSize: 10, padding: '8px', cursor: 'pointer' }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <LinksSheet
        username={userProfile.username}
        links={profileLinks}
        visible={showLinks}
        onClose={() => setShowLinks(false)}
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
