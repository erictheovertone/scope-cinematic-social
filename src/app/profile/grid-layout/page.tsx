"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { setUserGridLayout, getUserGridLayout } from "@/lib/gridLayoutService";
import { getUserByPrivyId, getProfile } from "@/lib/userService";
import { setSharedAspect, setMobileCount, type AspectId } from "@/lib/layoutModel";
import WelcomeTransition from "@/components/WelcomeTransition";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

const LAYOUTS = [
  { id: "pana-wide-2col", label: "2X ULTRA-PAN", ratio: 2.75, ratioLabel: "2.75:1", cols: 2, resolution: "4096x1551" },
  { id: "pana-wide",      label: "1X ULTRA-PAN", ratio: 2.75, ratioLabel: "2.75:1", cols: 1, resolution: "4096x1551" },
  { id: "scope-2col",     label: "2X SCOPE",     ratio: 2.39, ratioLabel: "2.39:1", cols: 2, resolution: "4096x1716" },
  { id: "scope",          label: "1X SCOPE",     ratio: 2.39, ratioLabel: "2.39:1", cols: 1, resolution: "4096x1716" },
  { id: "cine-wide-2col", label: "2X CINE WIDE", ratio: 1.85, ratioLabel: "1.85:1", cols: 2, resolution: "4096x2214" },
  { id: "cine-wide",      label: "1X CINE WIDE", ratio: 1.85, ratioLabel: "1.85:1", cols: 1, resolution: "4096x2214" },
  { id: "legacy",         label: "2X LEGACY",    ratio: 4/3,  ratioLabel: "4:3",    cols: 2, resolution: "1024x768"  },
  { id: "collage",        label: "COLLAGE",       ratio: 0,    ratioLabel: "mixed",  cols: 0, resolution: null        },
];

const names: Record<string, string> = {
  "pana-wide-2col": "2X ULTRA-PAN",
  "pana-wide":      "1X ULTRA-PAN",
  "scope-2col":     "2X SCOPE",
  "scope":          "1X SCOPE",
  "cine-wide-2col": "2X CINE WIDE",
  "cine-wide":      "1X CINE WIDE",
  "legacy":         "2X LEGACY",
  "collage":        "COLLAGE",
};

const ratios: Record<string, string> = {
  "pana-wide-2col": "2.75:1",
  "pana-wide":      "2.75:1",
  "scope-2col":     "2.39:1",
  "scope":          "2.39:1",
  "cine-wide-2col": "1.85:1",
  "cine-wide":      "1.85:1",
  "legacy":         "4:3",
  "collage":        "mixed",
};

function cellDimensions(layout: typeof LAYOUTS[0]): { width: number; height: number }[] {
  const INNER = 371;
  if (layout.id === "collage") return [];

  if (layout.cols === 2) {
    const w = (INNER - 1) / 2;
    const h = Math.round(w / layout.ratio);
    return [{ width: w, height: h }, { width: w, height: h }];
  }
  if (layout.cols === 1) {
    const w = INNER;
    const h = Math.round(w / layout.ratio);
    return [{ width: w, height: h }];
  }
  if (layout.cols === 3) {
    const w = Math.floor((INNER - 2) / 3);
    const h = Math.round(w / layout.ratio);
    return [{ width: w, height: h }, { width: w, height: h }, { width: w, height: h }];
  }
  return [];
}

const COLLAGE_CELLS = [
  { left: 0,   top: 0,  width: 112, height: 112 },
  { left: 0,   top: 57, width: 55,  height: 55  },
  { left: 57,  top: 57, width: 55,  height: 55  },
  { left: 114, top: 0,  width: 113, height: 55  },
  { left: 114, top: 57, width: 113, height: 55  },
  { left: 229, top: 0,  width: 140, height: 112 },
];

// ── Selection list cell overlay ───────────────────────────────────────────────

function CellOverlay({
  layout,
  selected,
  width,
  height,
  isFirst,
}: {
  layout: typeof LAYOUTS[0];
  selected: boolean;
  width: number;
  height: number;
  isFirst: boolean;
}) {
  const border = selected ? "1px solid #FF0000" : "1px solid #ffffff";
  const ratioLS = layout.ratioLabel === "4:3" ? "2.17px" : "1.33px";

  return (
    <div style={{ position: "relative", width, height, border, background: "transparent", flexShrink: 0, overflow: "visible" }}>
      {isFirst && (
        <>
          <span style={{
            position: "absolute", top: 5, left: 6,
            background: selected ? "#FF0000" : "#d9d9d9", height: 11, padding: "0 3px",
            display: "flex", alignItems: "center",
            fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-8)',
            color: selected ? "#ffffff" : "#000000", letterSpacing: "-0.16px", whiteSpace: "nowrap", lineHeight: 1, zIndex: 1,
          }}>
            {layout.label}
          </span>

          <div style={{ position: "absolute", top: 19, left: 6, display: "flex", alignItems: "center" }}>
            <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)', color: "#ffffff", letterSpacing: "-0.14px" }}>
              {"AR     "}
            </span>
            <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)', color: "#FF0000", letterSpacing: ratioLS, marginLeft: 4 }}>
              {layout.ratioLabel}
            </span>
          </div>

          {layout.resolution && (() => {
            const [lp, rp] = layout.resolution.split("x");
            const ts: React.CSSProperties = {
              fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)',
              color: "rgba(255,255,255,0.5)", letterSpacing: "22px", whiteSpace: "nowrap", lineHeight: 1,
            };
            return (
              <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 7, width: 371, display: "flex", alignItems: "center", overflow: "visible" }}>
                <span style={{ ...ts, flex: 1, textAlign: "right" }}>{lp}</span>
                <span style={{ ...ts, letterSpacing: 0 }}>·</span>
                <span style={{ ...ts, flex: 1, paddingLeft: "22px" }}>{rp}</span>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ── Selection list row ────────────────────────────────────────────────────────

function LayoutSection({
  layout,
  selected,
  onSelect,
}: {
  layout: typeof LAYOUTS[0];
  selected: boolean;
  onSelect: () => void;
}) {
  const cells = cellDimensions(layout);
  const border = selected ? "1px solid #FF0000" : "1px solid #ffffff";

  if (layout.id === "collage") {
    return (
      <div className="tappable" onClick={onSelect} style={{ paddingLeft: 2, cursor: "pointer" }}>
        <div style={{ position: "relative", width: 371, height: 112 }}>
          {COLLAGE_CELLS.map((cell, i) => (
            <div key={i} style={{ position: "absolute", left: cell.left, top: cell.top, width: cell.width, height: cell.height, border, background: "transparent" }}>
              {i === 0 && (
                <>
                  <span style={{ position: "absolute", top: 5, left: 6, background: selected ? "#FF0000" : "#d9d9d9", height: 11, padding: "0 3px", display: "flex", alignItems: "center", fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-8)', color: selected ? "#ffffff" : "#000000", letterSpacing: "-0.16px", whiteSpace: "nowrap", lineHeight: 1 }}>
                    {layout.label}
                  </span>
                  <div style={{ position: "absolute", top: 18, left: 6, display: "flex", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)', color: "#ffffff", letterSpacing: "-0.14px" }}>AR{"     "}</span>
                    <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)', color: "#FF0000", letterSpacing: "1.33px", marginLeft: 4 }}>mixed</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const containerHeight = cells[0]?.height ?? 0;
  const gap = 1;

  return (
    <div className="tappable" onClick={onSelect} style={{ paddingLeft: 2, cursor: "pointer" }}>
      <div style={{ display: "flex", gap, width: 371, height: containerHeight }}>
        {cells.map((cell, i) => (
          <CellOverlay key={i} layout={layout} selected={selected} width={cell.width} height={cell.height} isFirst={i === 0} />
        ))}
      </div>
    </div>
  );
}

// ── Confirmation screen ───────────────────────────────────────────────────────

function ConfirmationView({
  layout,
  onConfirm,
  onBack,
  saving,
}: {
  layout: typeof LAYOUTS[0];
  onConfirm: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const renderGrid = () => {
    if (layout.id === "collage") {
      return (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ border: "1px solid #FF0000", aspectRatio: "2.39/1", flexShrink: 0 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, flexShrink: 0 }}>
            <div style={{ border: "1px solid #FF0000", aspectRatio: "1/1" }} />
            <div style={{ border: "1px solid #FF0000", aspectRatio: "1/1" }} />
            <div style={{ border: "1px solid #FF0000", aspectRatio: "1/1" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, flexShrink: 0 }}>
            <div style={{ border: "1px solid #FF0000", aspectRatio: "16/9" }} />
            <div style={{ border: "1px solid #FF0000", aspectRatio: "16/9" }} />
          </div>
          <div style={{ border: "1px solid #FF0000", aspectRatio: "1.85/1", flexShrink: 0 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, flexShrink: 0 }}>
            <div style={{ border: "1px solid #FF0000", aspectRatio: "1/1" }} />
            <div style={{ border: "1px solid #FF0000", aspectRatio: "1/1" }} />
            <div style={{ border: "1px solid #FF0000", aspectRatio: "1/1" }} />
            <div style={{ border: "1px solid #FF0000", aspectRatio: "1/1" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1, flexShrink: 0 }}>
            <div style={{ border: "1px solid #FF0000", aspectRatio: "2.39/1" }} />
            <div style={{ border: "1px solid #FF0000", aspectRatio: "1/1" }} />
          </div>
        </div>
      );
    }

    if (layout.cols === 3) {
      return (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, alignContent: "start" }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} style={{ border: "1px solid #FF0000", aspectRatio: "4/3" }} />
          ))}
        </div>
      );
    }

    if (layout.cols === 2) {
      return (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, alignContent: "start" }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} style={{ border: "1px solid #FF0000", aspectRatio: `${layout.ratio}/1` }} />
          ))}
        </div>
      );
    }

    // 1x layouts — aspect-ratio cells stack from top; overflow clips extras
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1, alignItems: "stretch", justifyContent: "flex-start" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ border: "1px solid #FF0000", width: "100%", aspectRatio: `${layout.ratio}/1`, flexShrink: 0 }} />
        ))}
      </div>
    );
  };

  return (
    <div style={{ background: "#000", position: "fixed", inset: 0, zIndex: 50, overflow: "hidden" }}>
      {renderGrid()}

      {/* Header — floats over grid */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        background: "rgba(0,0,0,0.6)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 8px 10px",
      }}>
        <span style={{ ...SKB, background: "#d9d9d9", padding: "2px 6px", fontSize: 'var(--fs-9)', color: "#000", letterSpacing: "-0.16px" }}>
          {layout.label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#fff" }}>AR</span>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#FF0000" }}>{layout.ratioLabel}</span>
        </div>
      </div>

      {/* Bottom actions */}
      <div style={{
        position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "row", gap: 12, zIndex: 10,
        background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
        padding: "24px 32px 0",
      }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", padding: "8px 20px" }}
        >
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.1em" }}>BACK</span>
        </button>
        <button
          onClick={onConfirm}
          disabled={saving}
          style={{ background: saving ? "rgba(255,0,0,0.4)" : "#FF0000", border: "none", cursor: saving ? "default" : "pointer", padding: "8px 24px" }}
        >
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {saving ? "SAVING..." : "CONFIRM"}
          </span>
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GridLayoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewUser = searchParams?.get('from') === 'setup';
  const { user } = usePrivy();
  const [selectedLayout, setSelectedLayout] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [animatingLayout, setAnimatingLayout] = useState<typeof LAYOUTS[0] | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Normalize legacy prefixed IDs to canonical form
    const LEGACY_MAP: Record<string, string> = {
      '2x-pana': 'pana-wide-2col', '1x-pana': 'pana-wide',
      '2x-scope': 'scope-2col',    '1x-scope': 'scope',
      '2x-cine': 'cine-wide-2col', '1x-cine': 'cine-wide',
      '3x-legacy': 'legacy',
    };

    const pref = getUserGridLayout(user.id);
    if (pref) {
      const canonical = LEGACY_MAP[pref.layoutId] ?? pref.layoutId;
      setSelectedLayout(canonical);
    }

    getUserByPrivyId(user.id).then(async (dbUser) => {
      if (!dbUser) return;
      const profile = await getProfile(dbUser.id);
      if (profile?.username) setUsername(profile.username.toUpperCase());
      // Also seed selectedLayout from DB (source of truth over localStorage)
      if (profile?.grid_layout) {
        const canonical = LEGACY_MAP[profile.grid_layout] ?? profile.grid_layout;
        setSelectedLayout(canonical);
      }
    });
  }, [user?.id]);

  const handleConfirm = async () => {
    if (!selectedLayout || !user?.id || saving) return;
    setSaving(true);
    try {
      await setUserGridLayout(user.id, selectedLayout, names[selectedLayout], ratios[selectedLayout]);
      // NEW MODEL (dual-write): the AR selection writes the SHARED aspect; the
      // count writes the MOBILE count (explicit → no longer derives). Legacy
      // grid_layout stays for the mobile readers not yet migrated (PostItem,
      // decks, create). This is what mirrors the AR choice to desktop.
      const dbUser = await getUserByPrivyId(user.id);
      if (dbUser) {
        const aspect: AspectId = selectedLayout === 'collage' ? 'collage'
          : selectedLayout.startsWith('pana') ? 'pana-wide'
          : selectedLayout.startsWith('cine') ? 'cine-wide'
          : selectedLayout.startsWith('legacy') ? 'legacy' : 'scope';
        const cols = LAYOUTS.find((l) => l.id === selectedLayout)?.cols ?? 1;
        await setSharedAspect(dbUser.id, aspect);
        await setMobileCount(dbUser.id, selectedLayout === 'collage' ? 2 : cols);
      }
      setShowTransition(true);
    } finally {
      setSaving(false);
    }
  };

  // WelcomeTransition plays here — eliminates flash of profile page
  if (showTransition) {
    return <WelcomeTransition onComplete={() => router.push(isNewUser ? "/profile?new=1" : "/profile")} />;
  }

  // Confirmation screen — shows selected layout as red-bordered grid
  if (confirming && selectedLayout) {
    const layout = LAYOUTS.find(l => l.id === selectedLayout)!;
    return (
      <ConfirmationView
        layout={layout}
        onConfirm={handleConfirm}
        onBack={() => setConfirming(false)}
        saving={saving}
      />
    );
  }

  // Derive animation type from layout data
  const animType = animatingLayout
    ? animatingLayout.id === "collage" ? "collage"
      : animatingLayout.cols === 1 ? "single"
      : animatingLayout.cols === 3 ? "grid3col"
      : "grid2col"
    : null;

  // Layout selection list
  return (
    <>
      <div className="screen-min" style={{ background: "#000000", width: 375, minHeight: "100dvh", margin: "0 auto", position: "relative", overflowX: "hidden", paddingBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, paddingBottom: 10, paddingLeft: 5, paddingRight: 5 }}>
          <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-12)', color: "#ffffff", letterSpacing: "-0.24px" }}>
            WELCOME {username}
          </span>
          <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-12)', color: "#ffffff", letterSpacing: "-0.24px" }}>
            CHOOSE YOUR GRID LAYOUT
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
          {LAYOUTS.map((layout) => (
            <LayoutSection
              key={layout.id}
              layout={layout}
              selected={selectedLayout === layout.id}
              onSelect={() => {
                setAnimatingLayout(layout);
                setAnimating(true);
                setTimeout(() => {
                  setAnimating(false);
                  setSelectedLayout(layout.id);
                  setConfirming(true);
                }, 600);
              }}
            />
          ))}
        </div>
      </div>

      {/* Transition overlay — plays between selection and confirmation */}
      {animating && animatingLayout && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          backgroundColor: "#000", overflow: "hidden",
          animation: "fadeInBlack 0.3s ease forwards",
        }}>
          {/* Grid fills full screen */}
          {animType === "single" && (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1, alignItems: "stretch", justifyContent: "flex-start" }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{
                  border: "1px solid #FF0000",
                  width: "100%",
                  aspectRatio: `${animatingLayout!.ratio}/1`,
                  flexShrink: 0,
                  animation: `drawIn 0.3s ease ${0.1 + i * 0.08}s both`,
                  opacity: 0,
                  transform: "scaleX(0)",
                  transformOrigin: "left center",
                }} />
              ))}
            </div>
          )}
          {animType === "grid2col" && (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, alignContent: "start" }}>
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} style={{
                  border: "1px solid #FF0000",
                  aspectRatio: `${animatingLayout!.ratio}/1`,
                  animation: `drawIn 0.25s ease ${0.05 + i * 0.025}s both`,
                  opacity: 0,
                  transform: "scaleX(0)",
                  transformOrigin: "left center",
                }} />
              ))}
            </div>
          )}
          {animType === "grid3col" && (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, alignContent: "start" }}>
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} style={{
                  border: "1px solid #FF0000",
                  aspectRatio: "4/3",
                  animation: `drawIn 0.25s ease ${0.05 + i * 0.02}s both`,
                  opacity: 0,
                  transform: "scale(0)",
                  transformOrigin: "center",
                }} />
              ))}
            </div>
          )}
          {animType === "collage" && (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ border: "1px solid #FF0000", aspectRatio: "2.39/1", flexShrink: 0, animation: "scatterInA 0.35s cubic-bezier(0.16,1,0.3,1) 0.05s both", opacity: 0 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, flexShrink: 0 }}>
                {["scatterInB", "scatterInC", "scatterInD"].map((anim, i) => (
                  <div key={i} style={{ border: "1px solid #FF0000", aspectRatio: "1/1", animation: `${anim} 0.3s cubic-bezier(0.16,1,0.3,1) ${0.12 + i * 0.05}s both`, opacity: 0 }} />
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, flexShrink: 0 }}>
                {["scatterInA", "scatterInB"].map((anim, i) => (
                  <div key={i} style={{ border: "1px solid #FF0000", aspectRatio: "16/9", animation: `${anim} 0.3s cubic-bezier(0.16,1,0.3,1) ${0.27 + i * 0.05}s both`, opacity: 0 }} />
                ))}
              </div>
              <div style={{ border: "1px solid #FF0000", aspectRatio: "1.85/1", flexShrink: 0, animation: "scatterInC 0.35s cubic-bezier(0.16,1,0.3,1) 0.37s both", opacity: 0 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, flexShrink: 0 }}>
                {["scatterInD", "scatterInA", "scatterInB", "scatterInC"].map((anim, i) => (
                  <div key={i} style={{ border: "1px solid #FF0000", aspectRatio: "1/1", animation: `${anim} 0.25s cubic-bezier(0.16,1,0.3,1) ${0.42 + i * 0.04}s both`, opacity: 0 }} />
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1, flexShrink: 0 }}>
                <div style={{ border: "1px solid #FF0000", aspectRatio: "2.39/1", animation: "scatterInD 0.3s cubic-bezier(0.16,1,0.3,1) 0.58s both", opacity: 0 }} />
                <div style={{ border: "1px solid #FF0000", aspectRatio: "1/1", animation: "scatterInA 0.3s cubic-bezier(0.16,1,0.3,1) 0.62s both", opacity: 0 }} />
              </div>
            </div>
          )}

          {/* AR label — floats over grid */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 12px 10px",
            animation: "slideDown 0.4s cubic-bezier(0.16,1,0.3,1) 0.15s both",
            opacity: 0,
          }}>
            <div style={{ backgroundColor: "white", padding: "6px 14px" }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "#000", textTransform: "uppercase" }}>
                {animatingLayout.label}
              </span>
            </div>
            {animatingLayout.id !== "collage" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-16)', color: "white" }}>AR</span>
                <span style={{ ...SKB, fontSize: 'var(--fs-16)', color: "#FF0000" }}>{animatingLayout.ratioLabel}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
