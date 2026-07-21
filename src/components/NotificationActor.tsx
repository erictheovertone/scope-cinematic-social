"use client";

import React from "react";
import { feedImage } from "@/lib/mediaUrl";

/**
 * Shared notification-actor rendering — ONE place every notification type draws
 * its actor (avatar + @handle), so future types (collect, …) inherit display +
 * navigation automatically instead of per-type wiring.
 *
 * Both the actor avatar and the @handle tap through to the actor's profile
 * (routed by handle, the same pattern used for comment-row authors), and they
 * stopPropagation so the tap never also fires the notification row's own action.
 */

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

/** Action phrase per type — type-driven so new types just add a case here. */
export function notificationActionText(type: string): string {
  switch (type) {
    case "like": return "liked your post";
    case "comment": return "commented on your post";
    case "follow": return "started following you";
    case "collect": return "collected your post";
    case "message": return "sent you a message";
    case "reply": return "replied to your comment";
    case "comment_like": return "liked your comment";
    default: return "interacted with you";
  }
}

interface ActorAvatarProps {
  handle: string | null;
  avatar: string | null;
  size?: number;
  onNavigate: (handle: string) => void;
}

/** Tappable actor avatar → their profile. Fallback initial ONLY when no avatar. */
export function NotificationActorAvatar({ handle, avatar, size = 24, onNavigate }: ActorAvatarProps) {
  const tappable = !!handle;
  return (
    <div
      onClick={tappable ? (e) => { e.stopPropagation(); onNavigate(handle!); } : undefined}
      style={{
        width: size, height: size, borderRadius: "50%", background: "#222",
        flexShrink: 0, overflow: "hidden", display: "flex",
        alignItems: "center", justifyContent: "center",
        cursor: tappable ? "pointer" : "default",
      }}
    >
      {avatar ? (
        <img src={feedImage(avatar, 96)} alt={handle ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB" }}>
          {handle?.[0]?.toUpperCase() ?? "?"}
        </span>
      )}
    </div>
  );
}

interface ActorMessageProps {
  handle: string | null;
  type: string;
  onNavigate: (handle: string) => void;
}

/** "@handle <action>" — the @handle taps through to their profile. Inherits the
 *  surrounding text style; falls back to "someone" if the actor can't resolve. */
export function NotificationActorMessage({ handle, type, onNavigate }: ActorMessageProps) {
  return (
    <>
      {handle ? (
        <span
          onClick={(e) => { e.stopPropagation(); onNavigate(handle); }}
          /* Brief F5 §6b — handle restyle: −3px (fs-14 message → fs-11), 65 Medium
             (--font-medium / 500), 60% ink. Distinguishes the actor from the action. */
          style={{ cursor: "pointer", fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: "var(--fs-11)", color: "rgba(229,225,219,0.6)" }}
        >
          @{handle}
        </span>
      ) : (
        <span>someone</span>
      )}{" "}
      {notificationActionText(type)}
    </>
  );
}
