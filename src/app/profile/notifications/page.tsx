"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getNotifications,
  type AppNotification,
} from "@/lib/userService";
import { supabase } from "@/lib/supabase/client";
import { getPostById } from "@/lib/postsService";
import { feedImage } from "@/lib/mediaUrl";
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

// ── Notification classes ──
// SOCIAL = engagement: like, comment, follow (+ future mention/reply).
// ECONOMIC = everything else (collect, earnings, badges…) — new economy types
// land in the right tab by default. SELLS are excluded everywhere (ratified:
// sells don't notify; historical 'sell' rows are hidden at render).
const SOCIAL_TYPES = ['like', 'comment', 'follow', 'mention', 'reply', 'comment_like', 'message'];
const isSocial = (n: AppNotification) => SOCIAL_TYPES.includes(n.type);

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [openedPost, setOpenedPost] = useState<any>(null);
  const [tab, setTab] = useState<'social' | 'economic'>('social');
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Deep-link: ?tab=market opens with the MARKET tab active (the wallet bell's
  // entry point). Read once on mount; no other routing changes.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'market' || t === 'economic') setTab('economic');
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const data = await getNotifications(user.id);
        setNotifications(data);
      } catch (e) {
        console.error("NotificationsPage load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  // READ MECHANISM (changed from mark-ALL-on-page-load): reads happen PER TAB
  // VISIT — the tab you're looking at marks its rows read; the other tab's
  // badge survives until you actually visit it. The badges read this same truth.
  const markTabRead = (which: 'social' | 'economic') => {
    setNotifications((prev) => {
      const ids = prev.filter((n) => !n.is_read && (which === 'social' ? isSocial(n) : !isSocial(n))).map((n) => n.id);
      if (!ids.length) return prev;
      supabase.from('notifications').update({ is_read: true }).in('id', ids).then(({ error }) => {
        if (error) console.warn('[notifications] mark-read failed:', error.message);
      });
      return prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n));
    });
  };
  // Mark the visible tab read once loaded, and on every tab activation.
  useEffect(() => {
    if (loading || !user) return;
    const t = window.setTimeout(() => markTabRead(tab), 600); // brief beat so the unread marks are seen
    return () => window.clearTimeout(t);
  }, [loading, tab, user?.id]);

  const handleClick = async (n: AppNotification) => {
    if (n.type === "follow") {
      const handle = n.actor_handle ?? n.sender_username;
      if (handle) router.push(`/profile/${handle}`);
      return;
    }
    if (n.type === "message") {
      // DM notification → open the thread with the sender (keyed by @handle).
      const handle = n.actor_handle ?? n.sender_username;
      if (handle) router.push(`/dm/${encodeURIComponent(handle)}`);
      return;
    }
    if (!n.post_id) return; // legacy row without a post reference — stays dead
    const post = await getPostById(n.post_id);
    if (post) setOpenedPost(post);
  };

  const goToActor = (handle: string) => router.push(`/profile/${handle}`);

  // 'sell' rows are hidden everywhere (they previously fell to the generic
  // "interacted with you" copy — the mystery rows).
  const visible = useMemo(() => notifications.filter((n) => String(n.type) !== 'sell'), [notifications]);
  const socialList = useMemo(() => visible.filter(isSocial), [visible]);
  const marketList = useMemo(() => visible.filter((n) => !isSocial(n)), [visible]);
  const unreadSocial = socialList.filter((n) => !n.is_read).length;
  const unreadMarket = marketList.filter((n) => !n.is_read).length;

  // ── Tab swipe (the theatre language): the two panes ride a 200%-wide strip
  // that follows the finger; release past 30% width (or a flick) snaps to the
  // neighbor; the ends rubber-band at 0.3×. Horizontal-intent lock keeps
  // vertical scroll native. data-swipe-exclude scopes the global SwipeNav out.
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; axis: 'h' | 'v' | null; lastX: number; lastT: number; vx: number } | null>(null);
  const paneW = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    paneW.current = listRef.current?.clientWidth ?? window.innerWidth;
    drag.current = { x: t.clientX, y: t.clientY, axis: null, lastX: t.clientX, lastT: e.timeStamp, vx: 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x, dy = t.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (d.axis === 'h') setDragging(true);
    }
    if (d.axis !== 'h') return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.vx = (t.clientX - d.lastX) / dt;
    d.lastX = t.clientX; d.lastT = e.timeStamp;
    // rubber-band past the ends
    const atStart = tab === 'social' && dx > 0;
    const atEnd = tab === 'economic' && dx < 0;
    setDragX(atStart || atEnd ? dx * 0.3 : dx);
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || d.axis !== 'h') { setDragX(0); return; }
    const commit = Math.abs(dragX) > paneW.current * 0.3 || Math.abs(d.vx) > 0.5;
    if (commit) {
      if (dragX < 0 && tab === 'social') setTab('economic');
      else if (dragX > 0 && tab === 'economic') setTab('social');
    }
    setDragX(0);
  };

  const stripX = (tab === 'social' ? 0 : -50); // % of the 200% strip

  // Framed unread count — the boxed-number language (banner chip / count-pill
  // family): thin muted border, dark fill, white number. Absent at zero.
  const CountChip = ({ n }: { n: number }) =>
    n > 0 ? (
      <span style={{ ...SKB, fontSize: 9, color: '#E5E1DB', background: '#0b0b0b', border: '1px solid rgba(229,225,219,0.28)', padding: '1px 5px', marginLeft: 7, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3, verticalAlign: 'baseline' }}>
        {n}
      </span>
    ) : null;

  const renderRow = (n: AppNotification) => (
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
        <div style={{ position: "absolute", left: 5, top: "50%", transform: "translateY(-50%)", width: 4.5, height: 4.5, background: "#E5E1DB" }} />
      )}

      {/* Avatar — tappable → actor profile */}
      <NotificationActorAvatar handle={n.actor_handle ?? null} avatar={n.actor_avatar ?? null} onNavigate={goToActor} />

      {/* Message (+3px per the pass: fs-11 → fs-14; timestamp fs-8 → fs-9 to
          keep the pair proportioned) */}
      <div className="flex-1 min-w-0">
        <p style={{ ...SKR, fontSize: 'var(--fs-14)', color: "#E5E1DB", letterSpacing: "-0.16px", lineHeight: 1.4, margin: 0, wordBreak: "break-word" }}>
          <NotificationActorMessage handle={n.actor_handle ?? null} type={n.type} onNavigate={goToActor} />
        </p>
        <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(229,225,219,0.4)", letterSpacing: "-0.1px", margin: "2px 0 0" }}>
          {timeAgo(n.created_at)}
        </p>
      </div>

      {/* Post thumbnail — ANY type that carries one (the like/comment-only gate
          was why market rows looked thumbless — the data was always there).
          Sized to the post's TRUE aspect ratio; feedImage(96) like every thumb. */}
      {n.post_image_url && (
        <div style={{ width: 60, aspectRatio: getAspectRatio(n.post_layout_id ?? ''), flexShrink: 0, background: "#222", overflow: "hidden" }}>
          <img src={feedImage(n.post_image_url, 96)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      )}
    </button>
  );

  const renderPane = (list: AppNotification[], emptyLabel: string) => (
    <div style={{ width: '50%', flexShrink: 0 }}>
      {list.length === 0 ? (
        <div className="flex items-center justify-center mt-12">
          <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(229,225,219,0.4)" }}>{emptyLabel}</p>
        </div>
      ) : (
        list.map(renderRow)
      )}
    </div>
  );

  return (
    <div className="bg-black w-full app-shell screen-min mx-auto flex flex-col">

      {/* Header */}
      <div className="relative flex items-center px-[4px] pt-[12px] pb-[10px]">
        <button
          onClick={() => router.back()}
          className="bg-transparent border-none cursor-pointer p-0"
        >
          <span style={{ ...SKR, fontSize: 'var(--fs-9)', color: "#E5E1DB", letterSpacing: "-0.18px" }}>
            ← Back
          </span>
        </button>
        <span
          className="absolute left-1/2"
          style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", letterSpacing: "-0.18px", transform: "translateX(-50%)" }}
        >
          NOTIFICATIONS
        </span>
      </div>

      {/* SOCIAL / MARKET toggle — with framed unread counts (absent at zero). */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(229,225,219,0.1)" }}>
        {(["social", "economic"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, background: "transparent", border: "none",
              borderBottom: `1px solid ${tab === t ? "#E5E1DB" : "transparent"}`,
              cursor: "pointer", padding: "9px 0",
              ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.12em",
              color: tab === t ? "#E5E1DB" : "rgba(229,225,219,0.4)", textTransform: "uppercase",
            }}
          >
            {t === "social" ? "SOCIAL" : "MARKET"}
            <CountChip n={t === "social" ? unreadSocial : unreadMarket} />
          </button>
        ))}
      </div>

      {/* List area — a 200% strip of both panes; swipe flips tabs (finger-
          tracked, snap, rubber-band). data-swipe-exclude keeps the global
          page-swipe out of this surface. */}
      <div ref={listRef} data-swipe-exclude className="flex-1 overflow-y-auto" style={{ overflowX: 'hidden' }}>
        {loading ? (
          <div className="flex items-center justify-center mt-12">
            <FrameLoader />
          </div>
        ) : !user ? (
          <div className="flex items-center justify-center mt-12">
            <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(229,225,219,0.4)" }}>
              Sign in to see notifications
            </p>
          </div>
        ) : (
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              display: 'flex',
              width: '200%',
              transform: `translateX(calc(${stripX}% + ${dragX}px))`,
              transition: dragging || reducedMotion ? 'none' : 'transform 240ms cubic-bezier(0.22,0.8,0.3,1)',
            }}
          >
            {renderPane(socialList, 'No social notifications yet')}
            {renderPane(marketList, 'No market notifications yet')}
          </div>
        )}
      </div>

      {openedPost && <PostModal post={openedPost} onClose={() => setOpenedPost(null)} />}

    </div>
  );
}
