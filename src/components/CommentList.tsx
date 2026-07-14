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

import React, { useCallback, useEffect, useRef, useState } from "react";
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
}

function cfgFor(variant: CommentVariant, desktopLightbox: boolean): VCfg {
  switch (variant) {
    case "lightbox":
      return { avatar: true, avSize: 16, handle: "var(--fs-8)", text: "calc(var(--fs-8) + 1.2px)", hOp: 1, tOp: 0.72, heart: 12, gap: 7, indent: 26, meta: "var(--fs-7)" };
    case "scroll":
      return { avatar: true, avSize: 16, handle: "var(--fs-9)", text: "calc(var(--fs-9) + 1.2px)", hOp: 1, tOp: 0.72, heart: 12, gap: 6, indent: 26, meta: "var(--fs-7)" };
    case "feed":
      return { avatar: true, avSize: 15, handle: "var(--fs-7)", text: "var(--fs-10)", hOp: 1, tOp: 0.72, heart: 12, gap: 7, indent: 22, meta: "var(--fs-7)" };
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
  const lineBox = `calc((${handleSize}) * 1.35)`; // first-line box → centers avatar/like on the handle line
  const canProfile = !!(c.username && onProfile);

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
      {/* Avatar — boxed to the handle line-height and centered inside it, so its
          vertical center sits on the handle line regardless of wrap. */}
      {cfg.avatar && (
        <div
          onClick={canProfile ? (e) => { e.stopPropagation(); onProfile!(c.username as string); } : undefined}
          style={{ height: lineBox, display: "flex", alignItems: "center", flexShrink: 0, cursor: canProfile ? "pointer" : "default" }}
        >
          <div style={{ width: avSize, height: avSize, borderRadius: "50%", background: "#2a2a2a", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {avatarUrl ? (
              <img src={feedImage(avatarUrl, 96)} alt={c.username ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <span style={{ ...SKB, fontSize: scale(handleSize, 0.85), color: "white", textTransform: "uppercase", lineHeight: 1 }}>
                {c.username?.[0] ?? "?"}
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ lineHeight: 1.3 }}>
          <span
            onClick={canProfile ? (e) => { e.stopPropagation(); onProfile!(c.username as string); } : undefined}
            style={{ ...SKB, fontSize: handleSize, color: `rgba(255,255,255,${cfg.hOp})`, marginRight: 5, textTransform: "uppercase", cursor: canProfile ? "pointer" : "default" }}
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

// ── Reply composer — a centered shadow-box takeover (IG-style) ───────────────
// REPLIES get a focused overlay (the parent comment is quoted for context) instead
// of squeezing the inline thread input. Top-level comments keep their surface's own
// bottom composer. Discipline: scrim + centered elevated card, autofocus ≥16px, the
// card centers in the VISIBLE viewport (rides above the mobile keyboard via
// visualViewport), Esc / scrim tap cancels with a dirty-state confirm, and on mobile
// it raises the body-level takeover flag so the footer pill hides.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);

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

  // Autofocus the input (defer a frame so the keyboard rises with the card).
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Track the visual viewport so the card centers ABOVE the keyboard on mobile.
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

  const attemptClose = useCallback(() => {
    if (text.trim()) setAskDiscard(true);
    else onClose();
  }, [text, onClose]);

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
    try { await onSubmit(t); onClose(); }
    catch { setSubmitting(false); }
  };

  const isDesktop = variant === "desktop";

  return createPortal(
    <div
      style={{
        position: "fixed", left: 0,
        top: vv?.top ?? 0,
        width: "100%", height: vv?.h ?? "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: isDesktop ? 24 : 18, zIndex: 1200,
      }}
    >
      <div onClick={attemptClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", width: isDesktop ? 480 : "100%", maxWidth: isDesktop ? 480 : 440,
          background: "#0c0c0c", border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 90px rgba(0,0,0,0.75)", padding: 18,
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
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
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...SKB, fontSize: "var(--fs-9)", color: "#FF0000", textTransform: "uppercase" }}>discard</button>
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
      </div>
    </div>,
    document.body,
  );
}
