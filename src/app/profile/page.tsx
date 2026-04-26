"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, getFollowerCount, getFollowingCount, getUserDecks, createDeck, type Deck } from "@/lib/userService";
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
  const [showDecks, setShowDecks] = useState(false);
  const [userDecks, setUserDecks] = useState<(Deck & { item_count: number; thumbnail_urls: string[] })[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [showNewDeckForm, setShowNewDeckForm] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [creatingDeck, setCreatingDeck] = useState(false);

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
    if (!gl) return '2.4 / 1';
    if (gl.includes('2.4') || gl === 'collage') return '2.4 / 1';
    if (gl.includes('16:9') || gl.includes('16-9')) return '16 / 9';
    if (gl.includes('4:3') || gl.includes('4-3')) return '4 / 3';
    return '2.4 / 1';
  };
  const thumbCols = (n: number) => n <= 1 ? '1fr' : n <= 4 ? '1fr 1fr' : '1fr 1fr 1fr';

  return (
    <div className="bg-black relative w-full max-w-[375px] min-h-screen mx-auto pb-[60px]">

      {/* Red dot — opens Theater Carousel */}
      <div
        className="absolute cursor-pointer"
        onClick={() => setShowTheater(true)}
        style={{ left: 10, top: 10, width: 11, height: 11, padding: 0, zIndex: 10 }}
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
      <div className="absolute left-[90px]" style={{ top: '108px', transform: 'translateY(-50%)', maxWidth: '140px' }}>
        {userProfile.bio.split('\n').map((line, i) => (
          <p key={i} style={{ ...MONO, fontSize: '8px', color: 'white', letterSpacing: '-0.12px', lineHeight: 1.4, margin: 0 }}>
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
          onClick={() => setShowDecks(true)}
          aria-label="View decks"
        >
          <svg width="21" height="6" viewBox="0 0 21 6" fill="none">
            <rect x="0"  y="0" width="3" height="6" fill="white" />
            <rect x="6"  y="0" width="3" height="6" fill="white" />
            <rect x="12" y="0" width="3" height="6" fill="white" />
            <rect x="18" y="0" width="3" height="6" fill="white" />
          </svg>
        </button>
      )}

      {/* Stats cascade — ripples down one row at a time below VIEW DATA */}
      {isDataOpen && (
        <div className="absolute" style={{ right: '4px', top: '54px', backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 0, padding: 8 }}>
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
        style={{ right: 2, top: 1 }}
        onClick={() => router.push('/profile/preferences')}
        aria-label="Settings"
      >
        <span style={{ fontSize: '20px', color: 'white', lineHeight: 1 }}>⚙</span>
      </button>

      {/* Posts grid — starts at y=160. Explicit height avoids min-height containing-block issue. */}
      {layoutLoaded && (
        <div className="absolute left-0 right-0" style={{ top: '160px', height: 'calc(100vh - 160px)' }}>
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

      {/* Decks bottom sheet overlay */}
      {showDecks && (
        <div
          className="bg-black"
          onClick={() => { setShowDecks(false); setShowNewDeckForm(false); setNewDeckTitle(''); setNewDeckDesc(''); }}
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
          <span style={{ ...MONO, fontSize: 11, color: 'white', letterSpacing: '0.05em' }}>DECKS</span>
          <button
            onClick={() => { setShowDecks(false); setShowNewDeckForm(false); setNewDeckTitle(''); setNewDeckDesc(''); }}
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
              <span style={{ ...MONO, fontSize: 11, color: 'white' }}>No decks yet</span>
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
                <p style={{ ...MONO, fontSize: 10, color: 'white', margin: '4px 0 0' }}>{deck.title}</p>
                <p style={{ ...MONO, fontSize: 9, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>{deck.item_count} frames</p>
              </div>
            ))
          )}
        </div>

        {/* NEW DECK footer — own profile only */}
        <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          {!showNewDeckForm ? (
            <button
              onClick={() => setShowNewDeckForm(true)}
              style={{ display: 'block', width: '100%', border: '1px solid white', background: 'transparent', color: 'white', ...MONO, fontSize: 11, padding: '8px', cursor: 'pointer', borderRadius: 0 }}
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

    </div>
  );
}
