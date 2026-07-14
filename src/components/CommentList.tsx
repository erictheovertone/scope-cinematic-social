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

import React, { useCallback, useEffect, useState } from "react";
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
      return { avatar: false, avSize: 0, handle: "var(--fs-7)", text: "var(--fs-10)", hOp: 1, tOp: 0.72, heart: 12, gap: 6, indent: 22, meta: "var(--fs-7)" };
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
        const collapsed = replies.length > 2 && !isOpen;
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

// ── Replying-to chip — dropped above each surface's own input ────────────────
export function ReplyingToChip({
  handle, onCancel, size = "var(--fs-8)",
}: {
  handle: string;
  onCancel: () => void;
  size?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ ...SKR, fontSize: size, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Replying to <span style={{ ...SKB, color: "rgba(255,255,255,0.75)" }}>@{handle}</span>
      </span>
      <button
        onClick={onCancel}
        aria-label="Cancel reply"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...SKR, fontSize: size, color: "rgba(255,255,255,0.5)", lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  );
}
