// ── DownloadAction — the ONE Download button (Brief AUG-1 §3) ────────────────────────────────────
// VISIBLE TO EVERYONE. The tap goes through useDownload(), which asks the server: signed out →
// login, not Augmented → the Augmented upsell sheet, member → the file downloads. The client never
// gates on its own idea of the tier. Busy + error render inline (never alert()); every MUSIC
// download surfaces the sync license note (it links /legal/sync-license).
//
// `variant` matches the host action row's existing icon metrics so the button reads as one of
// its siblings:
//   mobile  — ProfilePostViewer row (16.7px, ink 100 @ 0.7, stroke 1.8)
//   modal   — PostModal like/comment row (18.7px, ink @ 0.6, stroke 2)
//   desktop — DesktopPostView under-stage row (18px, ink @ 0.85, stroke 2)
//   theatre — TheatreMode data bar (20.5px, ink @ 0.85, ≥44px target)
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDownload, type DownloadKind } from "@/lib/useDownload";

type Variant = "mobile" | "modal" | "desktop" | "theatre";

const METRICS: Record<Variant, { size: number; color: string; stroke: number; target?: number }> = {
  mobile: { size: 16.7, color: "rgb(var(--ink-rgb) / 0.7)", stroke: 1.8 },
  modal: { size: 18.7, color: "rgb(var(--ink-rgb) / 0.6)", stroke: 2 },
  desktop: { size: 18, color: "rgb(var(--ink-rgb) / 0.85)", stroke: 2 },
  theatre: { size: 20.5, color: "rgb(var(--ink-rgb) / 0.85)", stroke: 2, target: 44 },
};

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

type Props = {
  kind: DownloadKind;
  id: string;
  variant?: Variant;
  /** Override the variant's icon size. */
  size?: number;
  /** Optional text label beside the icon (e.g. "DOWNLOAD"). */
  label?: string;
  /** Where the inline note (busy error / license) floats relative to the button. */
  notePlacement?: "below" | "above";
  /** Which edge of the button the note anchors to (keeps it inside the row's column). */
  noteAlign?: "left" | "right";
  style?: React.CSSProperties;
};

export default function DownloadAction({ kind, id, variant = "mobile", size, label, notePlacement = "below", noteAlign = "left", style }: Props) {
  const { download, busy, error } = useDownload();
  const m = METRICS[variant];
  const iconSize = size ?? m.size;
  const [note, setNote] = useState<"license" | "error" | null>(null);

  // Errors surface inline from the hook; both notes fade on their own.
  useEffect(() => { if (error) setNote("error"); }, [error]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), note === "license" ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [note]);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // hosts (theatre stage, viewers) treat bare taps as navigation
    if (busy || !id) return;
    setNote(null);
    const r = await download(kind, id);
    if (r === "ok" && kind === "track") setNote("license");
  };

  const noteStyle: React.CSSProperties = {
    position: "absolute",
    [notePlacement === "below" ? "top" : "bottom"]: "calc(100% + 6px)",
    [noteAlign]: 0,
    zIndex: 6,
    whiteSpace: "nowrap",
    background: "var(--canvas)",
    border: "1px solid rgb(var(--ink-rgb) / 0.18)",
    padding: "5px 8px",
    ...SKB,
    fontSize: 9,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "rgb(var(--ink-rgb) / 0.75)",
    lineHeight: 1.3,
  };

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", ...style }}>
      <button
        type="button"
        data-testid="download-action"
        onClick={onClick}
        disabled={busy}
        aria-label={kind === "track" ? "Download track" : "Download"}
        aria-busy={busy || undefined}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
          background: "transparent", border: "none", padding: 0,
          cursor: busy ? "progress" : "pointer",
          color: m.color,
          minWidth: m.target, minHeight: m.target,
          opacity: busy ? 0.4 : 1,
          transition: "opacity 160ms ease",
        }}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={m.stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3.5v11.5" />
          <path d="M7 10.5l5 5 5-5" />
          <path d="M4.5 20.5h15" />
        </svg>
        {label && (
          <span style={{ ...SKB, fontSize: variant === "desktop" ? 12 : "var(--fs-8)", color: "inherit", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {busy ? "…" : label}
          </span>
        )}
      </button>

      {note === "error" && error && (
        <span role="alert" style={noteStyle}>{error}</span>
      )}
      {note === "license" && (
        <span role="status" style={noteStyle} onClick={(e) => e.stopPropagation()}>
          Licensed for your social + YouTube ·{" "}
          <Link href="/legal/sync-license" style={{ color: "var(--ink-100)", textDecoration: "underline", textUnderlineOffset: 2 }}>Sync license</Link>
        </span>
      )}
    </span>
  );
}
