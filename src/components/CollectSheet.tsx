"use client";

import { useState } from "react";

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };
const ETH_USD = 3000;
const AMOUNTS = ["0.001", "0.01", "0.1", "MAX"];

function getAspect(gridLayout?: string | null): string {
  if (!gridLayout) return "2.4 / 1";
  if (gridLayout.includes("2.4") || gridLayout === "collage") return "2.4 / 1";
  if (gridLayout.includes("16:9") || gridLayout.includes("16-9") || gridLayout.includes("regular-wide")) return "16 / 9";
  if (gridLayout.includes("4:3") || gridLayout.includes("4-3")) return "4 / 3";
  if (gridLayout.includes("square")) return "1 / 1";
  return "2.4 / 1";
}

interface CollectSheetProps {
  post: {
    id: string;
    username: string;
    caption?: string;
    media_urls: string[];
    grid_layout?: string | null;
  };
  visible: boolean;
  onClose: () => void;
}

export default function CollectSheet({ post, visible, onClose }: CollectSheetProps) {
  const [selectedAmount, setSelectedAmount] = useState("0.001");
  const [toast, setToast] = useState("");

  const displayPrice = selectedAmount === "MAX" ? 0.001 : parseFloat(selectedAmount);
  const usdValue = (displayPrice * ETH_USD).toFixed(2);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.85)",
          zIndex: 300,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 0.35s ease",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "65vh",
          backgroundColor: "#111111",
          borderTop: "1px solid rgba(255,255,255,0.15)",
          zIndex: 301,
          display: "flex",
          flexDirection: "column",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Full-width post image */}
        {post.media_urls?.[0] && (
          <div style={{ width: "100%", aspectRatio: getAspect(post.grid_layout), overflow: "hidden", flexShrink: 0 }}>
            <img
              src={post.media_urls[0]}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        )}

        {/* Drag indicator */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, flexShrink: 0 }}>
          <div style={{ width: 40, height: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
        </div>

        {/* Username + caption — 10px gap below image */}
        <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
          <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.7, margin: 0, lineHeight: 1.3 }}>
            @{post.username}
          </p>
          {post.caption && (
            <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.7, margin: "2px 0 0", lineHeight: 1.3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {post.caption}
            </p>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* BUY label — 14px gap below caption */}
          <p style={{ ...MONO, fontSize: 10, color: "white", opacity: 0.5, margin: 0, padding: "14px 16px 0" }}>BUY</p>

          {/* Price row — 6px gap below BUY */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "6px 16px 0" }}>
            <div>
              <p style={{ ...MONO, fontSize: 32, color: "white", margin: 0, lineHeight: 1 }}>
                {selectedAmount === "MAX" ? "0.001" : selectedAmount}
              </p>
              {/* USD — 4px gap below price */}
              <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: "4px 0 0" }}>
                ≈ ${usdValue}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.1)", padding: "4px 8px" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35z" fill="white" />
                  <path d="M12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" fill="white" opacity="0.7" />
                </svg>
                <span style={{ ...MONO, fontSize: 11, color: "white" }}>ETH</span>
              </div>
              {/* Balance — 4px gap below ETH badge */}
              <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: "4px 0 0" }}>
                Balance: 0 ETH
              </p>
            </div>
          </div>

          {/* Quick amount buttons — 12px gap below balance row */}
          <div style={{ display: "flex", gap: 6, padding: "12px 16px 0" }}>
            {AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => setSelectedAmount(amt)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: `1px solid ${selectedAmount === amt ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.2)"}`,
                  cursor: "pointer",
                  padding: "4px 0",
                  ...MONO,
                  fontSize: 9,
                  color: "white",
                  opacity: selectedAmount === amt ? 1 : 0.6,
                }}
              >
                {amt === "MAX" ? "MAX" : amt}
              </button>
            ))}
          </div>

          {/* Token info — 12px gap below quick amounts */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px 0" }}>
            <div>
              <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: 0 }}>PRICE</p>
              <p style={{ ...MONO, fontSize: 9, color: "white", margin: "2px 0 0" }}>0.001 ETH</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: 0 }}>SUPPLY</p>
              <p style={{ ...MONO, fontSize: 9, color: "white", margin: "2px 0 0" }}>100</p>
            </div>
          </div>

        </div>

        {/* Footer — 16px gap above COLLECT, 8px between buttons */}
        <div style={{ flexShrink: 0, padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
          {toast && (
            <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.6, margin: 0, textAlign: "center" }}>
              {toast}
            </p>
          )}
          <button
            onClick={() => showToast("Collecting coming soon")}
            style={{ width: "100%", background: "#FF0000", border: "none", cursor: "pointer", padding: "14px 0" }}
          >
            <span style={{ ...MONO, fontSize: 11, color: "white" }}>
              COLLECT · {selectedAmount === "MAX" ? "0.001" : selectedAmount} ETH
            </span>
          </button>
          <button
            onClick={() => showToast("Wallet funding coming soon")}
            style={{ width: "100%", background: "transparent", border: "1px solid #FF0000", cursor: "pointer", padding: "12px 0" }}
          >
            <span style={{ ...MONO, fontSize: 11, color: "#FF0000" }}>FUND WALLET</span>
          </button>
        </div>
      </div>
    </>
  );
}
