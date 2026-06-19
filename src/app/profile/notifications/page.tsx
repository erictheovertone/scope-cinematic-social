"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getNotifications,
  markAllNotificationsRead,
  type AppNotification,
} from "@/lib/userService";
import { getPostById } from "@/lib/postsService";
import FrameLoader from "@/components/FrameLoader";
import PostModal from "@/components/PostModal";
import { NotificationActorAvatar, NotificationActorMessage } from "@/components/NotificationActor";
import { getAspectRatio } from "@/lib/aspectRatio";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [openedPost, setOpenedPost] = useState<any>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const data = await getNotifications(user.id);
        console.log('[NotificationsPage] fetched', data.length, 'notifications for', user.id, ':', data);
        setNotifications(data);
        markAllNotificationsRead(user.id).catch(() => {});
      } catch (e) {
        console.error("NotificationsPage load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  const handleClick = async (n: AppNotification) => {
    // Follow has no post → go to the follower's profile (consistent with the
    // actor target). Post-related types open THAT post in the normal post view.
    if (n.type === "follow") {
      const handle = n.actor_handle ?? n.sender_username;
      if (handle) router.push(`/profile/${handle}`);
      return;
    }
    if (!n.post_id) return; // legacy row without a post reference — stays dead
    const post = await getPostById(n.post_id);
    if (post) setOpenedPost(post);
  };

  // Actor avatar/handle tap → that actor's profile (by handle).
  const goToActor = (handle: string) => router.push(`/profile/${handle}`);

  return (
    <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto flex flex-col">

      {/* Header */}
      <div className="relative flex items-center px-[4px] pt-[12px] pb-[10px]">
        <button
          onClick={() => router.back()}
          className="bg-transparent border-none cursor-pointer p-0"
        >
          <span style={{ ...SKR, fontSize: 9, color: "white", letterSpacing: "-0.18px" }}>
            ← Back
          </span>
        </button>
        <span
          className="absolute left-1/2"
          style={{ ...SKB, fontSize: 9, color: "white", letterSpacing: "-0.18px", transform: "translateX(-50%)" }}
        >
          NOTIFICATIONS
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center mt-12">
            <FrameLoader />
          </div>
        ) : !user ? (
          <div className="flex items-center justify-center mt-12">
            <p style={{ ...SKR, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
              Sign in to see notifications
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex items-center justify-center mt-12">
            <p style={{ ...SKR, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
              No notifications yet
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className="w-full bg-transparent border-none cursor-pointer text-left"
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 8px 9px 14px",
              }}
            >
              {/* Unread marker — small red square, left edge, vertically centered */}
              {!n.is_read && (
                <div style={{ position: "absolute", left: 5, top: "50%", transform: "translateY(-50%)", width: 4.5, height: 4.5, background: "#FF0000" }} />
              )}

              {/* Avatar — tappable → actor profile */}
              <NotificationActorAvatar handle={n.actor_handle ?? null} avatar={n.actor_avatar ?? null} onNavigate={goToActor} />

              {/* Message + timestamp — bumped up for legibility (8→11 / 6→8). */}
              <div className="flex-1 min-w-0">
                <p style={{ ...SKR, fontSize: 11, color: "white", letterSpacing: "-0.16px", lineHeight: 1.4, margin: 0, wordBreak: "break-word" }}>
                  <NotificationActorMessage handle={n.actor_handle ?? null} type={n.type} onNavigate={goToActor} />
                </p>
                <p style={{ ...SKR, fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.1px", margin: "2px 0 0" }}>
                  {timeAgo(n.created_at)}
                </p>
              </div>

              {/* Post thumbnail — larger on mobile (60px wide, was 40²) and sized to
                  the post's TRUE aspect ratio via layout_id (same source as the feed
                  / Screening Room): a 4:3 thumb reads 4:3, a 2.39:1 thumb reads
                  2.39:1. objectFit cover center-crops to that AR, like the feed. */}
              {(n.type === "like" || n.type === "comment") && n.post_image_url && (
                <div style={{ width: 60, aspectRatio: getAspectRatio(n.post_layout_id ?? ''), flexShrink: 0, background: "#222", overflow: "hidden" }}>
                  <img src={n.post_image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {openedPost && <PostModal post={openedPost} onClose={() => setOpenedPost(null)} />}

    </div>
  );
}
