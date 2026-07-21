"use client";

// ── ProfileHeader — the SHARED mobile profile header composition ─────────────
//
// Brief F6: extracted from the own-profile 2.2d header so the public profile
// (the second mobile twin) stops drifting. This owns ONLY the measured content
// composition — square-by-construction PFP, name step-down (19→14, never
// truncates), independent PRO chip, tight handle, stats block (values flush-right
// to the name edge, Market Cap above the divider, dash rule), and the badge
// cluster. Each page keeps its OWN outer wrapper (opacity/safe-area/zIndex) and
// its OWN snap/tab machinery — this reports its measured height via `onMeasure`
// so the page's grid spacer + tab anchor follow. The right-side chrome differs by
// page (BIO on own; ⓘ + mail + FOLLOW on public), injected via `controls`.

import { useRef, useState, useLayoutEffect, useEffect } from "react";
import BadgeCluster from "@/components/BadgeCluster";
import { feedImage } from "@/lib/mediaUrl";

export interface ProfileHeaderAnalytics {
  followers: number;
  collectors: number;
  portfolioMc: number;
  /** Brief W10 — the EXPANDED (bio-sheet) stat groups. Read only when `expanded`. */
  following?: number;
  totalPosts?: number;
  decks?: number;
}
export interface ProfileHeaderBadge {
  key: string;
  src: string;
  title: string;
}

export default function ProfileHeader({
  displayName,
  username,
  profileImage,
  isPaidMember,
  analytics,
  badges,
  onOpenBadges,
  controls,
  onMeasure,
  expanded = false,
}: {
  displayName: string;
  username: string;
  profileImage?: string | null;
  isPaidMember: boolean;
  analytics: ProfileHeaderAnalytics;
  badges: ProfileHeaderBadge[];
  onOpenBadges: () => void;
  /** Brief W10 — when the bio sheet is open the LIVE header expands its stats from the
   *  3 base rows to THREE COLUMN GROUPS in place (Followers/Collectors/MC · Following/
   *  Total Posts · Decks). The added columns slide/fade in. Both profiles inherit. */
  expanded?: boolean;
  /** Right-side chrome slot — differs by page (BIO / ⓘ+mail+follow). Absolutely
   *  positioned within the measured content (this root is position:relative). */
  controls?: React.ReactNode;
  /** Reports the measured header height (excl. the page's safe-area padding) so
   *  the consuming page's tab anchor + grid spacer track content. Pass a stable
   *  setter (e.g. setHeaderH) — it's an effect dep. */
  onMeasure?: (headerH: number) => void;
}) {
  // Name split + step-down (Brief 2.2b — NAME NEVER TRUNCATES; 19→14px floor,
  // measured from the rendered name-row width). PRO is excluded from the split so
  // it never affects the name's right edge / alignment math.
  const nameParts = (displayName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");
  const nameRowRef = useRef<HTMLDivElement>(null);
  const [nameSize, setNameSize] = useState(19);
  useLayoutEffect(() => { setNameSize(19); }, [firstName, lastName, isPaidMember]);
  useLayoutEffect(() => {
    const row = nameRowRef.current;
    if (!row) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 375;
    const avail = Math.min(vw, 480) - 145; // name left ~100 + right reserve to the controls zone
    if (row.scrollWidth > avail && nameSize > 14) setNameSize((s) => Math.max(14, s - 1));
  }, [nameSize, firstName, lastName, isPaidMember]);

  // Brief W4 (revised frame 36:3) — the PFP is now a FIXED 65px square, DECOUPLED
  // from the divider (bottom ~y70 sits above the stats hairline ~y88). The old
  // "pfpSize = text-column height" coupling is DEAD. This effect only reports the
  // measured header height → the page's tab anchor + grid spacer (which re-derive
  // to the shorter header automatically).
  const headerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => onMeasure?.(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasure]);

  // Brief W10 — slide/fade the ADDED stat columns (groups 2·3) in when `expanded` flips
  // true; reverse when it goes false. Reduced-motion → instant.
  const reducedRef = useRef(false);
  const [expandAnim, setExpandAnim] = useState(false);
  useEffect(() => {
    reducedRef.current = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!expanded || reducedRef.current) { setExpandAnim(expanded); return; }
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setExpandAnim(true)));
    return () => cancelAnimationFrame(r);
  }, [expanded]);

  // The three EXPANDED stat groups (frame 141:733). Programs is omitted — no such field
  // exists on the profile (flagged); the group is Decks only.
  const statGroups: { label: string; value: string; w: number }[][] = [
    [
      { label: "Followers", value: analytics.followers.toLocaleString(), w: 92 },
      { label: "Collectors", value: analytics.collectors.toLocaleString(), w: 92 },
      { label: "Market Cap", value: analytics.portfolioMc > 0 ? `$${analytics.portfolioMc.toLocaleString()}` : "—", w: 92 },
    ],
    [
      { label: "Following", value: (analytics.following ?? 0).toLocaleString(), w: 82 },
      { label: "Total Posts", value: (analytics.totalPosts ?? 0).toLocaleString(), w: 82 },
    ],
    [
      { label: "Decks", value: (analytics.decks ?? 0).toLocaleString(), w: 52 },
    ],
  ];

  return (
    <div ref={headerRef} style={{ position: "relative", paddingBottom: 8 }}>
      {/* Badge cluster — top-right, under the controls row (absolute overlay,
          shorter than the stats column → doesn't drive height). Brief W10 — fades out
          when expanded (bio sheet open): the expanded group 3 (Decks) occupies the same
          right zone, and the badges render in the sheet's own Badges section instead. */}
      <div style={{ position: "absolute", right: 12, top: 41, zIndex: 3, opacity: expanded ? 0 : 1, pointerEvents: expanded ? "none" : "auto", transition: "opacity 200ms ease" }}>
        <BadgeCluster badges={badges} onOpen={onOpenBadges} />
      </div>

      {/* Right-side chrome slot (BIO on own; ⓘ + mail + FOLLOW on public). */}
      {controls}

      {/* PFP + text column (flow flex, top-aligned). Brief W4 — PFP is a FIXED 65×65
          square (frame 36:3), NOT derived from the text-column height; its bottom sits
          above the divider. Text column starts at PFP-right + ~7px gap (≈ x79). */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "4px 0 0 8px" }}>
        <div style={{ width: 65, height: 65, flexShrink: 0, border: "1px solid var(--avatar-frame)", boxSizing: "border-box", overflow: "hidden" }}>
          {profileImage ? (
            <img src={feedImage(profileImage, 172)} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", backgroundColor: "#222" }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>{/* Brief W4 — no paddingRight: the divider below runs to the RIGHT MARGIN (frame x81→375). */}
          {/* name+handle+stats — shrinks to the RENDERED NAME WIDTH; that outer edge
              is the shared alignment line (handle right end · values right edge). */}
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", alignSelf: "flex-start", position: "relative", maxWidth: "100%" }}>
            {/* name row — first · gap · last ONLY (PRO excluded). Full render, no
                ellipsis; nameSize steps 19→14 to fit. */}
            <div ref={nameRowRef} style={{ display: "flex", alignItems: "baseline", whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: nameSize, letterSpacing: "var(--track-display)", color: "var(--ink-100)", textTransform: "uppercase", flexShrink: 0, lineHeight: 1 }}>{firstName}</span>
              {lastName && (
                <>
                  <span aria-hidden style={{ flexShrink: 0, width: "min(2.5vw, 10px)" }} />
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: nameSize, letterSpacing: "var(--track-display)", color: "var(--ink-100)", textTransform: "uppercase", flexShrink: 0, lineHeight: 1 }}>{lastName}</span>
                </>
              )}
            </div>
            {/* PRO — INDEPENDENT chip, absolute just beyond the name's last letter.
                ONLY for pro members; never in the name flex or its width. */}
            {isPaidMember && (
              <span style={{ position: "absolute", left: "100%", top: 1, marginLeft: 5, whiteSpace: "nowrap", fontFamily: "var(--font-black)", fontWeight: 900, fontSize: 4.85, color: "rgba(229,225,219,0.64)", letterSpacing: "var(--track-wide)" }}>PRO</span>
            )}
            {/* handle — right-aligned to the name's last letter; tight + smaller */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 3, opacity: 0.51, marginTop: 1 }}>{/* Brief W5 §2 — handle unit 0.64 → 0.51 (×0.8) */}
              <span style={{ fontFamily: "var(--font-light)", fontWeight: 400, fontSize: 8, color: "var(--ink-100)", letterSpacing: "var(--track-wide)", flexShrink: 0 }}>[ at ]</span>
              <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 10.5, color: "var(--ink-100)", textTransform: "uppercase", letterSpacing: "var(--track-body)", whiteSpace: "nowrap" }}>{username}</span>
            </div>
            {/* stats — labels left · values flush-right to the name's right edge.
                Brief W4: tighter vertical rhythm per frame (rows ~y49/57/73, divider ~y88):
                lineHeight 1 + compressed row margins; Market Cap keeps its small gap.
                Brief W5 §1: +12px breathing room ABOVE the block (9 → 21); row pitch,
                divider, and everything below (via measured headerH) shift down 12px. */}
            {/* COLLAPSED (base) stats — 3 rows, values flush-right to the name edge. */}
            {!expanded && (
            <div style={{ marginTop: 21 }}>
              {([
                { label: "Followers", value: analytics.followers.toLocaleString(), gap: false },
                { label: "Collectors", value: analytics.collectors.toLocaleString(), gap: false },
                { label: "Market Cap", value: analytics.portfolioMc > 0 ? `$${analytics.portfolioMc.toLocaleString()}` : "—", gap: true },
              ] as const).map((row) => (
                <div key={row.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, marginTop: row.gap ? 4 : 0 }}>
                  <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 11.2, color: "rgba(229,225,219,0.57)", letterSpacing: "var(--track-body)", whiteSpace: "nowrap", lineHeight: 1 }}>{row.label}</span>
                  <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 11.5, color: "rgba(229,225,219,0.57)", letterSpacing: "var(--track-body)", whiteSpace: "nowrap", textAlign: "right", lineHeight: 1 }}>{row.value}</span>
                </div>
              ))}
            </div>
            )}
          </div>{/* end name+handle inline-flex column */}
          {/* Brief W10 — EXPANDED stats: THREE COLUMN GROUPS (frame 141:733) replacing the
              base 3 rows while the bio sheet is open. Group 1 (Followers/Collectors/Market
              Cap) + group 2 (Following/Total Posts) + group 3 (Decks) side-by-side with
              vertical hairline separators; groups 2·3 slide/fade in. Spans the text column
              (below name/handle) so it never disturbs the collapsed layout. */}
          {expanded && (
            <div style={{ display: "flex", alignItems: "stretch", marginTop: 14, paddingRight: 8 }}>
              {statGroups.map((group, gi) => (
                <div key={gi} style={{ display: "flex", alignItems: "stretch", ...(gi > 0 ? {
                  opacity: expandAnim ? 1 : 0,
                  transform: expandAnim ? "translateX(0)" : "translateX(-8px)",
                  transition: reducedRef.current ? "none" : `opacity 200ms ease ${(gi - 1) * 60}ms, transform 200ms ease ${(gi - 1) * 60}ms`,
                } : {}) }}>
                  {gi > 0 && <div style={{ width: 1, background: "var(--hairline)", margin: "0 10px", alignSelf: "stretch" }} />}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.map((row) => (
                      <div key={row.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, width: row.w }}>
                        <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 11.2, color: "rgba(229,225,219,0.57)", letterSpacing: "var(--track-body)", whiteSpace: "nowrap", lineHeight: 1 }}>{row.label}</span>
                        <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 11.5, color: "rgba(229,225,219,0.57)", letterSpacing: "var(--track-body)", whiteSpace: "nowrap", textAlign: "right", lineHeight: 1 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Divider — in flow after the stats; Brief W4: spans the text column to the
              RIGHT MARGIN (frame x81→375, ~y88). PFP no longer lands on it (decoupled). */}
          <div style={{ height: 1, background: "var(--hairline)", margin: "7px 0 0" }} />
        </div>
      </div>
    </div>
  );
}
