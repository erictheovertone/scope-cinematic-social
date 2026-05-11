"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { setUserGridLayout, getUserGridLayout } from "@/lib/gridLayoutService";
import { getUserByPrivyId, getProfile } from "@/lib/userService";

const LAYOUTS = [
  { id: "2x-pana",   label: "2X ULTRA-PAN", ratio: 2.75, ratioLabel: "2.75:1", cols: 2, resolution: "4096x1551" },
  { id: "1x-pana",   label: "1X ULTRA-PAN", ratio: 2.75, ratioLabel: "2.75:1", cols: 1, resolution: "4096x1551" },
  { id: "2x-scope",  label: "2X SCOPE",     ratio: 2.39, ratioLabel: "2.39:1", cols: 2, resolution: "4096x1716" },
  { id: "1x-scope",  label: "1X SCOPE",     ratio: 2.39, ratioLabel: "2.39:1", cols: 1, resolution: "4096x1716" },
  { id: "2x-cine",   label: "2X CINE WIDE", ratio: 1.85, ratioLabel: "1.85:1", cols: 2, resolution: "4096x2214" },
  { id: "1x-cine",   label: "1X CINE WIDE", ratio: 1.85, ratioLabel: "1.85:1", cols: 1, resolution: "4096x2214" },
  { id: "3x-legacy", label: "3X LEGACY",    ratio: 4/3,  ratioLabel: "4:3",    cols: 3, resolution: "1024x768"  },
  { id: "collage",   label: "COLLAGE",       ratio: 0,    ratioLabel: "mixed",  cols: 0, resolution: null         },
];

const names: Record<string, string> = {
  "2x-pana":   "PANA WIDE 2x",
  "1x-pana":   "PANA WIDE 1x",
  "2x-scope":  "SCOPE 2x",
  "1x-scope":  "SCOPE 1x",
  "2x-cine":   "CINE WIDE 2x",
  "1x-cine":   "CINE WIDE 1x",
  "3x-legacy": "LEGACY 3x",
  "collage":   "COLLAGE",
};

const ratios: Record<string, string> = {
  "2x-pana":   "2.75:1",
  "1x-pana":   "2.75:1",
  "2x-scope":  "2.39:1",
  "1x-scope":  "2.39:1",
  "2x-cine":   "1.85:1",
  "1x-cine":   "1.85:1",
  "3x-legacy": "4:3",
  "collage":   "mixed",
};

function cellDimensions(layout: typeof LAYOUTS[0]): { width: number; height: number }[] {
  const INNER = 371;
  if (layout.id === "collage") return [];

  if (layout.cols === 2) {
    const w = (INNER - 1) / 2; // 185
    const h = Math.round(w / layout.ratio);
    return [{ width: w, height: h }, { width: w, height: h }];
  }
  if (layout.cols === 1) {
    const w = INNER;
    const h = Math.round(w / layout.ratio);
    return [{ width: w, height: h }];
  }
  if (layout.cols === 3) {
    const w = Math.floor((INNER - 2) / 3); // 123
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
    <div
      style={{
        position: "relative",
        width,
        height,
        border,
        background: "transparent",
        flexShrink: 0,
        overflow: "visible",
      }}
    >
      {isFirst && (
        <>
          <span
            style={{
              position: "absolute",
              top: 5,
              left: 6,
              background: "#d9d9d9",
              height: 11,
              padding: "0 3px",
              display: "flex",
              alignItems: "center",
              fontFamily: "'Sk-Modernist', sans-serif",
              fontWeight: 700,
              fontSize: 8,
              color: "#000000",
              letterSpacing: "-0.16px",
              whiteSpace: "nowrap",
              lineHeight: 1,
              zIndex: 1,
            }}
          >
            {layout.label}
          </span>

          <div
            style={{
              position: "absolute",
              top: 19,
              left: 6,
              display: "flex",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: "'Sk-Modernist', sans-serif",
                fontWeight: 700,
                fontSize: 7,
                color: "#ffffff",
                letterSpacing: "-0.14px",
              }}
            >
              {"AR     "}
            </span>
            <span
              style={{
                fontFamily: "'Sk-Modernist', sans-serif",
                fontWeight: 700,
                fontSize: 7,
                color: "#FF0000",
                letterSpacing: ratioLS,
                marginLeft: 4,
              }}
            >
              {layout.ratioLabel}
            </span>
          </div>

          {layout.resolution && (() => {
            const [lp, rp] = layout.resolution.split("x");
            const ts: React.CSSProperties = {
              fontFamily: "'Sk-Modernist', sans-serif",
              fontWeight: 700,
              fontSize: 7,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "22px",
              whiteSpace: "nowrap",
              lineHeight: 1,
            };
            return (
              <div style={{
                position: "absolute",
                top: "50%",
                transform: "translateY(-50%)",
                left: 7,
                width: 371,
                display: "flex",
                alignItems: "center",
                overflow: "visible",
              }}>
                {/* right-align into the left half — trailing letter-spacing handled by flex */}
                <span style={{ ...ts, flex: 1, textAlign: "right" }}>{lp}</span>
                {/* letterSpacing:0 so flex sizes dot to glyph width only → dot centre = flex midpoint = page centre */}
                <span style={{ ...ts, letterSpacing: 0 }}>·</span>
                {/* paddingLeft replaces the gap that x's letter-spacing would have given */}
                <span style={{ ...ts, flex: 1, paddingLeft: "22px" }}>{rp}</span>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

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
      <div
        onClick={onSelect}
        style={{
          paddingLeft: 2,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            position: "relative",
            width: 371,
            height: 112,
          }}
        >
          {COLLAGE_CELLS.map((cell, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: cell.left,
                top: cell.top,
                width: cell.width,
                height: cell.height,
                border,
                background: "transparent",
              }}
            >
              {i === 0 && (
                <>
                  <span
                    style={{
                      position: "absolute",
                      top: 5,
                      left: 6,
                      background: "#d9d9d9",
                      height: 11,
                      padding: "0 3px",
                      display: "flex",
                      alignItems: "center",
                      fontFamily: "'Sk-Modernist', sans-serif",
                      fontWeight: 700,
                      fontSize: 8,
                      color: "#000000",
                      letterSpacing: "-0.16px",
                      whiteSpace: "nowrap",
                      lineHeight: 1,
                    }}
                  >
                    {layout.label}
                  </span>
                  <div
                    style={{
                      position: "absolute",
                      top: 18,
                      left: 6,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Sk-Modernist', sans-serif",
                        fontWeight: 700,
                        fontSize: 7,
                        color: "#ffffff",
                        letterSpacing: "-0.14px",
                      }}
                    >
                      AR{"     "}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Sk-Modernist', sans-serif",
                        fontWeight: 700,
                        fontSize: 7,
                        color: "#FF0000",
                        letterSpacing: "1.33px",
                        marginLeft: 4,
                      }}
                    >
                      mixed
                    </span>
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
  const gap = layout.cols === 3 ? 1 : 1;

  return (
    <div
      onClick={onSelect}
      style={{
        paddingLeft: 2,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          gap,
          width: 371,
          height: containerHeight,
        }}
      >
        {cells.map((cell, i) => (
          <CellOverlay
            key={i}
            layout={layout}
            selected={selected}
            width={cell.width}
            height={cell.height}
            isFirst={i === 0}
          />
        ))}
      </div>
    </div>
  );
}

export default function GridLayoutPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const [selectedLayout, setSelectedLayout] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const pref = getUserGridLayout(user.id);
    if (pref) setSelectedLayout(pref.layoutId);

    getUserByPrivyId(user.id).then(async (dbUser) => {
      if (!dbUser) return;
      const profile = await getProfile(dbUser.id);
      if (profile?.username) setUsername(profile.username.toUpperCase());
    });
  }, [user?.id]);

  const handleConfirm = async () => {
    if (!selectedLayout || !user?.id || saving) return;
    setSaving(true);
    try {
      await setUserGridLayout(user.id, selectedLayout, names[selectedLayout], ratios[selectedLayout]);
      router.push("/profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: "#000000",
        width: 375,
        minHeight: "100vh",
        margin: "0 auto",
        position: "relative",
        overflowX: "hidden",
        paddingBottom: selectedLayout ? 80 : 24,
      }}
    >

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 5,
          paddingRight: 5,
        }}
      >
        <span
          style={{
            fontFamily: "'Sk-Modernist', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            color: "#ffffff",
            letterSpacing: "-0.24px",
          }}
        >
          WELCOME {username}
        </span>
        <span
          style={{
            fontFamily: "'Sk-Modernist', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            color: "#ffffff",
            letterSpacing: "-0.24px",
          }}
        >
          CHOOSE YOUR GRID LAYOUT
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          paddingTop: 4,
        }}
      >
        {LAYOUTS.map((layout) => (
          <LayoutSection
            key={layout.id}
            layout={layout}
            selected={selectedLayout === layout.id}
            onSelect={() => setSelectedLayout(layout.id)}
          />
        ))}
      </div>

      {selectedLayout && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 375,
            maxWidth: 375,
            background: "#000000",
            padding: "16px 8px",
            zIndex: 30,
          }}
        >
          <button
            onClick={handleConfirm}
            disabled={saving}
            style={{
              width: "100%",
              height: 40,
              border: "1px solid #ffffff",
              background: "transparent",
              color: "#ffffff",
              fontFamily: "'Sk-Modernist', sans-serif",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: "0px",
              textTransform: "uppercase",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            CONFIRM LAYOUT
          </button>
        </div>
      )}
    </div>
  );
}
