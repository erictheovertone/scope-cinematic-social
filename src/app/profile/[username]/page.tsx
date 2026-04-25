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
} from "@/lib/userService";
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
      <div className="absolute left-[90px]" style={{ top: "108px", transform: "translateY(-50%)" }}>
        {(profile?.bio || "").split("\n").map((line: string, i: number) => (
          <p key={i} style={{ ...MONO, fontSize: 6, color: "white", letterSpacing: "-0.12px", lineHeight: 1.4, margin: 0 }}>
            {line}
          </p>
        ))}
      </div>

      {/* Follow button + stats — right side of header */}
      <div
        className="absolute flex flex-col items-end"
        style={{ right: 4, top: 35, gap: 6 }}
      >
        {/* Follow / Unfollow — hidden when viewing own profile or target privy_id unknown */}
        {user && !isOwnProfile && targetPrivyId && (
          <button
            onClick={handleFollow}
            disabled={followLoading}
            style={{
              ...MONO,
              fontSize: 9,
              color: "white",
              letterSpacing: "-0.18px",
              background: "transparent",
              border: "1px solid white",
              padding: "3px 8px",
              cursor: followLoading ? "default" : "pointer",
              opacity: followLoading ? 0.5 : 1,
            }}
          >
            {followingUser ? "UNFOLLOW" : "FOLLOW"}
          </button>
        )}

        {/* Follower count */}
        <button
          onClick={() => setShowFollowersModal(true)}
          className="bg-transparent border-none cursor-pointer p-0"
        >
          <span style={{ ...MONO, fontSize: 7, color: "white", letterSpacing: "-0.14px" }}>
            {followerCount.toLocaleString()} followers
          </span>
        </button>

        {/* Following count */}
        <button
          onClick={() => setShowFollowingModal(true)}
          className="bg-transparent border-none cursor-pointer p-0"
        >
          <span style={{ ...MONO, fontSize: 7, color: "white", letterSpacing: "-0.14px" }}>
            {followingCount.toLocaleString()} following
          </span>
        </button>

        {/* Decks icon */}
        <button
          onClick={() => router.push(`/profile/${username}/decks`)}
          className="bg-transparent border-none cursor-pointer p-0"
          aria-label="View decks"
        >
          <svg width="20" height="13" viewBox="0 0 20 13" fill="none">
            <rect width="20" height="3" fill="rgba(255,255,255,0.7)" />
            <rect y="5" width="20" height="3" fill="rgba(255,255,255,0.7)" />
            <rect y="10" width="20" height="3" fill="rgba(255,255,255,0.7)" />
          </svg>
        </button>
      </div>

      {/* MAIN / COLLECTED tabs — center-y=148 */}
      <div className="absolute left-[7px]" style={{ top: "148px", transform: "translateY(-50%)" }}>
        <button onClick={() => setActiveTab("main")} className="bg-transparent border-none p-0 cursor-pointer">
          <span style={{ ...MONO, fontSize: 9, color: activeTab === "main" ? "#FF0000" : "#FFFFFF", letterSpacing: "-0.18px", lineHeight: 1.4 }}>
            MAIN
          </span>
        </button>
      </div>
      <div className="absolute right-[4px]" style={{ top: "148px", transform: "translateY(-50%)" }}>
        <button onClick={() => setActiveTab("collected")} className="bg-transparent border-none p-0 cursor-pointer">
          <span style={{ ...MONO, fontSize: 9, color: activeTab === "collected" ? "#FF0000" : "#FFFFFF", letterSpacing: "-0.18px", lineHeight: 1.4 }}>
            COLLECTED
          </span>
        </button>
      </div>

      {/* Posts grid — starts at y=160, 1px side padding, 1px gaps */}
      <div className="absolute left-0 right-0 bottom-[60px]" style={{ top: "160px" }}>
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

    </div>
  );
}
