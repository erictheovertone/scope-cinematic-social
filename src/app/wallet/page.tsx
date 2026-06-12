"use client";

import { useState, useEffect, useRef } from "react";
import { usePrivy, useFundWallet } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { getEthBalance, getUsdcBalance, getTransactionHistory } from "@/lib/wallet";
import { useEconomy } from "@/components/EconomyProvider";
import TickerMark from "@/components/economy/TickerMark";
import CollectSheetGate from "@/components/economy/CollectSheetGate";
import type { Holding } from "@/lib/economy/types";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export default function WalletPage() {
  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const economy = useEconomy();
  const walletAddress = user?.wallet?.address ?? "";

  const [activeTab, setActiveTab] = useState<"balances" | "holdings" | "activity">("balances");
  // ETH/USD via the boundary's single source; null = rate unavailable → "$—".
  const [ethUsdRate, setEthUsdRate] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<Holding[] | null>(null); // null = not loaded
  const [openHolding, setOpenHolding] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [showSend, setShowSend] = useState(false);
  const [sendToken, setSendToken] = useState<"ETH" | "USDC">("ETH");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");

  // Pull-to-refresh
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const fetchBalances = async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const [eth, usdc, txs, rate] = await Promise.all([
        getEthBalance(walletAddress),
        getUsdcBalance(walletAddress),
        getTransactionHistory(walletAddress),
        economy.getEthUsdRate(),
      ]);
      setEthBalance(eth);
      setUsdcBalance(usdc);
      setTxHistory(txs);
      setEthUsdRate(rate);
      setHoldings(null); // re-pull holdings on next tab view (pull-to-refresh)
    } catch (e) {
      console.error("fetchBalances error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [walletAddress]);

  // Holdings — the ownership ledger, loaded when the tab opens (and refreshed
  // on pull-to-refresh via fetchBalances → holdings reset below).
  useEffect(() => {
    if (activeTab !== "holdings" || holdings !== null) return;
    let cancelled = false;
    economy.getHoldings()
      .then((h) => { if (!cancelled) setHoldings(h); })
      .catch((e) => { console.error("[wallet] holdings load error:", e); if (!cancelled) setHoldings([]); });
    return () => { cancelled = true; };
  }, [activeTab, holdings, economy]);

  // Dollar figures only when the live rate exists — "$—" beats a wrong number.
  const ethUsd = ethBalance != null && ethUsdRate != null
    ? (parseFloat(ethBalance) * ethUsdRate).toFixed(2)
    : null;
  const usdcUsd = usdcBalance != null ? parseFloat(usdcBalance).toFixed(2) : null;
  const totalUsd =
    ethBalance != null && usdcBalance != null && ethUsdRate != null
      ? (parseFloat(ethBalance) * ethUsdRate + parseFloat(usdcBalance)).toFixed(2)
      : null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 60 && !loading) fetchBalances();
  };

  return (
    <div
      ref={containerRef}
      className="bg-black"
      style={{ position: "fixed", inset: 0, overflowY: "auto", color: "white" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: "#111", border: "1px solid rgba(255,255,255,0.15)",
          padding: "8px 16px", zIndex: 999,
        }}>
          <span style={{ ...SKB, fontSize: 10, color: "white", textTransform: "uppercase" }}>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "14px 16px 10px" }}>
        <img src="/scope-logo-new.png" alt="Scope" style={{ height: 28, display: "block", margin: "0 auto" }} />
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />

      {/* Total balance */}
      <div style={{ textAlign: "center", padding: "28px 16px 20px" }}>
        <p style={{ ...SKB, fontSize: 10, color: "white", opacity: 0.5, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Total available balance
        </p>
        <p style={{ ...SKB, fontSize: 32, color: "white", margin: "0 0 8px", lineHeight: 1 }}>
          {loading && totalUsd == null ? "..." : totalUsd != null ? `$${totalUsd}` : "$—"}
        </p>
        {walletAddress && (
          <p
            onClick={() => {
              navigator.clipboard.writeText(walletAddress).then(() => showToast("Address copied"));
            }}
            style={{ ...SKR, fontSize: 9, color: "white", opacity: 0.4, margin: 0, cursor: "pointer" }}
          >
            {shortAddr(walletAddress)}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12, padding: "0 16px 12px" }}>
        <button
          onClick={() => walletAddress && fundWallet(walletAddress, { chain: base })}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", padding: "14px 28px" }}
        >
          <span style={{ fontSize: 24, color: "white", lineHeight: 1 }}>+</span>
          <span style={{ ...SKB, fontSize: 9, color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>DEPOSIT</span>
        </button>
        <button
          onClick={() => setShowSend(true)}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", padding: "14px 28px" }}
        >
          <span style={{ fontSize: 24, color: "white", lineHeight: 1 }}>↗</span>
          <span style={{ ...SKB, fontSize: 9, color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>SEND</span>
        </button>
      </div>

      {/* Or deposit directly */}
      {walletAddress && (
        <div style={{ textAlign: "center", padding: "0 16px 20px" }}>
          <p style={{ ...SKB, fontSize: 8, color: "white", opacity: 0.3, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>or deposit directly</p>
          <p
            onClick={() => navigator.clipboard.writeText(walletAddress).then(() => showToast("Address copied"))}
            style={{ ...SKR, fontSize: 9, color: "white", opacity: 0.5, margin: 0, cursor: "pointer", wordBreak: "break-all" }}
          >
            {walletAddress}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)", padding: "0 16px" }}>
        {(["balances", "holdings", "activity"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...SKB, fontSize: 10, background: "none", border: "none",
              cursor: "pointer", padding: "8px 0", marginRight: 20,
              color: "white", textTransform: "uppercase", letterSpacing: "0.06em",
              opacity: activeTab === tab ? 1 : 0.4,
              borderBottom: activeTab === tab ? "1px solid white" : "1px solid transparent",
              marginBottom: -1,
            }}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: "16px" }}>

        {/* BALANCES */}
        {activeTab === "balances" && (
          <div>
            {/* ETH row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#627EEA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 16, color: "white" }}>Ξ</span>
                </div>
                <div>
                  <p style={{ ...SKB, fontSize: 11, color: "white", margin: 0, textTransform: "uppercase" }}>ETH</p>
                  <p style={{ ...SKB, fontSize: 9, color: "white", opacity: 0.5, margin: "2px 0 0" }}>
                    {loading && ethBalance == null ? "..." : `${parseFloat(ethBalance ?? "0").toFixed(4)} ETH`}
                  </p>
                </div>
              </div>
              <p style={{ ...SKB, fontSize: 11, color: "white", margin: 0 }}>
                {loading && ethUsd == null ? "..." : ethUsd != null ? `$${ethUsd}` : "$—"}
              </p>
            </div>

            {/* USDC row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2775CA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: "white", fontWeight: "bold" }}>$</span>
                </div>
                <div>
                  <p style={{ ...SKB, fontSize: 11, color: "white", margin: 0, textTransform: "uppercase" }}>USDC</p>
                  <p style={{ ...SKB, fontSize: 9, color: "white", opacity: 0.5, margin: "2px 0 0" }}>
                    {loading && usdcBalance == null ? "..." : `${parseFloat(usdcBalance ?? "0").toFixed(2)} USDC`}
                  </p>
                </div>
              </div>
              <p style={{ ...SKB, fontSize: 11, color: "white", margin: 0 }}>
                {loading && usdcUsd == null ? "..." : `$${usdcUsd ?? "0.00"}`}
              </p>
            </div>
          </div>
        )}

        {/* HOLDINGS — the ownership ledger: every Scope coin held, OWN posts
            included (allocation + backing). Dollars lead; null price → "$—". */}
        {activeTab === "holdings" && (
          holdings === null ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "30vh" }}>
              <p style={{ ...SKB, fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>LOADING…</p>
            </div>
          ) : holdings.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "30vh" }}>
              <p style={{ ...SKB, fontSize: 11, color: "white", opacity: 0.5, textAlign: "center", lineHeight: 1.6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                No coin holdings yet
              </p>
            </div>
          ) : (
            <div>
              {/* Total holdings value — austere, dollars. "+" marks unpriced pools. */}
              <div style={{ borderBottom: "1px solid #FF0000", padding: "4px 0 14px", marginBottom: 14 }}>
                <p style={{ ...SKB, fontSize: 7, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 6px" }}>HOLDINGS VALUE</p>
                <p style={{ ...SKB, fontSize: 26, color: "#FF0000", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  ${holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0).toFixed(2)}
                  {holdings.some((h) => h.valueUsd == null) && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}> +</span>}
                </p>
              </div>
              {holdings.map((h) => (
                <div
                  key={h.postId}
                  onClick={() => setOpenHolding(h)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,0.07)", cursor: "pointer" }}
                >
                  {h.thumbUrl
                    ? <img src={h.thumbUrl} alt="" style={{ width: 44, height: 30, objectFit: "cover", flexShrink: 0, background: "#111" }} />
                    : <div style={{ width: 44, height: 30, background: "#111", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {h.ticker ? <TickerMark ticker={h.ticker} size={10} /> : <span style={{ ...SKB, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>—</span>}
                    <p style={{ ...SKR, fontSize: 9, color: "rgba(255,255,255,0.45)", margin: "3px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {h.pieces.toLocaleString()} {h.pieces === 1 ? "PIECE" : "PIECES"}
                    </p>
                  </div>
                  <span style={{ ...SKB, fontSize: 13, color: "white", fontVariantNumeric: "tabular-nums" }}>
                    {h.valueUsd != null ? `$${h.valueUsd.toFixed(2)}` : "$—"}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {/* Tap-through: the holding opens its post's collect sheet. */}
        {openHolding && (
          <CollectSheetGate
            post={openHolding.post as any}
            visible={!!openHolding}
            onClose={() => setOpenHolding(null)}
          />
        )}

        {/* ACTIVITY */}
        {activeTab === "activity" && (
          <div>
            {loading && txHistory.length === 0 ? (
              <p style={{ ...SKB, fontSize: 10, color: "white", opacity: 0.4, textAlign: "center", marginTop: 40, textTransform: "uppercase" }}>Loading…</p>
            ) : txHistory.length === 0 ? (
              <p style={{ ...SKB, fontSize: 10, color: "white", opacity: 0.4, textAlign: "center", marginTop: 40, textTransform: "uppercase" }}>No transactions yet</p>
            ) : (
              txHistory.map((tx: any, i: number) => {
                const isSent = tx.from?.toLowerCase() === walletAddress.toLowerCase();
                const amount = tx.value ? Number(tx.value).toFixed(4) : "—";
                const asset = tx.asset || "ETH";
                const counterpart = isSent ? tx.to : tx.from;
                const date = tx.metadata?.blockTimestamp
                  ? new Date(tx.metadata.blockTimestamp).toLocaleDateString()
                  : "";
                return (
                  <div
                    key={i}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 16, color: isSent ? "rgba(255,255,255,0.5)" : "white" }}>
                        {isSent ? "↑" : "↓"}
                      </span>
                      <div>
                        <p style={{ fontSize: 10, color: "white", margin: 0 }}>
                          <span style={{ ...SKB, textTransform: "uppercase", letterSpacing: "0.04em" }}>{isSent ? "To" : "From"} </span>
                          <span style={{ ...SKR }}>{counterpart ? shortAddr(counterpart) : "—"}</span>
                        </p>
                        <p style={{ ...SKB, fontSize: 9, color: "white", opacity: 0.4, margin: "2px 0 0", textTransform: "uppercase" }}>{date}</p>
                      </div>
                    </div>
                    <p style={{ ...SKB, fontSize: 10, color: "white", margin: 0, textTransform: "uppercase" }}>
                      {isSent ? "-" : "+"}{amount} {asset}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── SEND SHEET ── */}
      <>
        <div
          onClick={() => setShowSend(false)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)",
            zIndex: 300, opacity: showSend ? 1 : 0,
            pointerEvents: showSend ? "auto" : "none",
            transition: "opacity 0.35s ease",
          }}
        />
        <div
          style={{
            position: "fixed", bottom: 0, left: 0, right: 0, height: "60vh",
            backgroundColor: "#0a0a0a", borderTop: "1px solid rgba(255,255,255,0.1)",
            zIndex: 301, display: "flex", flexDirection: "column",
            transform: showSend ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {/* Header */}
          <div style={{ flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 16px 8px" }}>
            <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 40, height: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
            <span style={{ ...SKB, fontSize: 11, color: "white", marginTop: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>SEND</span>
            <button
              onClick={() => setShowSend(false)}
              style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 18, lineHeight: 1, padding: 0, marginTop: 4 }}
            >×</button>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {/* Token selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {(["ETH", "USDC"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setSendToken(t)}
                  style={{
                    ...SKB, fontSize: 10, background: "transparent",
                    border: `1px solid ${sendToken === t ? "white" : "rgba(255,255,255,0.3)"}`,
                    color: "white", opacity: sendToken === t ? 1 : 0.4,
                    cursor: "pointer", padding: "6px 16px", textTransform: "uppercase", letterSpacing: "0.06em",
                  }}
                >{t}</button>
              ))}
            </div>

            {/* TO */}
            <p style={{ ...SKB, fontSize: 9, color: "white", opacity: 0.5, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>TO</p>
            <input
              type="text"
              value={sendTo}
              onChange={e => setSendTo(e.target.value)}
              placeholder="0x... wallet address"
              style={{
                ...SKR, fontSize: 11, color: "white", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.3)",
                outline: "none", width: "100%", padding: "4px 0", marginBottom: 20,
                boxSizing: "border-box",
              }}
            />

            {/* AMOUNT */}
            <p style={{ ...SKB, fontSize: 9, color: "white", opacity: 0.5, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>AMOUNT</p>
            <input
              type="number"
              value={sendAmount}
              onChange={e => setSendAmount(e.target.value)}
              placeholder="0.00"
              style={{
                ...SKR, fontSize: 11, color: "white", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.3)",
                outline: "none", width: "100%", padding: "4px 0", marginBottom: 8,
                boxSizing: "border-box",
              }}
            />
            <p style={{ ...SKB, fontSize: 9, color: "white", opacity: 0.5, margin: "0 0 20px", textTransform: "uppercase" }}>
              Available: {sendToken === "ETH"
                ? `${parseFloat(ethBalance ?? "0").toFixed(4)} ETH`
                : `${parseFloat(usdcBalance ?? "0").toFixed(2)} USDC`}
            </p>

            {/* SEND button */}
            <button
              onClick={() => showToast("Sending coming soon")}
              style={{
                ...SKB, fontSize: 11, color: "white", background: "transparent",
                border: "1px solid white", cursor: "pointer", padding: "12px",
                width: "100%", textTransform: "uppercase", letterSpacing: "0.06em",
              }}
            >
              SEND
            </button>
          </div>
        </div>
      </>

    </div>
  );
}
