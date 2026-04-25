"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getNotifications,
  markAllNotificationsRead,
  type AppNotification,
} from "@/lib/userService";

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

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

  const handleClick = (n: AppNotification) => {
    onClose();
    if (n.type === "follow") {
      if (n.sender_username) router.push(`/profile/${n.sender_username}`);
    } else {
      router.push("/profile");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "#000", maxWidth: 375, margin: "0 auto" }}
    >
      {/* Header */}
      <div className="relative flex items-center px-[4px] pt-[12px] pb-[10px]">
        <button onClick={onClose} className="bg-transparent border-none cursor-pointer p-0">
          <span style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.18px" }}>
            ← Back
          </span>
        </button>
        <span
          className="absolute left-1/2"
          style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.18px", transform: "translateX(-50%)" }}
        >
          NOTIFICATIONS
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center mt-12">
            <div style={{ width: 11, height: 11, background: "#FF0000", borderRadius: "50%" }} />
          </div>
        ) : !user ? (
          <div className="flex items-center justify-center mt-12">
            <p style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
              Sign in to see notifications
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex items-center justify-center mt-12">
            <p style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
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
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 8px 9px 6px",
                borderLeft: n.is_read ? "2px solid transparent" : "2px solid #FF0000",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#222",
                  flexShrink: 0,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {n.sender_avatar ? (
                  <img
                    src={n.sender_avatar}
                    alt={n.sender_username ?? ""}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ ...MONO, fontSize: 9, color: "white" }}>
                    {n.sender_username?.[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>

              {/* Message + timestamp */}
              <div className="flex-1 min-w-0">
                <p style={{ ...MONO, fontSize: 8, color: "white", letterSpacing: "-0.16px", lineHeight: 1.4, margin: 0, wordBreak: "break-word" }}>
                  {n.message}
                </p>
                <p style={{ ...MONO, fontSize: 6, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.1px", margin: "2px 0 0" }}>
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
    </div>
  );
}
