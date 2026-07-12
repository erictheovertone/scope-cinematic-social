"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, formatEther } from "viem";
import { base } from "viem/chains";
import { collectPost, sellPost, getTokenPrice, getHolderBalance, diagnoseContract, getSaleConfig } from "@/lib/zora";
import { useEconomy } from "@/components/EconomyProvider";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const QUANTITIES = [1, 5, 10, 100];

function getAspect(gridLayout?: string | null): string {
  if (!gridLayout) return "2.39 / 1";
  switch (gridLayout) {
    case "2x-pana": case "1x-pana": return "2.75 / 1";
    case "2x-scope": case "1x-scope": return "2.39 / 1";
    case "2x-cine": case "1x-cine": return "1.85 / 1";
    case "3x-legacy": return "4 / 3";
    default:
      if (gridLayout.includes("16:9") || gridLayout.includes("16-9")) return "16 / 9";
      if (gridLayout.includes("4:3") || gridLayout.includes("4-3")) return "4 / 3";
      return "2.39 / 1";
  }
}

type Mode = "buy" | "sell";
type TxStatus = "idle" | "confirming" | "success" | "error";

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
  const economy = useEconomy();

  const [mode, setMode] = useState<Mode>("buy");
  const [selectedQty, setSelectedQty] = useState(1);

  // ETH/USD via the boundary's single source; null = unavailable → "$—",
  // never a hardcoded fallback (the old 3000 inflated every dollar shown).
  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [tokenPrice, setTokenPrice] = useState<bigint | null>(null);
  const [holderBalance, setHolderBalance] = useState<bigint>(BigInt(0));
  const [priceLoading, setPriceLoading] = useState(false);

  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    economy.getEthUsdRate().then(setEthUsd).catch(() => setEthUsd(null));
  }, [visible, economy]);

  const fetchData = useCallback(async () => {
    if (!visible || !post.is_minted || !post.contract_address) return;
    setPriceLoading(true);
    try {
      const tokenId = BigInt(post.token_id || "1");
      const embeddedWallet = wallets.find(w => w.walletClientType === "privy");
      const [price, balance] = await Promise.all([
        getTokenPrice({ contractAddress: post.contract_address!, tokenId, quantity: 1 }),
        embeddedWallet
          ? getHolderBalance({
              contractAddress: post.contract_address!,
              tokenId,
              holderAddress: embeddedWallet.address,
            })
          : Promise.resolve(BigInt(0)),
      ]);
      setTokenPrice(price);
      setHolderBalance(balance);
      await diagnoseContract(post.contract_address!, BigInt(post.token_id || "1"));
      await getSaleConfig(post.contract_address!, BigInt(post.token_id || "1"));
    } catch (e) {
      console.error("[CollectSheet] fetchData error:", e);
    } finally {
      setPriceLoading(false);
    }
  }, [visible, post.is_minted, post.contract_address, post.token_id, wallets]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!visible) {
      setTxStatus("idle");
      setTxError(null);
      setSelectedQty(1);
      setMode("buy");
    }
  }, [visible]);

  // Footer takeover — hide the bottom toolbar while the sheet is up so its icons
  // can't sit over BUY / FUND WALLET (same discipline the suite + theatre use).
  useEffect(() => {
    if (!visible) return;
    document.documentElement.dataset.suiteOpen = '1';
    return () => { delete document.documentElement.dataset.suiteOpen; };
  }, [visible]);

  const pricePerTokenEth = tokenPrice != null ? parseFloat(formatEther(tokenPrice)) : null;
  const totalEth = pricePerTokenEth != null ? (pricePerTokenEth * selectedQty).toFixed(5) : null;
  const totalUsd = pricePerTokenEth != null && ethUsd != null ? (pricePerTokenEth * selectedQty * ethUsd).toFixed(2) : null;
  const userHoldsTokens = holderBalance > BigInt(0);
  const notMinted = !post.is_minted || !post.contract_address;

  const isInsufficientFunds = txError?.toLowerCase().includes("insufficient") ||
    txError?.toLowerCase().includes("funds") ||
    txError?.toLowerCase().includes("balance") ||
    txError?.toLowerCase().includes("eth");

  const getWalletClient = async () => {
    const embeddedWallet = wallets.find(w => w.walletClientType === "privy");
    if (!embeddedWallet) throw new Error("No embedded wallet found");
    await embeddedWallet.switchChain(base.id);
    const provider = await embeddedWallet.getEthereumProvider();
    const walletClient = createWalletClient({
      account: embeddedWallet.address as `0x${string}`,
      chain: base,
      transport: custom(provider),
    });
    return { walletClient, address: embeddedWallet.address };
  };

  const handleBuy = async () => {
    if (!user || !post.is_minted || !post.contract_address) return;
    setWorking(true);
    setTxStatus("confirming");
    setTxError(null);
    try {
      const { walletClient, address } = await getWalletClient();
      const { hash } = await collectPost({
        walletClient,
        collectorAddress: address,
        contractAddress: post.contract_address,
        tokenId: BigInt(post.token_id || "1"),
        quantity: selectedQty,
      });
      console.log("[collect] success — hash:", hash);
      setTxStatus("success");
      await fetchData();
    } catch (e: any) {
      console.error("[collect] failed:", e);
      setTxStatus("error");
      setTxError(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setWorking(false);
    }
  };

  const handleSell = async () => {
    if (!user || !post.is_minted || !post.contract_address) return;
    setWorking(true);
    setTxStatus("confirming");
    setTxError(null);
    try {
      const { walletClient, address } = await getWalletClient();
      const { hash } = await sellPost({
        walletClient,
        holderAddress: address,
        contractAddress: post.contract_address,
        tokenId: BigInt(post.token_id || "1"),
        quantity: selectedQty,
      });
      console.log("[sell] success — hash:", hash);
      setTxStatus("success");
      await fetchData();
    } catch (e: any) {
      console.error("[sell] failed:", e);
      setTxStatus("error");
      setTxError(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setWorking(false);
    }
  };

  const handleAction = () => (mode === "buy" ? handleBuy() : handleSell());
  const canAct = !working && !!user && !notMinted && txStatus !== "success";
  const sellQtyExceedsBalance = mode === "sell" && selectedQty > Number(holderBalance);

  return (
    <>
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

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "70vh",
          backgroundColor: "#111111",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          zIndex: 301,
          display: "flex",
          flexDirection: "column",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Close — 44×44 tap target, anchored to the panel (fixed = positioned). */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 0, right: 0, zIndex: 2,
            width: 44, height: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}>
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>

        {post.media_urls?.[0] && (
          <div style={{ width: "100%", aspectRatio: getAspect(post.grid_layout), overflow: "hidden", flexShrink: 0 }}>
            <img
              src={post.media_urls[0]}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, flexShrink: 0 }}>
          <div style={{ width: 40, height: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
        </div>

        <div style={{ padding: "8px 16px 0", flexShrink: 0 }}>
          <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "white", opacity: 0.6, margin: 0 }}>
            @{post.username}
          </p>
          {post.caption && (
            <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "white", opacity: 0.5, margin: "2px 0 0", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {post.caption}
            </p>
          )}
        </div>

        {!notMinted && (
          <div style={{ display: "flex", padding: "12px 16px 0", flexShrink: 0 }}>
            {(["buy", "sell"] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setSelectedQty(1); setTxStatus("idle"); setTxError(null); }}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: `1px solid ${mode === m ? "white" : "rgba(255,255,255,0.15)"}`,
                  cursor: "pointer",
                  padding: "8px 0",
                  fontFamily: "'SK-Modernist', sans-serif",
                  fontWeight: 700,
                  fontSize: 'var(--fs-10)',
                  color: mode === m ? "white" : "rgba(255,255,255,0.4)",
                  letterSpacing: "0.08em",
                }}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto" }}>
          {notMinted ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80 }}>
              <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: "rgba(255,255,255,0.4)", margin: 0, textAlign: "center" }}>
                Not yet available to collect
              </p>
            </div>
          ) : (
            <>
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "white", opacity: 0.4, margin: 0, padding: "12px 16px 0", letterSpacing: "0.08em" }}>
                {mode === "buy" ? "BUY" : `SELL · YOU HOLD ${holderBalance.toString()}`}
              </p>

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "6px 16px 0" }}>
                <div>
                  <p style={{ ...SKB, fontSize: 'var(--fs-32)', color: "white", margin: 0, lineHeight: 1 }}>
                    {priceLoading ? "..." : (totalEth ?? "—")}
                  </p>
                  <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "white", opacity: 0.5, margin: "4px 0 0" }}>
                    ≈ ${priceLoading ? "..." : (totalUsd ?? "—")} · live rate
                  </p>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.1)", padding: "4px 8px", marginTop: 4 }}>
                  <svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none">
                    <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35z" fill="white" />
                    <path d="M12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" fill="white" opacity="0.7" />
                  </svg>
                  <span style={{ ...SKR, fontSize: 'var(--fs-10)', color: "white" }}>ETH · BASE</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, padding: "12px 16px 0" }}>
                {QUANTITIES.map(qty => {
                  const cost = pricePerTokenEth != null ? (pricePerTokenEth * qty).toFixed(4) : null;
                  const overBalance = mode === "sell" && qty > Number(holderBalance);
                  return (
                    <button
                      key={qty}
                      onClick={() => !overBalance && setSelectedQty(qty)}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: `1px solid ${overBalance ? "rgba(255,255,255,0.08)" : selectedQty === qty ? "white" : "rgba(255,255,255,0.2)"}`,
                        cursor: overBalance ? "not-allowed" : "pointer",
                        padding: "5px 2px",
                        fontFamily: "'SK-Modernist', sans-serif",
                        fontWeight: 400,
                        fontSize: 'var(--fs-8)',
                        color: overBalance ? "rgba(255,255,255,0.2)" : "white",
                        opacity: selectedQty === qty && !overBalance ? 1 : 0.6,
                        lineHeight: 1.5,
                        whiteSpace: "pre-line",
                      }}
                    >
                      {qty}x{cost ? `\n${cost}` : ""}
                    </button>
                  );
                })}
              </div>

              <div style={{ padding: "12px 16px 0" }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", opacity: 0.5, margin: 0 }}>PRICE / TOKEN</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "white", margin: "2px 0 0" }}>
                  {priceLoading ? "..." : pricePerTokenEth != null ? `${pricePerTokenEth.toFixed(6)} ETH` : "—"}
                </p>
              </div>

              {mode === "sell" && (
                <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.35)", margin: "10px 16px 0", lineHeight: 1.5 }}>
                  SELL burns your token and routes through secondary markets.
                </p>
              )}
            </>
          )}
        </div>

        <div style={{ flexShrink: 0, padding: "12px 16px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
          {txStatus === "confirming" && (
            <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.5)", margin: 0, textAlign: "center" }}>
              CONFIRMING TRANSACTION...
            </p>
          )}

          {txStatus === "error" && txError && (
            isInsufficientFunds ? (
              <button
                onClick={() => {
                  const w = wallets.find(w => w.walletClientType === "privy");
                  if (w && (w as any).fund) (w as any).fund();
                }}
                style={{ width: "100%", background: "transparent", border: "1px solid #FF0000", cursor: "pointer", padding: "10px 0" }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "#FF0000", letterSpacing: "0.06em" }}>
                  INSUFFICIENT FUNDS · TAP TO FUND WALLET
                </span>
              </button>
            ) : (
              <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "#FF0000", margin: 0, textAlign: "center", lineHeight: 1.4 }}>
                {txError.slice(0, 80)}
              </p>
            )
          )}

          {!notMinted && txStatus !== "error" && (
            <button
              onClick={handleAction}
              disabled={!canAct || sellQtyExceedsBalance}
              style={{
                width: "100%",
                background: txStatus === "success" || !canAct || sellQtyExceedsBalance ? "rgba(255,0,0,0.3)" : "#FF0000",
                border: "none",
                cursor: canAct && !sellQtyExceedsBalance ? "pointer" : "default",
                padding: "14px 0",
              }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", letterSpacing: "0.06em" }}>
                {working
                  ? mode === "buy" ? "BUYING..." : "SELLING..."
                  : txStatus === "success"
                  ? mode === "buy" ? "COLLECTED ✓" : "SOLD ✓"
                  : mode === "buy"
                  ? `BUY · ${totalEth ?? "—"} ETH`
                  : `SELL ${selectedQty} TOKEN${selectedQty > 1 ? "S" : ""}`}
              </span>
            </button>
          )}

          {!notMinted && mode === "buy" && txStatus !== "success" && (
            <button
              onClick={() => {
                const w = wallets.find(w => w.walletClientType === "privy");
                if (w && (w as any).fund) (w as any).fund();
              }}
              style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", padding: "10px 0" }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em" }}>FUND WALLET</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
