"use client";

import React from "react";

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
        <img src={avatar} alt={handle ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white" }}>
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
          style={{ cursor: "pointer", color: "#FF0000" }}
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
