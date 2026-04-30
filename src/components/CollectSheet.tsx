"use client";

import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, formatEther } from "viem";
import { baseSepolia } from "viem/chains";
import { collectPost, getTokenPrice } from "@/lib/zora";

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };
const ETH_USD = 3000;
const QUANTITIES = [1, 5, 10, 100];

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
    contract_address?: string | null;
    token_id?: string | null;
    is_minted?: boolean;
  };
  visible: boolean;
  onClose: () => void;
}

export default function CollectSheet({ post, visible, onClose }: CollectSheetProps) {
  const { user } = usePrivy();
  const { wallets } = useWallets();

  const [selectedQty, setSelectedQty] = useState(1);
  const [tokenPrice, setTokenPrice] = useState<bigint | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectStatus, setCollectStatus] = useState<"idle" | "confirming" | "success" | "error">("idle");
  const [collectError, setCollectError] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // Fetch live token price when sheet opens
  useEffect(() => {
    if (!visible || !post.is_minted || !post.contract_address) return;

    let cancelled = false;
    const fetchPrice = async () => {
      setPriceLoading(true);
      try {
        const price = await getTokenPrice({
          contractAddress: post.contract_address!,
          tokenId: BigInt(post.token_id || "1"),
          quantity: 1,
        });
        if (!cancelled) setTokenPrice(price);
      } catch (e) {
        console.error("[CollectSheet] getTokenPrice error:", e);
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    };

    fetchPrice();
    return () => { cancelled = true; };
  }, [visible, post.is_minted, post.contract_address, post.token_id]);

  // Reset status when sheet closes
  useEffect(() => {
    if (!visible) {
      setCollectStatus("idle");
      setCollectError(null);
    }
  }, [visible]);

  const pricePerTokenEth = tokenPrice != null ? parseFloat(formatEther(tokenPrice)) : null;
  const totalEth = pricePerTokenEth != null ? (pricePerTokenEth * selectedQty).toFixed(5) : null;
  const totalUsd = pricePerTokenEth != null ? (pricePerTokenEth * selectedQty * ETH_USD).toFixed(2) : null;

  const handleCollect = async () => {
    if (!user || !post.is_minted || !post.contract_address) return;

    setCollecting(true);
    setCollectStatus("confirming");
    setCollectError(null);

    try {
      const embeddedWallet = wallets.find(w => w.walletClientType === "privy");
      if (!embeddedWallet) throw new Error("No embedded wallet found");

      console.log("[collect] Switching to Base Sepolia...");
      await embeddedWallet.switchChain(baseSepolia.id);

      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: baseSepolia,
        transport: custom(provider),
      });

      console.log("[collect] Collecting", selectedQty, "token(s) from", post.contract_address);
      const { hash } = await collectPost({
        walletClient,
        collectorAddress: embeddedWallet.address,
        contractAddress: post.contract_address,
        tokenId: BigInt(post.token_id || "1"),
        quantity: selectedQty,
      });
      console.log("[collect] Success — hash:", hash);

      setCollectStatus("success");
      showToast("Collected! ✓");
    } catch (e: any) {
      console.error("[collect] Failed:", e);
      setCollectStatus("error");
      const msg = e?.shortMessage || e?.message || "Transaction failed";
      setCollectError(msg);
      showToast(msg.slice(0, 60));
    } finally {
      setCollecting(false);
    }
  };

  const canCollect = post.is_minted && !!post.contract_address && !!user && !collecting;
  const notMinted = !post.is_minted || !post.contract_address;

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

        {/* Username + caption */}
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

          {notMinted ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80 }}>
              <p style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, textAlign: "center" }}>
                Not yet available to collect
              </p>
            </div>
          ) : (
            <>
              {/* BUY label */}
              <p style={{ ...MONO, fontSize: 10, color: "white", opacity: 0.5, margin: 0, padding: "14px 16px 0" }}>BUY</p>

              {/* Price row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "6px 16px 0" }}>
                <div>
                  <p style={{ ...MONO, fontSize: 32, color: "white", margin: 0, lineHeight: 1 }}>
                    {priceLoading ? "..." : (totalEth ?? "—")}
                  </p>
                  <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: "4px 0 0" }}>
                    ≈ ${priceLoading ? "..." : (totalUsd ?? "—")}
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
                  <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: "4px 0 0" }}>
                    Base Sepolia
                  </p>
                </div>
              </div>

              {/* Quantity buttons */}
              <div style={{ display: "flex", gap: 6, padding: "12px 16px 0" }}>
                {QUANTITIES.map(qty => {
                  const cost = pricePerTokenEth != null ? (pricePerTokenEth * qty).toFixed(4) : null;
                  return (
                    <button
                      key={qty}
                      onClick={() => setSelectedQty(qty)}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: `1px solid ${selectedQty === qty ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.2)"}`,
                        cursor: "pointer",
                        padding: "5px 2px",
                        ...MONO,
                        fontSize: 8,
                        color: "white",
                        opacity: selectedQty === qty ? 1 : 0.6,
                        lineHeight: 1.5,
                        whiteSpace: "pre-line",
                      }}
                    >
                      {qty}x{cost ? `\n${cost}` : ""}
                    </button>
                  );
                })}
              </div>

              {/* Token info */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px 0" }}>
                <div>
                  <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: 0 }}>PRICE / TOKEN</p>
                  <p style={{ ...MONO, fontSize: 9, color: "white", margin: "2px 0 0" }}>
                    {priceLoading ? "..." : pricePerTokenEth != null ? `${pricePerTokenEth.toFixed(5)} ETH` : "—"}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: 0 }}>NETWORK</p>
                  <p style={{ ...MONO, fontSize: 9, color: "white", margin: "2px 0 0" }}>Base Sepolia</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
          {toast && (
            <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.6, margin: 0, textAlign: "center" }}>
              {toast}
            </p>
          )}
          {collectStatus === "confirming" && (
            <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: 0, textAlign: "center" }}>
              Confirming transaction...
            </p>
          )}
          {collectStatus === "error" && collectError && (
            <p style={{ ...MONO, fontSize: 9, color: "#FF0000", margin: 0, textAlign: "center", lineHeight: 1.4 }}>
              {collectError.slice(0, 80)}
            </p>
          )}
          {!notMinted ? (
            <>
              <button
                onClick={handleCollect}
                disabled={!canCollect || collectStatus === "success"}
                style={{
                  width: "100%",
                  background: canCollect && collectStatus !== "success" ? "#FF0000" : "rgba(255,0,0,0.3)",
                  border: "none",
                  cursor: canCollect && collectStatus !== "success" ? "pointer" : "default",
                  padding: "14px 0",
                }}
              >
                <span style={{ ...MONO, fontSize: 11, color: "white" }}>
                  {collecting ? "COLLECTING..." : collectStatus === "success" ? "COLLECTED ✓" : `COLLECT · ${totalEth ?? "—"} ETH`}
                </span>
              </button>
              <button
                onClick={() => showToast("Fund your Privy wallet with testnet ETH at base-sepolia.drpc.org")}
                style={{ width: "100%", background: "transparent", border: "1px solid #FF0000", cursor: "pointer", padding: "12px 0" }}
              >
                <span style={{ ...MONO, fontSize: 11, color: "#FF0000" }}>FUND WALLET</span>
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", padding: "14px 0" }}
            >
              <span style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>CLOSE</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
