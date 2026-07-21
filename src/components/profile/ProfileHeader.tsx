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

import { useRef, useState, useLayoutEffect } from "react";
import BadgeCluster from "@/components/BadgeCluster";
import { feedImage } from "@/lib/mediaUrl";

export interface ProfileHeaderAnalytics {
  followers: number;
  collectors: number;
  portfolioMc: number;
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
}: {
  displayName: string;
  username: string;
  profileImage?: string | null;
  isPaidMember: boolean;
  analytics: ProfileHeaderAnalytics;
  badges: ProfileHeaderBadge[];
  onOpenBadges: () => void;
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

  return (
    <div ref={headerRef} style={{ position: "relative", paddingBottom: 8 }}>
      {/* Badge cluster — top-right, under the controls row (absolute overlay,
          shorter than the stats column → doesn't drive height). */}
      <div style={{ position: "absolute", right: 12, top: 41, zIndex: 3 }}>
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
              <span className="soften-ui" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: nameSize, letterSpacing: "var(--track-display)", color: "var(--ink-100)", textTransform: "uppercase", flexShrink: 0, lineHeight: 1 }}>{firstName}</span>
              {lastName && (
                <>
                  <span aria-hidden style={{ flexShrink: 0, width: "min(2.5vw, 10px)" }} />
                  <span className="soften-ui" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: nameSize, letterSpacing: "var(--track-display)", color: "var(--ink-100)", textTransform: "uppercase", flexShrink: 0, lineHeight: 1 }}>{lastName}</span>
                </>
              )}
            </div>
            {/* PRO — INDEPENDENT chip, absolute just beyond the name's last letter.
                ONLY for pro members; never in the name flex or its width. */}
            {isPaidMember && (
              <span style={{ position: "absolute", left: "100%", top: 1, marginLeft: 5, whiteSpace: "nowrap", fontFamily: "var(--font-black)", fontWeight: 900, fontSize: 4.85, color: "rgba(229,225,219,0.64)", letterSpacing: "var(--track-wide)" }}>PRO</span>
            )}
            {/* handle — right-aligned to the name's last letter; tight + smaller */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 3, opacity: 0.64, marginTop: 1 }}>
              <span style={{ fontFamily: "var(--font-light)", fontWeight: 400, fontSize: 8, color: "var(--ink-100)", letterSpacing: "var(--track-wide)", flexShrink: 0 }}>[ at ]</span>
              <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 10.5, color: "var(--ink-100)", textTransform: "uppercase", letterSpacing: "var(--track-body)", whiteSpace: "nowrap" }}>{username}</span>
            </div>
            {/* stats — labels left · values flush-right to the name's right edge.
                Brief W4: tighter vertical rhythm per frame (rows ~y49/57/73, divider ~y88):
                lineHeight 1 + compressed row margins; Market Cap keeps its small gap. */}
            <div style={{ marginTop: 9 }}>
              {([
                { label: "Followers", value: analytics.followers.toLocaleString(), gap: false },
                { label: "Collectors", value: analytics.collectors.toLocaleString(), gap: false },
                { label: "Market Cap", value: analytics.portfolioMc > 0 ? `$${analytics.portfolioMc.toLocaleString()}` : "—", gap: true },
              ] as const).map((row) => (
                <div key={row.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, marginTop: row.gap ? 4 : 0 }}>
                  <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 11.2, color: "rgba(229,225,219,0.71)", letterSpacing: "var(--track-body)", whiteSpace: "nowrap", lineHeight: 1 }}>{row.label}</span>
                  <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 11.5, color: "rgba(229,225,219,0.71)", letterSpacing: "var(--track-body)", whiteSpace: "nowrap", textAlign: "right", lineHeight: 1 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Divider — in flow after the stats; Brief W4: spans the text column to the
              RIGHT MARGIN (frame x81→375, ~y88). PFP no longer lands on it (decoupled). */}
          <div style={{ height: 1, background: "var(--hairline)", margin: "7px 0 0" }} />
        </div>
      </div>
    </div>
  );
}
