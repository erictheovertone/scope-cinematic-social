"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, getFollowerCount, getFollowingCount } from "@/lib/userService";
import { getUserPosts } from '@/lib/postsService';
import CreatePostFlow from "@/components/CreatePostFlow";
import FollowListModal from "@/components/FollowListModal";
import TheaterCarousel from "@/components/TheaterCarousel";
import ProfilePostViewer from "@/components/ProfilePostViewer";

const COLLAGE_ASPECTS = ['aspect-video', 'aspect-[2.4/1]', 'aspect-[4/3]', 'aspect-square'];

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
      return 'aspect-[2.4/1]';
    case '2x-regular-wide':
      return 'aspect-video';
    case '3x-square':
      return 'aspect-square';
    case 'collage':
      return COLLAGE_ASPECTS[index % COLLAGE_ASPECTS.length];
    default:
      return 'aspect-[2.4/1]';
  }
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

export default function Profile() {
  const { user } = usePrivy();
  const router = useRouter();
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [showTheater, setShowTheater] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [supabaseUserId, setSupabaseUserId] = useState<string | undefined>();
  const [userProfile, setUserProfile] = useState({
    displayName: "",
    username: "",
    bio: "",
    profileImage: null as string | null,
  });
  const [userLayoutId, setUserLayoutId] = useState('1x-super-wide');
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'collected'>('main');
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState({
    collectors: 1425,
    totalPosts: 0,
    followers: 0,
    following: 0,
    portfolioMc: 569900,
  });
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      try {
        const supabaseUser = await getUserByPrivyId(user.id);
        if (supabaseUser) {
          setSupabaseUserId(supabaseUser.id);
          const profile = await getProfile(supabaseUser.id);
          if (profile) {
            setUserProfile({
              displayName: profile.display_name || "",
              username: profile.username || "",
              bio: profile.bio || "",
              profileImage: profile.profile_image_url || null,
            });
            if (profile.grid_layout) setUserLayoutId(profile.grid_layout);
          }
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
    if (!user || showCreatePost) return;
    getUserPosts(user.id)
      .then(posts => {
        setUserPosts(posts);
        setAnalytics(prev => ({ ...prev, totalPosts: posts.length }));
      })
      .catch(console.error);
  }, [showCreatePost]);

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="bg-black relative w-full max-w-[375px] min-h-screen mx-auto pb-[60px]">

      {/* Red dot — opens Theater Carousel */}
      <div
        className="absolute cursor-pointer"
        onClick={() => setShowTheater(true)}
        style={{ left: -2, top: 0, width: 28, height: 28, padding: '3px 0 0 1px', zIndex: 10 }}
      >
        <div className="w-[11px] h-[11px] bg-[#FF0000] rounded-full" />
      </div>

      {/* Avatar — x=4, y=35, 80×80 */}
      <div className="absolute left-[4px] top-[35px] w-[80px] h-[80px] overflow-hidden bg-[#222]">
        {userProfile.profileImage ? (
          <img src={userProfile.profileImage} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[#222]" />
        )}
      </div>

      {/* Name — left=91, center-y=41.5 */}
      <div className="absolute left-[91px]" style={{ top: '41.5px', transform: 'translateY(-50%)' }}>
        <p style={{ ...MONO, fontSize: '11px', color: 'white', letterSpacing: '-0.22px', lineHeight: 1.4, margin: 0 }}>
          {userProfile.displayName}
        </p>
      </div>

      {/* Handle — left=91, center-y=55.5 */}
      <div className="absolute left-[91px]" style={{ top: '55.5px', transform: 'translateY(-50%)' }}>
        <p style={{ ...MONO, fontSize: '9px', color: 'white', letterSpacing: '-0.18px', lineHeight: 1.4, margin: 0 }}>
          {userProfile.username ? `@${userProfile.username}` : ''}
        </p>
      </div>

      {/* Bio — left=90, center-y=108 */}
      <div className="absolute left-[90px]" style={{ top: '108px', transform: 'translateY(-50%)' }}>
        {userProfile.bio.split('\n').map((line, i) => (
          <p key={i} style={{ ...MONO, fontSize: '6px', color: 'white', letterSpacing: '-0.12px', lineHeight: 1.4, margin: 0 }}>
            {line}
          </p>
        ))}
      </div>

      {/* VIEW DATA — always visible, toggles the stats cascade below it */}
      <button
        className="absolute bg-transparent border-none cursor-pointer"
        style={{ right: '4px', top: '44px', transform: 'translateY(-50%)' }}
        onClick={() => setIsDataOpen(v => !v)}
      >
        <span style={{ ...MONO, fontSize: '10px', color: 'white', letterSpacing: '-0.2px', opacity: isDataOpen ? 0.45 : 1, transition: 'opacity 0.15s ease' }}>
          VIEW DATA
        </span>
      </button>

      {/* Decks icon — visible only when stats panel is closed */}
      {!isDataOpen && userProfile.username && (
        <button
          className="absolute bg-transparent border-none cursor-pointer p-0"
          style={{ left: '50%', top: '148px', transform: 'translate(-50%, -50%)' }}
          onClick={() => router.push(`/profile/${userProfile.username}/decks`)}
          aria-label="View decks"
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
            <rect x="0" y="0" width="2" height="16" fill="white" />
            <rect x="5" y="0" width="2" height="16" fill="white" />
            <rect x="10" y="0" width="2" height="16" fill="white" />
          </svg>
        </button>
      )}

      {/* Stats cascade — ripples down one row at a time below VIEW DATA */}
      {isDataOpen && (
        <div className="absolute" style={{ right: '4px', top: '54px' }}>
          {([
            ['Collectors',   fmt(analytics.collectors),   null],
            ['Total Posts',  fmt(analytics.totalPosts),   null],
            ['Followers',    fmt(analytics.followers),    () => setShowFollowersModal(true)],
            ['Following',    fmt(analytics.following),    () => setShowFollowingModal(true)],
            ['Portfolio MC', `$${fmt(analytics.portfolioMc)}`, null],
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
              <span style={{ ...MONO, fontSize: '7px', color: 'rgba(255,255,255,0.55)', letterSpacing: '-0.1px', lineHeight: 1.7 }}>{label}</span>
              <span style={{ ...MONO, fontSize: '7px', color: 'white', letterSpacing: '-0.1px', lineHeight: 1.7 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* MAIN / DATA / COLLECTED tabs — center-y=148 in Figma */}
      <div className="absolute left-[7px]" style={{ top: '148px', transform: 'translateY(-50%)' }}>
        <button onClick={() => setActiveTab('main')} className="bg-transparent border-none p-0 cursor-pointer">
          <span style={{ ...MONO, fontSize: '9px', color: activeTab === 'main' ? '#FF0000' : '#FFFFFF', letterSpacing: '-0.18px', lineHeight: 1.4 }}>MAIN</span>
        </button>
      </div>

      <div className="absolute right-[4px]" style={{ top: '148px', transform: 'translateY(-50%)' }}>
        <button onClick={() => setActiveTab('collected')} className="bg-transparent border-none p-0 cursor-pointer">
          <span style={{ ...MONO, fontSize: '9px', color: activeTab === 'collected' ? '#FF0000' : '#FFFFFF', letterSpacing: '-0.18px', lineHeight: 1.4 }}>COLLECTED</span>
        </button>
      </div>

      {/* Settings — top-right, 1px from both edges, plain button */}
      <button
        className="absolute bg-transparent border-none cursor-pointer p-0"
        style={{ right: 1, top: 1 }}
        onClick={() => router.push('/profile/preferences')}
        aria-label="Settings"
      >
        <span style={{ fontSize: '20px', color: 'white', lineHeight: 1 }}>⚙</span>
      </button>

      {/* Posts grid — starts at y=160. Explicit height avoids min-height containing-block issue. */}
      {layoutLoaded && (
        <div className="absolute left-0 right-0" style={{ top: '160px', height: 'calc(100vh - 220px)' }}>
          {userPosts.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                minHeight: '50vh',
                cursor: 'pointer',
                gap: '16px',
              }}
              onClick={() => setShowCreatePost(true)}
            >
              <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'white', margin: 0, lineHeight: '1.4' }}>
                Create<br/>your<br/>first<br/>post
              </p>
              <div style={{ position: 'relative', width: '48px', height: '48px', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'white', transform: 'translateY(-50%)' }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'white', transform: 'translateX(-50%)' }} />
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto h-full px-[1px]">
              <div className={`grid ${getGridCols(userLayoutId)} gap-[1px] auto-rows-min`}>
                {userPosts.map((post, index) => (
                  <div
                    key={post.id}
                    className={`bg-[#222] overflow-hidden ${getPostAspect(userLayoutId, index)}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setViewerIndex(index); setShowViewer(true); }}
                  >
                    {post.media_urls?.[0] ? (
                      <img
                        src={post.media_urls[0]}
                        alt={post.caption || 'Post'}
                        className="w-full h-full object-cover"
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
        <ProfilePostViewer
          posts={userPosts}
          initialIndex={viewerIndex}
          ownerUsername={userProfile.username}
          ownerAvatarUrl={userProfile.profileImage}
          onClose={() => setShowViewer(false)}
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

    </div>
  );
}
