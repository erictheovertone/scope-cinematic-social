"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getProfileByUsername, getUserById, followUser, unfollowUser,
  isFollowing, getFollowerCount, getFollowingCount,
  getDecksByUsername, getProfileLinks, type Deck, type ProfileLink,
} from "@/lib/userService";
import ProfileDataSheet from "@/components/ProfileDataSheet";
import { getPostsByUsername } from "@/lib/postsService";
import ProfilePostViewer from "@/components/ProfilePostViewer";
import FollowListModal from "@/components/FollowListModal";
import BadgeExplainerSheet from "@/components/BadgeExplainerSheet";
import MembershipSheet from "@/components/MembershipSheet";
import BottomToolbar from "@/components/BottomToolbar";
import MediaRenderer from "@/components/MediaRenderer";
import PostCell from "@/components/PostCell";
import { getColCount } from "@/lib/aspectRatio";

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
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);

  // Badge state
  const [isPaidMember, setIsPaidMember] = useState(false);
  const [isTopCollector, setIsTopCollector] = useState(false);
  const [isInHouseCreator, setIsInHouseCreator] = useState(false);
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [foundingMemberNumber, setFoundingMemberNumber] = useState<number | null>(null);
  const [paidMemberUntil, setPaidMemberUntil] = useState<Date | null>(null);

  // Scroll animation
  const [gridScrollY, setGridScrollY] = useState(0);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const headerOpacity = Math.max(0, 1 - gridScrollY / 80);
  const gridTop = Math.max(30, 140 - gridScrollY);
  const tabRowOffset = Math.min(gridScrollY, 101);
  const tabBgOpacity = Math.min(1, gridScrollY / 40);

  useEffect(() => {
    if (!showDecks || !username) return;
    setDecksLoading(true);
    getDecksByUsername(username).then(d => setPublicDecks(d as any)).catch(console.error).finally(() => setDecksLoading(false));
  }, [showDecks, username]);

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      try {
        const p = await getProfileByUsername(username);
        if (!p) { setNotFound(true); setLoaded(true); return; }
        console.log('[public-profile-fetch]', { username, contact_email: p.contact_email, contact_email_public: p.contact_email_public, fetchedProfile: p });
        setProfile(p);

        // Badge flags
        const memberUntil = p.paid_member_until ? new Date(p.paid_member_until) : null;
        setIsPaidMember(memberUntil ? memberUntil > new Date() : false);
        setPaidMemberUntil(memberUntil);
        setIsTopCollector(p.is_top_collector || false);
        setIsInHouseCreator(p.is_in_house_creator || false);
        setIsFoundingMember(p.is_founding_member || false);
        setFoundingMemberNumber(p.founding_member_number || null);

        const [userPosts, targetUser] = await Promise.all([
          getPostsByUsername(username),
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
        await followUser(user.id, targetPrivyId);
        setFollowingUser(true);
        setFollowerCount(c => c + 1);
      }
    } catch (e) { console.error("Follow error:", e); }
    finally { setFollowLoading(false); }
  };

  const isOwnProfile = user && targetPrivyId && user.id === targetPrivyId;
  const layoutId = profile?.grid_layout || "1x-scope";
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
    <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto flex items-center justify-center">
      <p style={{ ...SKB, fontSize: 11, color: "white" }}>PROFILE NOT FOUND</p>
    </div>
  );

  if (!loaded) return (
    <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto flex items-center justify-center">
      <div style={{ width: 11, height: 11, background: "#FF0000", borderRadius: "50%" }} />
    </div>
  );

  return (
    <div className="bg-black relative w-full max-w-[375px] min-h-screen mx-auto pb-[60px]">

      {/* Header */}
      <div style={{
        position: 'relative', height: 124, background: '#000',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        boxSizing: 'content-box',
        opacity: headerOpacity,
        transition: 'opacity 0.25s ease',
        pointerEvents: gridScrollY < 20 ? 'auto' : 'none',
        zIndex: 10,
      }}>

        {/* PFP container */}
        <div style={{ position: 'absolute', top: 10, left: 8, width: 80, height: 80 }}>
          {isFoundingMember && <div style={{ position: 'absolute', inset: -1, background: 'linear-gradient(135deg, #ff0080, #ff8c00, #ffe100, #00ff80, #00cfff, #cc00ff, #ff0080)', backgroundSize: '300% 300%', animation: 'holoShift 4s linear infinite', zIndex: 0 }} />}
          {isTopCollector && !isFoundingMember && <div style={{ position: 'absolute', inset: -1, background: 'linear-gradient(135deg, #BF953F, #FCF6BA, #B38728, #FBF5B7, #AA771C)', backgroundSize: '200% 200%', animation: 'goldShimmer 3s ease infinite', zIndex: 0 }} />}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1 }}>
            {profile?.profile_image_url
              ? <img src={profile.profile_image_url} alt={username} style={{ width: 80, height: 80, objectFit: 'cover', display: 'block' }} />
              : <div style={{ width: 80, height: 80, backgroundColor: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ ...SKB, fontSize: 28, color: 'white' }}>{username?.[0]?.toUpperCase() ?? '?'}</span></div>
            }
          </div>
          {isFoundingMember && <div style={{ position: 'absolute', right: 0, top: 0, width: 1, height: '100%', background: 'linear-gradient(180deg, #ff0080, #ffe100, #00cfff, #cc00ff)', backgroundSize: '100% 300%', animation: 'holoShift 4s linear infinite', zIndex: 2 }} />}
          {isTopCollector && !isFoundingMember && <div style={{ position: 'absolute', right: 0, top: 0, width: 1, height: '100%', backgroundColor: '#C9A84C', zIndex: 2 }} />}
          {isPaidMember && !isTopCollector && !isFoundingMember && <div style={{ position: 'absolute', right: 0, top: 0, width: 1, height: '100%', backgroundColor: '#FF0000', zIndex: 2 }} />}
          {isInHouseCreator && !isPaidMember && !isTopCollector && !isFoundingMember && <div style={{ position: 'absolute', right: 0, top: 0, width: 1, height: '100%', backgroundColor: 'rgba(255,255,255,0.4)', zIndex: 2 }} />}
          {(() => {
            let src = '/free-tier-aperture-logo-red.png'; let size = 20;
            if (isFoundingMember) { src = '/augmented-member-founding-500-aperture.png'; size = 23.5; }
            else if (isTopCollector) { src = '/top-1k-collector-aperture-gold.png'; size = 23; }
            else if (isPaidMember) { src = '/scope-pro-icon-aperture.png'; size = 23; }
            else if (isInHouseCreator) { src = '/in-house-creator-logo-grey.png'; size = 21; }
            return <img src={src} alt="Badge" onClick={(e) => { e.stopPropagation(); setShowBadgeSheet(true); }} style={{ position: 'absolute', top: -10, left: -10, width: size, height: size, zIndex: 10, cursor: 'pointer', display: 'block', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.85)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />;
          })()}
        </div>

        {/* Name */}
        <div style={{ position: 'absolute', left: 98, top: 10 }}>
          <p style={{ ...SKB, fontSize: 13, color: 'white', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0, textTransform: 'uppercase' }}>{profile?.display_name || username}</p>
        </div>

        {/* Handle */}
        <div style={{ position: 'absolute', left: 98, top: 26 }}>
          <p style={{ ...SKB, fontSize: 10, color: 'white', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>@{username}</p>
        </div>

        {/* Info sheet trigger */}
        <button
          onClick={() => setProfileDataOpen(true)}
          style={{
            position: 'absolute', top: 0, right: 0,
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 7,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
          }}
          aria-label="View profile info"
        >
          <div style={{
            width: 13, height: 10,
            border: '0.5px solid #FFFFFF',
            background: profileDataOpen ? '#FFFFFF' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxSizing: 'border-box',
            transition: 'background 200ms ease',
          }}>
            <span style={{
              fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700,
              fontSize: 14, letterSpacing: '-0.02em',
              color: profileDataOpen ? '#000000' : '#FFFFFF',
              lineHeight: 1, display: 'block',
              transform: 'translateY(-1px)',
              transition: 'color 200ms ease',
            }}>i</span>
          </div>
        </button>

        {/* Follow button */}
        {user && !isOwnProfile && targetPrivyId && (
          <button onClick={handleFollow} disabled={followLoading} style={{ position: 'absolute', ...SKB, fontSize: 8, color: followingUser ? 'rgba(255,255,255,0.5)' : 'white', letterSpacing: '-0.18px', background: 'transparent', border: `1px solid ${followingUser ? 'rgba(255,255,255,0.3)' : 'white'}`, padding: '3px 8px', right: 4, top: 60, cursor: followLoading ? 'default' : 'pointer', textTransform: 'uppercase' }}>
            {followingUser ? 'UNFOLLOW' : 'FOLLOW'}
          </button>
        )}

      </div>{/* end header */}

      {/* Tab row */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        top: `${103 - tabRowOffset}px`,
        zIndex: gridScrollY > 101 ? 40 : 20,
        background: `linear-gradient(to bottom, rgba(0,0,0,${tabBgOpacity * 0.55}) 0%, rgba(0,0,0,${tabBgOpacity * 0.3}) 70%, transparent 100%)`,
        paddingTop: 10, paddingBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', height: 20 }}>
          <button onClick={() => setActiveTab('main')} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
            <span style={{ ...SKB, fontSize: 8, color: activeTab === 'main' ? '#FF0000' : 'white', textTransform: 'uppercase', letterSpacing: '-0.16px' }}>MAIN</span>
          </button>
          <button onClick={() => { setActiveTab('decks'); setShowDecks(true); }} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
            <img src="/decks-logo-new-lg.png" style={{ height: 8, width: 'auto', display: 'block', filter: activeTab === 'decks' ? 'invert(27%) sepia(100%) saturate(7000%) hue-rotate(0deg) brightness(100%) contrast(100%)' : 'none' }} alt="Decks" />
          </button>
          <button
            onClick={() => setActiveTab('theatre')}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <img
              src="/theatre-mode-logo-new-lg.png"
              style={{ height: 26, width: 'auto', display: 'block', opacity: activeTab === 'theatre' ? 1 : 0.7, position: 'relative', left: 10 }}
              alt="Theatre"
            />
          </button>
          <button onClick={() => setActiveTab('collected')} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
            <span style={{ ...SKB, fontSize: 8, color: activeTab === 'collected' ? '#FF0000' : 'white', textTransform: 'uppercase', letterSpacing: '-0.16px' }}>COLLECTED</span>
          </button>
        </div>
      </div>

      {/* Posts grid */}
      <div style={{ position: 'absolute', inset: 0, top: `${gridTop}px` }}>
        {activeTab === 'collected' ? (
          <div style={{ position: 'absolute', top: 50, left: 0, right: 0, bottom: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.05em' }}>NO COLLECTED POSTS YET</p>
          </div>
        ) : posts.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', flex: 1, minHeight: '50vh' }}>
            <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>NO POSTS YET</p>
          </div>
        ) : (
          <div ref={gridScrollRef} className="overflow-y-auto h-full px-[1px]" onScroll={(e) => { setGridScrollY((e.target as HTMLElement).scrollTop); }}>
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
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 40, height: 3, backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <span style={{ ...SKB, fontSize: 11, color: 'white', letterSpacing: '0.05em', textTransform: 'uppercase' }}>DECKS</span>
          <button onClick={() => { setShowDecks(false); setActiveTab('main'); }} style={{ position: 'absolute', right: 16, fontSize: 18, color: 'white', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {decksLoading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}><div style={{ width: 8, height: 8, background: '#FF0000', borderRadius: '50%' }} /></div>
          : publicDecks.length === 0 ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}><span style={{ ...SKB, fontSize: 11, color: 'white', textTransform: 'uppercase' }}>NO DECKS YET</span></div>
          : publicDecks.map(deck => (
            <div key={deck.id} onClick={() => { setShowDecks(false); router.push(`/profile/${username}/decks/${deck.id}`); }} style={{ marginBottom: 12, cursor: 'pointer' }}>
              <div style={{ width: '100%', aspectRatio: getDeckAspect(deck.grid_layout), overflow: 'hidden', background: '#1a1a1a' }}>
                {deck.thumbnail_urls.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: thumbCols(deck.thumbnail_urls.length), width: '100%', height: '100%' }}>{deck.thumbnail_urls.map((url, i) => <img key={i} src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />)}</div>}
              </div>
              <p style={{ ...SKB, fontSize: 10, color: 'white', margin: '4px 0 0', textTransform: 'uppercase' }}>{deck.title}</p>
              <p style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0', textTransform: 'uppercase' }}>{deck.item_count} FRAMES</p>
            </div>
          ))}
        </div>
      </div>

      <ProfileDataSheet
        isOpen={profileDataOpen}
        onClose={() => setProfileDataOpen(false)}
        profile={profile}
        links={profileLinks}
        isOwnProfile={!!isOwnProfile}
        followers={followerCount}
        following={followingCount}
        totalPosts={posts.length}
        collectors={0}
        portfolioMc={profile?.portfolio_mc || 0}
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
