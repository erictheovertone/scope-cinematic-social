// ── musicUi — shared primitives for the MUS-1 music surfaces ─────────────────────────────────────
// Track view, composer page, manage page and the bio-sheet MUSIC section draw from ONE set of
// recipes so they read as one system (docs/design/scope-music-mock.html): the uppercase label,
// the bordered action button (filled = primary), the round play glyph, the numbered track row
// and the square album tile. Tokens only (ink ladder / canvas / surfaces) — both themes flip.
// Sharp corners everywhere except the round play buttons + avatars, as in the mock.
"use client";

import React from "react";
import { feedImage } from "@/lib/mediaUrl";

export const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
export const SKM: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 500 };
export const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
export const HAIR = "rgb(var(--ink-rgb) / 0.16)";
export const DOT = "rgb(var(--ink-rgb) / 0.32)";
export const MUTE = "rgb(var(--ink-rgb) / 0.5)";
export const INK = "var(--ink-100)";

/** The mock's `.lbl` — 12px bold uppercase, wide tracking, muted. */
export const LBL: React.CSSProperties = { ...SKB, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE };
export const TIME: React.CSSProperties = { ...SKR, fontSize: 11, color: MUTE, fontVariantNumeric: "tabular-nums" };

/** A section head — label left, optional name/aside right (the mock's `.sec`). */
export function SecHead({ label, name, aside, first }: { label: string; name?: string; aside?: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: first ? "4px 0 10px" : "26px 0 10px" }}>
      <span style={LBL}>{label}</span>
      {name && <span style={{ ...SKM, fontSize: 15, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>}
      {aside && <span style={{ ...SKR, fontSize: 12, color: MUTE, textAlign: "right" }}>{aside}</span>}
    </div>
  );
}

/** Bordered action button. `fill` = the primary (ink fill, --on-ink text). */
export function Act({ children, onClick, fill, small, disabled, style, testId, ariaLabel }: {
  children: React.ReactNode; onClick?: () => void; fill?: boolean; small?: boolean; disabled?: boolean;
  style?: React.CSSProperties; testId?: string; ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      aria-label={ariaLabel}
      style={{
        ...SKB, display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap",
        border: `1px solid ${INK}`, background: fill ? INK : "transparent", color: fill ? "var(--on-ink)" : INK,
        padding: small ? "8px 12px" : "11px 14px", fontSize: small ? 11 : 12, letterSpacing: "0.08em", textTransform: "uppercase",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1, borderRadius: 0, ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Round play/pause button (the mock's `.play`). */
export function PlayButton({ playing, onClick, size = 44, label }: { playing: boolean; onClick: () => void; size?: number; label?: string }) {
  const g = Math.round(size * 0.3);
  return (
    <button type="button" onClick={onClick} aria-label={label ?? (playing ? "Pause" : "Play")}
      style={{ flexShrink: 0, width: size, height: size, borderRadius: "50%", border: `1px solid ${INK}`, background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
      {playing
        ? <svg width={g} height={g} viewBox="0 0 24 24" fill="var(--ink-100)"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
        : <svg width={g} height={g} viewBox="0 0 24 24" fill="var(--ink-100)" style={{ marginLeft: 2 }}><path d="M7 5v14l12-7z" /></svg>}
    </button>
  );
}

/** The small row-end play dot (the mock's `.pl`) — filled when current. */
export function RowDot({ current, playing }: { current?: boolean; playing?: boolean }) {
  return (
    <span aria-hidden style={{ width: 24, height: 24, flexShrink: 0, borderRadius: "50%", border: `1px solid ${current ? INK : HAIR}`, background: current ? INK : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {playing
        ? <svg width="8" height="8" viewBox="0 0 24 24" fill="var(--on-ink)"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
        : <svg width="8" height="8" viewBox="0 0 24 24" fill={current ? "var(--on-ink)" : MUTE} style={{ marginLeft: 1 }}><path d="M7 5v14l12-7z" /></svg>}
    </span>
  );
}

export const num2 = (i: number) => String(i + 1).padStart(2, "0");

/** A numbered track row (the mock's `.tr`): 01 · title · [album] · m:ss · dot. */
export function TrackRow({ index, title, album, dur, current, playing, onClick, last, testId, albumW = 120 }: {
  index: number; title: string; album?: string | null; dur: string; current?: boolean; playing?: boolean;
  onClick?: () => void; last?: boolean; testId?: string; albumW?: number;
}) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} aria-current={current ? "true" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 12, minHeight: 48, width: "100%", textAlign: "left",
        background: "none", border: "none", borderTop: `1px solid ${HAIR}`, borderBottom: last ? `1px solid ${HAIR}` : "none",
        padding: 0, cursor: onClick ? "pointer" : "default", color: INK,
      }}>
      <span style={{ ...TIME, width: 22, flexShrink: 0 }}>{num2(index)}</span>
      <span style={{ ...SKM, fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: current ? INK : "rgb(var(--ink-rgb) / 0.86)" }}>{title}</span>
      {album != null && <span style={{ ...SKR, fontSize: 12, color: MUTE, width: albumW, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{album}</span>}
      <span style={{ ...TIME, width: 40, textAlign: "right", flexShrink: 0 }}>{dur}</span>
      <RowDot current={current} playing={playing} />
    </button>
  );
}

/** Square album tile (the mock's `.al`): cover, name, "year · N tracks". */
export function AlbumTile({ cover, title, meta, onClick, overlay, nameSlot }: {
  cover: string | null; title: string; meta: string; onClick?: () => void;
  overlay?: React.ReactNode; nameSlot?: React.ReactNode;
}) {
  // The whole tile is the button (cover + name + meta), except on the manage page where the
  // name is an inline editor (nameSlot) and only the cover is tappable.
  const whole = !!onClick && !nameSlot;
  const act = (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } };
  const btn = (on: boolean) => on ? { onClick, role: "button" as const, tabIndex: 0, onKeyDown: act } : {};
  return (
    <div {...btn(whole)} aria-label={whole ? title : undefined} style={{ minWidth: 0, cursor: whole ? "pointer" : undefined }}>
      <div {...btn(!!onClick && !whole)}
        style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface-2)", overflow: "hidden", cursor: onClick ? "pointer" : "default" }}>
        {cover
          ? <img src={feedImage(cover, 600)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <CoverPlaceholder title={title} />}
        {overlay}
      </div>
      {nameSlot ?? <div style={{ ...SKM, fontSize: 14, color: INK, marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>}
      <div style={{ ...SKR, fontSize: 12, color: MUTE, marginTop: 2 }}>{meta}</div>
    </div>
  );
}

export function CoverPlaceholder({ title }: { title: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...SKB, fontSize: 40, color: "rgb(var(--ink-rgb) / 0.14)", lineHeight: 1 }}>{(title.trim()[0] || "?").toUpperCase()}</span>
    </div>
  );
}

export const albumMeta = (year: number | null, count: number) =>
  [year ? String(year) : null, `${count} ${count === 1 ? "track" : "tracks"}`].filter(Boolean).join(" · ");

/** Round avatar (composer). */
export function Avatar({ url, size, alt = "" }: { url: string | null | undefined; size: number; alt?: string }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", background: "var(--surface-2)", flexShrink: 0, display: "block" }}>
      {url && <img src={feedImage(url, size > 64 ? 400 : 200)} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
    </span>
  );
}

/** Page header (the mock's `.hdr`): round back · centred TITLE · right slot. */
export function PageHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div style={{ height: 52, display: "grid", gridTemplateColumns: "60px 1fr 60px", alignItems: "center", padding: "0 16px" }}>
      <button type="button" onClick={onBack} aria-label="Back" style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${HAIR}`, background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", padding: 0, color: INK }}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3 5 8l5 5" /></svg>
      </button>
      <span style={{ ...SKB, textAlign: "center", fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", color: INK }}>{title}</span>
      <span style={{ ...SKB, textAlign: "right", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: INK }}>{right}</span>
    </div>
  );
}

/** Inline error line (never alert()). */
export function ErrLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p role="alert" style={{ ...SKR, fontSize: 12, color: INK, margin: "10px 0 0", borderLeft: `2px solid ${INK}`, paddingLeft: 8 }}>{msg}</p>;
}
