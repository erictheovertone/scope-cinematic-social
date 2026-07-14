// ── src/components/CommentList.tsx ───────────────────────────────────────────
// Shared comment renderer for EVERY comment surface (home-feed lightbox, profile
// post-scroll, mobile feed sheet, desktop panels). One place owns: like heart +
// count, one-level reply nesting + affordance, the typography, and the avatar↔
// handle-line leveling — so the surfaces stay identical by construction.
//
// The comment INPUT stays per-surface (each panel places its own). Surfaces feed
// this component their already-loaded `comments` (flat, incl. replies via
// parent_comment_id) plus a `useCommentLikes` state + toggle, and receive an
// `onReply(comment)` callback to arm their input's replying-to state.
"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { feedImage } from "@/lib/mediaUrl";
import {
  getCommentLikeStates,
  likeComment,
  unlikeComment,
  type CommentLikeState,
} from "@/lib/commentInteractions";

const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

// A comment row as any surface holds it (loaded flat, enriched ad-hoc).
export interface UIComment {
  id: string;
  username?: string | null;
  content?: string | null;
  created_at?: string | null;
  parent_comment_id?: string | null;
  profile_image_url?: string | null;
  pending?: boolean;
  failed?: boolean;
}

export type CommentVariant = "lightbox" | "scroll" | "feed" | "desktop";

// ── Like state hook ─────────────────────────────────────────────────────────
// Loads batch like-state for the current comment set and exposes an optimistic
// toggle. `viewerUsername` is the ACTOR's handle (drives the notification copy).
export function useCommentLikes(
  comments: { id: string }[],
  viewerDid: string | null,
  viewerUsername: string | null,
) {
  const [likeStates, setLikeStates] = useState<Map<string, CommentLikeState>>(new Map());

  // Real (persisted) ids only — skip optimistic temp rows (tmp-/temp-).
  const idKey = comments
    .map((c) => c.id)
    .filter((id) => id && !/^t(e)?mp[-_]?/i.test(String(id)))
    .join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = idKey ? idKey.split(",") : [];
    if (ids.length === 0) {
      setLikeStates(new Map());
      return;
    }
    getCommentLikeStates(ids, viewerDid).then((m) => {
      if (!cancelled) setLikeStates(m);
    });
    return () => {
      cancelled = true;
    };
  }, [idKey, viewerDid]);

  const toggleLike = useCallback(
    async (commentId: string) => {
      if (!viewerDid || !commentId || /^t(e)?mp[-_]?/i.test(String(commentId))) return;
      let nowLiked = false;
      setLikeStates((prev) => {
        const m = new Map(prev);
        const s = m.get(commentId) ?? { count: 0, likedByMe: false };
        nowLiked = !s.likedByMe;
        m.set(commentId, { count: Math.max(0, s.count + (nowLiked ? 1 : -1)), likedByMe: nowLiked });
        return m;
      });
      try {
        if (nowLiked) await likeComment(commentId, viewerDid, viewerUsername || "user");
        else await unlikeComment(commentId, viewerDid);
      } catch {
        // revert on failure
        setLikeStates((prev) => {
          const m = new Map(prev);
          const s = m.get(commentId) ?? { count: 0, likedByMe: false };
          m.set(commentId, { count: Math.max(0, s.count + (nowLiked ? -1 : 1)), likedByMe: !nowLiked });
          return m;
        });
      }
    },
    [viewerDid, viewerUsername],
  );

  return { likeStates, toggleLike };
}

// ── Grouping (one level) ────────────────────────────────────────────────────
export function groupComments(comments: UIComment[]): { parent: UIComment; replies: UIComment[] }[] {
  const byParent = new Map<string, UIComment[]>();
  for (const c of comments) {
    if (c.parent_comment_id) {
      const arr = byParent.get(c.parent_comment_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_comment_id, arr);
    }
  }
  return comments
    .filter((c) => !c.parent_comment_id)
    .map((p) => ({ parent: p, replies: byParent.get(p.id) ?? [] }));
}

// ── Variant sizing ──────────────────────────────────────────────────────────
interface VCfg {
  avatar: boolean;
  avSize: number;
  handle: string; // css length
  text: string; // css length (already carries the +1.2 where required)
  hOp: number; // handle opacity
  tOp: number; // text opacity
  heart: number; // px — comment heart, ~65% of the 18.7 post heart
  gap: number;
  indent: number; // reply indent
  meta: string; // reply-link / time size
  showTime?: boolean;
  avNudge?: number; // extra px added to the measured avatar offset (feed: −1.2 up)
}

function cfgFor(variant: CommentVariant, desktopLightbox: boolean): VCfg {
  switch (variant) {
    case "lightbox":
      return { avatar: true, avSize: 16, handle: "var(--fs-8)", text: "calc(var(--fs-8) + 1.2px)", hOp: 1, tOp: 0.72, heart: 12, gap: 7, indent: 26, meta: "var(--fs-7)" };
    case "scroll":
      return { avatar: true, avSize: 16, handle: "var(--fs-9)", text: "calc(var(--fs-9) + 1.2px)", hOp: 1, tOp: 0.72, heart: 12, gap: 6, indent: 26, meta: "var(--fs-7)" };
    case "feed":
      return { avatar: true, avSize: 15, handle: "var(--fs-7)", text: "var(--fs-10)", hOp: 1, tOp: 0.72, heart: 12, gap: 7, indent: 22, meta: "var(--fs-7)", avNudge: -1.2 };
    case "desktop":
      return {
        avatar: true, avSize: 12,
        handle: desktopLightbox ? "11.5px" : "10px",
        text: desktopLightbox ? "12.7px" : "11.2px", // +1.2 on the desktop lightbox/scroll panels
        hOp: 1, tOp: 0.56, heart: 11, gap: 7, indent: 24, meta: "9px", showTime: true,
      };
  }
}

const scale = (size: string, f: number) => `calc((${size}) * ${f})`;

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// ── Like button (heart + count), leveled onto the handle line ────────────────
function LikeButton({ state, onToggle, cfg }: { state: CommentLikeState; onToggle: () => void; cfg: VCfg }) {
  const liked = state.likedByMe;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={liked ? "Unlike comment" : "Like comment"}
      style={{
        marginLeft: "auto", flexShrink: 0, alignSelf: "flex-start",
        height: `calc((${cfg.handle}) * 1.35)`,
        display: "flex", alignItems: "center", gap: 4,
        background: "none", border: "none", padding: 0, cursor: "pointer",
      }}
    >
      <svg width={cfg.heart} height={cfg.heart} viewBox="0 0 24 24"
        fill={liked ? "#FF0000" : "none"}
        stroke={liked ? "#FF0000" : "rgba(255,255,255,0.5)"} strokeWidth={2}>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.8 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
      {state.count > 0 && (
        <span style={{ ...SKR, fontSize: scale(cfg.meta, 1), color: liked ? "#FF0000" : "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {state.count}
        </span>
      )}
    </button>
  );
}

// ── Avatar↔handle leveling BY MEASUREMENT ────────────────────────────────────
// Two rounds of static box-height guesses missed because the rendered first-line
// box (text-driven) and the custom SK-Modernist metrics don't match the guess. This
// measures the avatar's center-Y against the @handle's box center at layout time and
// applies the exact residual as a translateY — cumulative (each pass corrects what's
// left), re-run once the custom font loads (metrics shift on swap). Self-correcting →
// it lands level regardless of variant / font size / DPR, and it's ONE place for
// every surface. Set NEXT_PUBLIC_DEBUG_COMMENT_ALIGN=1 to print the rects.
function useLevelAvatar(depKey: string, biasPx = 0) {
  const avatarRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    let alive = true;
    const measure = () => {
      const a = avatarRef.current;
      const h = handleRef.current;
      if (!alive || !a || !h) return;
      const ar = a.getBoundingClientRect();
      const hr = h.getBoundingClientRect();
      if (!ar.height || !hr.height) return;
      const avatarCenter = ar.top + ar.height / 2;
      // Target the @-line box center, plus an optional bias (feed: −1.2 → 1.2px up).
      const handleCenter = hr.top + hr.height / 2 + biasPx;
      const residual = handleCenter - avatarCenter; // >0 → avatar sits high → nudge down
      if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_COMMENT_ALIGN === "1") {
        // eslint-disable-next-line no-console
        console.log("[comment-align]", depKey, { avatarCenter: +avatarCenter.toFixed(2), handleCenter: +handleCenter.toFixed(2), residual: +residual.toFixed(2) });
      }
      if (Math.abs(residual) > 0.5) setOffset((o) => o + residual);
    };
    measure();
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(() => { if (alive) measure(); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return { avatarRef, handleRef, offset };
}

// ── One comment row ─────────────────────────────────────────────────────────
function Row({
  c, isReply, cfg, likeStates, onToggleLike, onReply, onProfile, avatarUrl, viewerDid,
}: {
  c: UIComment;
  isReply: boolean;
  cfg: VCfg;
  likeStates: Map<string, CommentLikeState>;
  onToggleLike: (id: string) => void;
  onReply?: (c: UIComment) => void;
  onProfile?: (handle: string) => void;
  avatarUrl: string | null;
  viewerDid: string | null;
}) {
  const st = likeStates.get(c.id) ?? { count: 0, likedByMe: false };
  const handleSize = isReply ? scale(cfg.handle, 0.94) : cfg.handle;
  const textSize = isReply ? scale(cfg.text, 0.94) : cfg.text;
  const avSize = isReply ? Math.round(cfg.avSize * 0.9) : cfg.avSize;
  const canProfile = !!(c.username && onProfile);
  const { avatarRef, handleRef, offset } = useLevelAvatar(`${handleSize}:${avSize}`, cfg.avNudge ?? 0);

  return (
    <div
      style={{
        display: "flex",
        gap: cfg.gap,
        alignItems: "flex-start",
        marginBottom: 8,
        marginLeft: isReply ? cfg.indent : 0,
        opacity: c.pending ? 0.55 : 1,
        animation: "ripple-down 0.2s ease-out both",
      }}
    >
      {/* Avatar — its center is aligned to the @handle box center BY MEASUREMENT
          (useLevelAvatar applies the exact residual as translateY). */}
      {cfg.avatar && (
        <div
          ref={avatarRef}
          onClick={canProfile ? (e) => { e.stopPropagation(); onProfile!(c.username as string); } : undefined}
          style={{ width: avSize, height: avSize, borderRadius: "50%", background: "#2a2a2a", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transform: `translateY(${offset}px)`, cursor: canProfile ? "pointer" : "default" }}
        >
          {avatarUrl ? (
            <img src={feedImage(avatarUrl, 96)} alt={c.username ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <span style={{ ...SKB, fontSize: scale(handleSize, 0.85), color: "white", textTransform: "uppercase", lineHeight: 1 }}>
              {c.username?.[0] ?? "?"}
            </span>
          )}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ lineHeight: 1.3 }}>
          <span
            ref={handleRef}
            onClick={canProfile ? (e) => { e.stopPropagation(); onProfile!(c.username as string); } : undefined}
            style={{ ...SKB, fontSize: handleSize, color: `rgba(255,255,255,${cfg.hOp})`, marginRight: 5, textTransform: "uppercase", cursor: canProfile ? "pointer" : "default", display: "inline-block" }}
          >
            @{c.username}
          </span>
          <span style={{ ...SKR, fontSize: textSize, color: `rgba(255,255,255,${cfg.tOp})` }}>{c.content}</span>
        </div>

        {/* Meta row — reply link (top-level only) + optional timestamp. */}
        {(( !isReply && onReply && viewerDid ) || (cfg.showTime && c.created_at)) && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 3 }}>
            {!isReply && onReply && viewerDid && (
              <button
                onClick={(e) => { e.stopPropagation(); onReply(c); }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...SKR, fontSize: cfg.meta, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}
              >
                reply
              </button>
            )}
            {cfg.showTime && c.created_at && (
              <span style={{ ...SKR, fontSize: cfg.meta, color: "rgba(255,255,255,0.3)" }}>{timeAgo(c.created_at)}</span>
            )}
          </div>
        )}
      </div>

      {viewerDid && <LikeButton state={st} onToggle={() => onToggleLike(c.id)} cfg={cfg} />}
    </div>
  );
}

// ── List ────────────────────────────────────────────────────────────────────
export default function CommentList({
  comments,
  variant,
  desktopLightbox = false,
  likeStates,
  onToggleLike,
  onReply,
  onProfile,
  viewerDid,
  avatarUrl,
}: {
  comments: UIComment[];
  variant: CommentVariant;
  desktopLightbox?: boolean;
  likeStates: Map<string, CommentLikeState>;
  onToggleLike: (id: string) => void;
  onReply?: (c: UIComment) => void;
  onProfile?: (handle: string) => void;
  viewerDid: string | null;
  /** Resolve a comment's avatar url (default: the row's own profile_image_url). */
  avatarUrl?: (c: UIComment) => string | null;
}) {
  const cfg = cfgFor(variant, desktopLightbox);
  const groups = groupComments(comments);
  const resolveAvatar = avatarUrl ?? ((c: UIComment) => c.profile_image_url ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <>
      {groups.map(({ parent, replies }) => {
        const isOpen = expanded.has(parent.id);
        // Never collapse while a reply is in flight — a just-posted reply must stay visible.
        const collapsed = replies.length > 2 && !isOpen && !replies.some((r) => r.pending);
        const shown = collapsed ? [] : replies;
        return (
          <div key={parent.id}>
            <Row
              c={parent} isReply={false} cfg={cfg}
              likeStates={likeStates} onToggleLike={onToggleLike} onReply={onReply}
              onProfile={onProfile} avatarUrl={resolveAvatar(parent)} viewerDid={viewerDid}
            />
            {collapsed && (
              <button
                onClick={() => setExpanded((s) => new Set(s).add(parent.id))}
                style={{ marginLeft: cfg.indent, marginBottom: 8, background: "none", border: "none", padding: 0, cursor: "pointer", ...SKR, fontSize: cfg.meta, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}
              >
                — view {replies.length} replies
              </button>
            )}
            {shown.map((r) => (
              <Row
                key={r.id} c={r} isReply cfg={cfg}
                likeStates={likeStates} onToggleLike={onToggleLike}
                onProfile={onProfile} avatarUrl={resolveAvatar(r)} viewerDid={viewerDid}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

// ── Reply composer — a BOTTOM PULL-UP SHEET (the app's sheet language) ───────
// REPLIES rise a compact sheet from the bottom; the feed/post stays visible above,
// lightly dimmed — the user never leaves the page. It quotes the parent for context.
// Top-level comments keep their surface's own inline bottom input (this is replies-
// only). Discipline: mobile raises the body-level takeover flag (footer pill hides)
// and the sheet rides above the keyboard (visualViewport); dismiss via × / drag-down /
// tap-above, all through a dirty-state discard confirm. Desktop: a compact panel
// anchored bottom-right, near the comment column (NOT a centered modal).
export function ReplyComposer({
  parent,
  onSubmit,
  onClose,
  variant = "mobile",
}: {
  parent: UIComment;
  onSubmit: (text: string) => Promise<void>;
  onClose: () => void;
  variant?: "mobile" | "desktop";
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);
  const isDesktop = variant === "desktop";

  // Body-level takeover flag (mobile) → BottomToolbar hides the footer pill.
  useEffect(() => {
    if (variant !== "mobile") return;
    const had = document.documentElement.dataset.suiteOpen;
    document.documentElement.dataset.suiteOpen = "1";
    window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    return () => {
      if (!had) delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    };
  }, [variant]);

  // Slide up on mount.
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // Autofocus the input (defer a frame so the keyboard rises with the sheet).
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Track the visual viewport so the sheet sits ABOVE the mobile keyboard.
  useEffect(() => {
    const vpo = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vpo) return;
    const on = () => setVv({ h: vpo.height, top: vpo.offsetTop });
    on();
    vpo.addEventListener("resize", on);
    vpo.addEventListener("scroll", on);
    return () => {
      vpo.removeEventListener("resize", on);
      vpo.removeEventListener("scroll", on);
    };
  }, []);

  // Animate the sheet down, then unmount.
  const finish = useCallback(() => {
    setMounted(false);
    setTimeout(onClose, 220);
  }, [onClose]);

  const attemptClose = useCallback(() => {
    if (text.trim()) setAskDiscard(true);
    else finish();
  }, [text, finish]);

  // Esc cancels (through the dirty-state gate).
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); attemptClose(); } };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [attemptClose]);

  const submit = async () => {
    const t = text.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    try { await onSubmit(t); finish(); }
    catch { setSubmitting(false); }
  };

  // Drag-down to dismiss (grabber).
  const onGrab = (e: React.PointerEvent) => {
    const startY = e.clientY;
    setDragging(true);
    const move = (ev: PointerEvent) => setDragY(Math.max(0, ev.clientY - startY));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      if (ev.clientY - startY > 70) { setDragY(0); attemptClose(); }
      else setDragY(0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Off-screen until mounted; then follow the drag.
  const sheetTransform = mounted ? `translateY(${dragY}px)` : "translateY(110%)";

  const body = (
    <>
      {/* Header + close */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ ...SKB, fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Replying to @{parent.username}
        </span>
        <button onClick={attemptClose} aria-label="Cancel reply" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...SKR, fontSize: 18, color: "rgba(255,255,255,0.55)", lineHeight: 1 }}>✕</button>
      </div>

      {/* Parent comment quoted for context (muted, clamped) */}
      <div style={{ borderLeft: "2px solid rgba(255,255,255,0.14)", paddingLeft: 10 }}>
        <span style={{ ...SKB, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginRight: 5 }}>@{parent.username}</span>
        <span style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.4)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{parent.content}</span>
      </div>

      {/* Input */}
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={`reply to @${parent.username}…`}
        style={{
          width: "100%", background: "transparent", border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.18)", outline: "none",
          ...SKR, fontSize: "max(16px, var(--fs-10))", color: "white", padding: "6px 0",
        }}
      />

      {/* Discard confirm (dirty state) OR the POST row */}
      {askDiscard ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Discard reply?</span>
          <div style={{ display: "flex", gap: 16 }}>
            <button onClick={() => setAskDiscard(false)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...SKB, fontSize: "var(--fs-9)", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>keep</button>
            <button onClick={finish} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...SKB, fontSize: "var(--fs-9)", color: "#FF0000", textTransform: "uppercase" }}>discard</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={submit}
            disabled={!text.trim() || submitting}
            style={{ background: "none", border: "none", padding: 0, cursor: text.trim() ? "pointer" : "default", ...SKB, fontSize: "var(--fs-10)", color: text.trim() ? "white" : "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.04em" }}
          >
            {submitting ? "posting…" : "post"}
          </button>
        </div>
      )}
    </>
  );

  return createPortal(
    <div
      style={{
        position: "fixed", left: 0,
        top: vv?.top ?? 0,
        width: "100%", height: vv?.h ?? "100%",
        display: "flex", flexDirection: "column",
        justifyContent: "flex-end", alignItems: isDesktop ? "flex-end" : "stretch",
        padding: isDesktop ? 24 : 0, zIndex: 1200, pointerEvents: "none",
      }}
    >
      {/* Light dim over the still-visible page — tap-above dismisses. */}
      <div onClick={attemptClose} style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${isDesktop ? 0.28 : 0.35})`, opacity: mounted ? 1 : 0, transition: "opacity 0.26s ease", pointerEvents: "auto" }} />

      {/* The sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", pointerEvents: "auto",
          width: isDesktop ? 480 : "100%", maxWidth: isDesktop ? 480 : "none",
          background: "#0c0c0c",
          borderTop: isDesktop ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.1)",
          border: isDesktop ? "1px solid rgba(255,255,255,0.1)" : undefined,
          boxShadow: "0 -18px 60px rgba(0,0,0,0.6)",
          padding: isDesktop ? "14px 18px 18px" : "8px 18px calc(18px + env(safe-area-inset-bottom))",
          display: "flex", flexDirection: "column", gap: 12,
          transform: sheetTransform,
          transition: dragging ? "none" : "transform 0.26s cubic-bezier(0.16,0.84,0.3,1)",
        }}
      >
        {/* Grabber — drag it down to dismiss (mobile sheet language). */}
        <div
          onPointerDown={onGrab}
          style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.25)", margin: "0 0 6px", cursor: "grab", touchAction: "none" }}
        />
        {body}
      </div>
    </div>,
    document.body,
  );
}
