"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getProfileByUsername,
  getUserById,
  followUser,
  unfollowUser,
  isFollowing,
  getFollowerCount,
  getFollowingCount,
  getDecksByUsername,
  getProfileLinks,
  type Deck,
  type ProfileLink,
} from "@/lib/userService";
import LinksSheet from "@/components/LinksSheet";
import { getPostsByUsername } from "@/lib/postsService";
import ProfilePostViewer from "@/components/ProfilePostViewer";
import FollowListModal from "@/components/FollowListModal";

const COLLAGE_ASPECTS = ["aspect-video", "aspect-[2.4/1]", "aspect-[4/3]", "aspect-square"];

function getGridCols(layoutId: string): string {
  switch (layoutId) {
    case "2x-super-wide":
    case "2x-regular-wide":
    case "collage":
      return "grid-cols-2";
    case "1x-super-wide":
      return "grid-cols-1";
    case "3x-square":
    default:
      return "grid-cols-3";
  }
}

function getPostAspect(layoutId: string, index: number): string {
  switch (layoutId) {
    case "2x-super-wide":
    case "1x-super-wide":
      return "aspect-[2.4/1]";
    case "2x-regular-wide":
      return "aspect-video";
    case "3x-square":
      return "aspect-square";
    case "collage":
      return COLLAGE_ASPECTS[index % COLLAGE_ASPECTS.length];
    default:
      return "aspect-[2.4/1]";
  }
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

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
  const [activeTab, setActiveTab] = useState<"main" | "collected">("main");

  // Follow state
  const [targetPrivyId, setTargetPrivyId] = useState<string | null>(null);
  const [followingUser, setFollowingUser] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [showDecks, setShowDecks] = useState(false);
  const [publicDecks, setPublicDecks] = useState<(Deck & { item_count: number; thumbnail_urls: string[] })[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [profileLinks, setProfileLinks] = useState<ProfileLink[]>([]);

  useEffect(() => {
    if (!showDecks || !username) return;
    setDecksLoading(true);
    getDecksByUsername(username)
      .then(d => setPublicDecks(d as any))
      .catch(console.error)
      .finally(() => setDecksLoading(false));
  }, [showDecks, username]);

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      try {
        const p = await getProfileByUsername(username);
        if (!p) {
          setNotFound(true);
          setLoaded(true);
          return;
        }
        setProfile(p);

        const [userPosts, targetUser] = await Promise.all([
          getPostsByUsername(username),
          getUserById(p.user_id),
        ]);
        setPosts(userPosts);

        if (targetUser) {
          setTargetPrivyId(targetUser.privy_id);
          getProfileLinks(targetUser.privy_id).then(setProfileLinks).catch(() => {});
          const [fc, fgc] = await Promise.all([
            getFollowerCount(targetUser.privy_id),
            getFollowingCount(targetUser.privy_id),
          ]);
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
    } catch (e) {
      console.error("Follow error:", e);
    } finally {
      setFollowLoading(false);
    }
  };

  const isOwnProfile = user && targetPrivyId && user.id === targetPrivyId;
  const layoutId = profile?.grid_layout || "1x-super-wide";

  const getDeckAspect = (gl?: string | null) => {
    if (!gl) return '2.4 / 1';
    if (gl.includes('2.4') || gl === 'collage') return '2.4 / 1';
    if (gl.includes('16:9') || gl.includes('16-9')) return '16 / 9';
    if (gl.includes('4:3') || gl.includes('4-3')) return '4 / 3';
    return '2.4 / 1';
  };
  const thumbCols = (n: number) => n <= 1 ? '1fr' : n <= 4 ? '1fr 1fr' : '1fr 1fr 1fr';

  /* ── Not found ── */
  if (loaded && notFound) {
    return (
      <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto flex items-center justify-center">
        <p style={{ ...MONO, fontSize: 11, color: "white" }}>Profile not found</p>
      </div>
    );
  }

  /* ── Loading ── */
  if (!loaded) {
    return (
      <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto flex items-center justify-center">
        <div style={{ width: 11, height: 11, background: "#FF0000", borderRadius: "50%" }} />
      </div>
    );
  }

  return (
    <div className="bg-black relative w-full max-w-[375px] min-h-screen mx-auto pb-[60px]">

      {/* Red dot — taps back to home */}
      <div
        className="absolute cursor-pointer"
        onClick={() => router.push("/")}
        style={{ left: 0, top: 0, width: 28, height: 28, padding: "3px 0 0 2px", zIndex: 10 }}
      >
        <div className="w-[11px] h-[11px] bg-[#FF0000] rounded-full" />
      </div>

      {/* Avatar — x=4, y=35, 80×80 */}
      <div className="absolute left-[4px] top-[35px] w-[80px] h-[80px] overflow-hidden bg-[#222]">
        {profile?.profile_image_url ? (
          <img src={profile.profile_image_url} alt={username} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span style={{ ...MONO, fontSize: 28, color: "white" }}>
              {username?.[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
        )}
      </div>

      {/* Display name — left=91, center-y=41.5 */}
      <div className="absolute left-[91px]" style={{ top: "41.5px", transform: "translateY(-50%)" }}>
        <p style={{ ...MONO, fontSize: 11, color: "white", letterSpacing: "-0.22px", lineHeight: 1.4, margin: 0 }}>
          {profile?.display_name || username}
        </p>
      </div>

      {/* Handle — left=91, center-y=55.5 */}
      <div className="absolute left-[91px]" style={{ top: "55.5px", transform: "translateY(-50%)" }}>
        <p style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.18px", lineHeight: 1.4, margin: 0 }}>
          @{username}
        </p>
      </div>

      {/* Bio — left=90, center-y=108 */}
      <div className="absolute left-[90px]" style={{ top: "108px", transform: "translateY(-50%)", maxWidth: "140px" }}>
        {(profile?.bio || "").split("\n").map((line: string, i: number) => (
          <p key={i} style={{ ...MONO, fontSize: 6, color: "white", letterSpacing: "-0.12px", lineHeight: 1.4, margin: 0 }}>
            {line}
          </p>
        ))}
      </div>

      {/* Follow button — top right, only on other profiles */}
      {user && !isOwnProfile && targetPrivyId && (
        <button
          onClick={handleFollow}
          disabled={followLoading}
          className="absolute"
          style={{
            ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.18px",
            background: "transparent", border: "1px solid white",
            padding: "3px 8px", right: 4, top: 8,
            cursor: followLoading ? "default" : "pointer",
            opacity: followLoading ? 0.5 : 1,
          }}
        >
          {followingUser ? "UNFOLLOW" : "FOLLOW"}
        </button>
      )}

      {/* VIEW DATA — always visible */}
      <button
        className="absolute bg-transparent border-none cursor-pointer"
        style={{ right: "4px", top: "44px", transform: "translateY(-50%)", padding: 0 }}
        onClick={() => setIsDataOpen(v => !v)}
      >
        <span style={{ ...MONO, fontSize: "10px", color: "white", letterSpacing: "-0.2px", opacity: isDataOpen ? 0.45 : 1, transition: "opacity 0.15s ease" }}>
          VIEW DATA
        </span>
      </button>

      {/* Links arrow — always visible, below VIEW DATA */}
      <span
        onClick={() => setShowLinks(true)}
        style={{ position: "absolute", right: "4px", top: "62px", fontSize: "16px", color: "white", opacity: 0.8, cursor: "pointer", fontWeight: 300, lineHeight: 1 }}
      >↗</span>

      {/* Stats cascade */}
      {isDataOpen && (
        <div className="absolute" style={{ right: "4px", top: "54px", backgroundColor: "rgba(0,0,0,0.85)", padding: 8 }}>
          {([
            ["Followers", followerCount.toLocaleString(), () => setShowFollowersModal(true)],
            ["Following", followingCount.toLocaleString(), () => setShowFollowingModal(true)],
          ] as [string, string, () => void][]).map(([label, value, onClick], i) => (
            <div
              key={label}
              onClick={onClick}
              style={{ display: "flex", justifyContent: "space-between", gap: "14px", animation: "ripple-down 0.18s ease-out both", animationDelay: `${i * 50}ms`, cursor: "pointer" }}
            >
              <span style={{ ...MONO, fontSize: "7px", color: "rgba(255,255,255,0.55)", letterSpacing: "-0.1px", lineHeight: 1.7 }}>{label}</span>
              <span style={{ ...MONO, fontSize: "7px", color: "white", letterSpacing: "-0.1px", lineHeight: 1.7 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* MAIN / COLLECTED tabs + decks icon — center-y=148 */}
      <div className="absolute left-[7px]" style={{ top: "148px", transform: "translateY(-50%)" }}>
        <button onClick={() => setActiveTab("main")} className="bg-transparent border-none p-0 cursor-pointer">
          <span style={{ ...MONO, fontSize: 9, color: activeTab === "main" ? "#FF0000" : "#FFFFFF", letterSpacing: "-0.18px", lineHeight: 1.4 }}>MAIN</span>
        </button>
      </div>

      {!isDataOpen && (
        <button
          className="absolute bg-transparent border-none cursor-pointer p-0"
          style={{ left: "50%", top: "148px", transform: "translate(-50%, -50%)" }}
          onClick={() => setShowDecks(true)}
          aria-label="View decks"
        >
          <svg width="21" height="11" viewBox="0 0 21 11" fill="none">
            <rect x="0"  y="0" width="3" height="11" fill="white" />
            <rect x="6"  y="0" width="3" height="11" fill="white" />
            <rect x="12" y="0" width="3" height="11" fill="white" />
            <rect x="18" y="0" width="3" height="11" fill="white" />
          </svg>
        </button>
      )}

      <div className="absolute right-[4px]" style={{ top: "148px", transform: "translateY(-50%)" }}>
        <button onClick={() => setActiveTab("collected")} className="bg-transparent border-none p-0 cursor-pointer">
          <span style={{ ...MONO, fontSize: 9, color: activeTab === "collected" ? "#FF0000" : "#FFFFFF", letterSpacing: "-0.18px", lineHeight: 1.4 }}>COLLECTED</span>
        </button>
      </div>

      {/* Posts grid — starts at y=160 */}
      <div className="absolute left-0 right-0" style={{ top: "160px", height: "calc(100vh - 160px)" }}>
        {posts.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.4)" }}>No posts yet</p>
          </div>
        ) : (
          <div className="overflow-y-auto h-full px-[1px]">
            <div className={`grid ${getGridCols(layoutId)} gap-[1px] auto-rows-min`}>
              {posts.map((post, index) => (
                <div
                  key={post.id}
                  className={`bg-[#222] overflow-hidden ${getPostAspect(layoutId, index)}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => { setViewerIndex(index); setShowViewer(true); }}
                >
                  {post.media_urls?.[0] ? (
                    <img
                      src={post.media_urls[0]}
                      alt={post.caption || "Post"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showViewer && (
        <ProfilePostViewer
          posts={posts}
          initialIndex={viewerIndex}
          ownerUsername={username}
          ownerAvatarUrl={profile?.profile_image_url}
          onClose={() => setShowViewer(false)}
        />
      )}

      {showFollowersModal && targetPrivyId && (
        <FollowListModal
          type="followers"
          privyUserId={targetPrivyId}
          onClose={() => setShowFollowersModal(false)}
        />
      )}

      {showFollowingModal && targetPrivyId && (
        <FollowListModal
          type="following"
          privyUserId={targetPrivyId}
          onClose={() => setShowFollowingModal(false)}
        />
      )}

      {/* Decks bottom sheet overlay */}
      {showDecks && (
        <div
          className="bg-black"
          onClick={() => setShowDecks(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 59 }}
        />
      )}

      <LinksSheet
        username={username}
        links={profileLinks}
        visible={showLinks}
        onClose={() => setShowLinks(false)}
      />

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
            onClick={() => setShowDecks(false)}
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
          ) : publicDecks.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}>
              <span style={{ ...MONO, fontSize: 11, color: 'white' }}>No decks yet</span>
            </div>
          ) : (
            publicDecks.map(deck => (
              <div
                key={deck.id}
                onClick={() => { setShowDecks(false); router.push(`/profile/${username}/decks/${deck.id}`); }}
                style={{ marginBottom: 12, cursor: 'pointer' }}
              >
                <div style={{ width: '100%', aspectRatio: getDeckAspect(deck.grid_layout), overflow: 'hidden', background: '#1a1a1a' }}>
                  {deck.thumbnail_urls.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: thumbCols(deck.thumbnail_urls.length), width: '100%', height: '100%' }}>
                      {deck.thumbnail_urls.map((url, i) => (
                        <img key={i} src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ))}
                    </div>
                  ) : null}
                </div>
                <p style={{ ...MONO, fontSize: 10, color: 'white', margin: '4px 0 0' }}>{deck.title}</p>
                <p style={{ ...MONO, fontSize: 9, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>{deck.item_count} frames</p>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
