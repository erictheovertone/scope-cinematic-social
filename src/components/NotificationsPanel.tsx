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

const MONO: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

interface Props {
  onClose: () => void;
}

export default function NotificationsPanel({ onClose }: Props) {
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
        console.log('[NotificationsPanel] fetched', data.length, 'notifications for', user.id, ':', data);
        setNotifications(data);
        markAllNotificationsRead(user.id).catch(() => {});
      } catch (e) {
        console.error("NotificationsPanel load error:", e);
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
      onClose();
      if (handle) router.push(`/profile/${handle}`);
      return;
    }
    if (!n.post_id) return; // legacy row without a post reference — stays dead
    const post = await getPostById(n.post_id);
    if (post) setOpenedPost(post);
  };

  // Actor avatar/handle tap → that actor's profile (by handle), same pattern as
  // comment-row authors. Closes the panel first so we land on the profile.
  const goToActor = (handle: string) => {
    onClose();
    router.push(`/profile/${handle}`);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "#000", maxWidth: 375, margin: "0 auto" }}
    >
      {/* Header */}
      <div className="relative flex items-center px-[4px] pt-[12px] pb-[10px]">
        <button onClick={onClose} className="bg-transparent border-none cursor-pointer p-0">
          <span style={{ ...MONO, fontSize: 9, color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            ← Back
          </span>
        </button>
        <span
          className="absolute left-1/2"
          style={{ ...MONO, fontSize: 9, color: "white", textTransform: "uppercase", letterSpacing: "0.08em", transform: "translateX(-50%)" }}
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
            <p style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Sign in to see notifications
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex items-center justify-center mt-12">
            <p style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
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

              {/* Message + timestamp */}
              <div className="flex-1 min-w-0">
                <p style={{ ...MONO, fontSize: 8, color: "white", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.4, margin: 0, wordBreak: "break-word" }}>
                  <NotificationActorMessage handle={n.actor_handle ?? null} type={n.type} onNavigate={goToActor} />
                </p>
                <p style={{ ...MONO, fontSize: 6, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "2px 0 0" }}>
                  {timeAgo(n.created_at)}
                </p>
              </div>

              {/* Post thumbnail */}
              {(n.type === "like" || n.type === "comment") && n.post_image_url && (
                <div style={{ width: 40, height: 40, flexShrink: 0, background: "#222", overflow: "hidden" }}>
                  <img src={n.post_image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
