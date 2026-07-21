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

  // Measure the composition → the SQUARE PFP side (= text-column height, Brief
  // 2.2d) and report the total header height to the page.
  const headerRef = useRef<HTMLDivElement>(null);
  const textColRef = useRef<HTMLDivElement>(null);
  const [pfpSize, setPfpSize] = useState(86);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => {
      onMeasure?.(el.offsetHeight);
      if (textColRef.current) setPfpSize(textColRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (textColRef.current) ro.observe(textColRef.current);
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

      {/* PFP + text column (flow flex, top-aligned). PFP is SQUARE by construction
          — one driving value (pfpSize = text-column height) as BOTH w & h; its
          bottom lands on the divider. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "7px 0 0 8px" }}>
        <div style={{ width: pfpSize, height: pfpSize, flexShrink: 0, border: "1px solid var(--avatar-frame)", boxSizing: "border-box", overflow: "hidden" }}>
          {profileImage ? (
            <img src={feedImage(profileImage, 172)} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", backgroundColor: "#222" }} />
          )}
        </div>

        <div ref={textColRef} style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
          {/* name+handle+stats — shrinks to the RENDERED NAME WIDTH; that outer edge
              is the shared alignment line (handle right end · values right edge). */}
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", alignSelf: "flex-start", position: "relative", maxWidth: "100%" }}>
            {/* name row — first · gap · last ONLY (PRO excluded). Full render, no
                ellipsis; nameSize steps 19→14 to fit. */}
            <div ref={nameRowRef} style={{ display: "flex", alignItems: "baseline", whiteSpace: "nowrap" }}>
              <span className="soften-ui" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: nameSize, letterSpacing: "var(--track-display)", color: "var(--ink-100)", textTransform: "uppercase", flexShrink: 0 }}>{firstName}</span>
              {lastName && (
                <>
                  <span aria-hidden style={{ flexShrink: 0, width: "min(2.5vw, 10px)" }} />
                  <span className="soften-ui" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: nameSize, letterSpacing: "var(--track-display)", color: "var(--ink-100)", textTransform: "uppercase", flexShrink: 0 }}>{lastName}</span>
                </>
              )}
            </div>
            {/* PRO — INDEPENDENT chip, absolute just beyond the name's last letter.
                ONLY for pro members; never in the name flex or its width. */}
            {isPaidMember && (
              <span style={{ position: "absolute", left: "100%", top: 1, marginLeft: 5, whiteSpace: "nowrap", fontFamily: "var(--font-black)", fontWeight: 900, fontSize: 4.85, color: "rgba(229,225,219,0.64)", letterSpacing: "var(--track-wide)" }}>PRO</span>
            )}
            {/* handle — right-aligned to the name's last letter; tight + smaller */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 3, opacity: 0.64, marginTop: 2 }}>
              <span style={{ fontFamily: "var(--font-light)", fontWeight: 400, fontSize: 8, color: "var(--ink-100)", letterSpacing: "var(--track-wide)", flexShrink: 0 }}>[ at ]</span>
              <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 10.5, color: "var(--ink-100)", textTransform: "uppercase", letterSpacing: "var(--track-body)", whiteSpace: "nowrap" }}>{username}</span>
            </div>
            {/* stats — labels left · values flush-right to the name's right edge */}
            <div style={{ marginTop: 12 }}>
              {([
                { label: "Followers", value: analytics.followers.toLocaleString(), gap: false },
                { label: "Collectors", value: analytics.collectors.toLocaleString(), gap: false },
                { label: "Market Cap", value: analytics.portfolioMc > 0 ? `$${analytics.portfolioMc.toLocaleString()}` : "—", gap: true },
              ] as const).map((row) => (
                <div key={row.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, marginTop: row.gap ? 6 : 2 }}>
                  <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 11.2, color: "rgba(229,225,219,0.71)", letterSpacing: "var(--track-body)", whiteSpace: "nowrap" }}>{row.label}</span>
                  <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 11.5, color: "rgba(229,225,219,0.71)", letterSpacing: "var(--track-body)", whiteSpace: "nowrap", textAlign: "right" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Divider — in flow after the stats; spans the text column to the right
              margin. PFP bottom lands here. */}
          <div style={{ height: 1, background: "var(--hairline)", margin: "8px 0 0" }} />
        </div>
      </div>
    </div>
  );
}
