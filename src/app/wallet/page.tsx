"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePrivy, useFundWallet, useWallets } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { createWalletClient, custom, getAddress, parseEther, encodeFunctionData } from "viem";
import { publicClient, errInfo } from "@/lib/zoraCoins";
import { getEthBalance, getUsdcBalance, getTransactionHistory } from "@/lib/wallet";
import { useEconomy } from "@/components/EconomyProvider";
import TickerMark from "@/components/economy/TickerMark";
import FrameLoader from "@/components/FrameLoader";
import CollectSheetGate from "@/components/economy/CollectSheetGate";
import type { Holding } from "@/lib/economy/types";
import { onTradeSettled } from "@/lib/economy/tradeEvents";
import { useCountUp } from "@/lib/economy/useCountUp";
import { groupActivity, shortAddr as shortAddr0x, type ActivityRow } from "@/lib/walletActivity";
import { supabase } from "@/lib/supabase/client";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const ERC20_TRANSFER_ABI = [{ name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }] as const;

export default function WalletPage() {
  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { wallets } = useWallets();
  const economy = useEconomy();
  const walletAddress = user?.wallet?.address ?? "";

  const [activeTab, setActiveTab] = useState<"balances" | "holdings" | "activity">("balances");
  // ETH/USD via the boundary's single source; null = rate unavailable → "$—".
  const [ethUsdRate, setEthUsdRate] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  // coin_address(lowercase) → ticker, from posts — the app's ticker source of truth,
  // so activity resolves real tickers (never a bare numeric on-chain symbol).
  const [coinTickers, setCoinTickers] = useState<Map<string, string>>(new Map());
  const [holdings, setHoldings] = useState<Holding[] | null>(null); // null = not loaded
  const [openHolding, setOpenHolding] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  // Incoming-funds acknowledgment: { id } restarts the [ +$X ] pulse animation.
  const [fundPulse, setFundPulse] = useState<{ id: number; usd: number } | null>(null);
  // SEND v1 — CURRENCIES ONLY (ETH | USDC from AVAILABLE). No coin/piece
  // transfers: gifting pieces collides with First Cut HOLD-ALL provenance —
  // deferred as its own design question.
  const [showSend, setShowSend] = useState(false);
  const [sendToken, setSendToken] = useState<"ETH" | "USDC">("ETH");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState(""); // DOLLARS
  const [sendStep, setSendStep] = useState<"input" | "review" | "sending" | "sent">("input");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendGasUsd, setSendGasUsd] = useState<number | null>(null);
  const [sentLabel, setSentLabel] = useState("");
  const GAS_RESERVE_ETH = 0.0002; // ETH MAX leaves this for gas

  // Pull-to-refresh
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  // Optimistic-balance FLOOR (receipt-true sell proceeds): once a sell confirms we
  // bump the displayed cash instantly; a subsequent on-chain read must NEVER show
  // BELOW that until the chain catches up — then the floor clears (settle to truth).
  // Keep-last-good for cash, mirroring the holdings rule.
  const ethFloor = useRef<number | null>(null);
  const usdcFloor = useRef<number | null>(null);
  const ethUsdRateRef = useRef(ethUsdRate);
  ethUsdRateRef.current = ethUsdRate;

  const applyReadBalances = (ethStr: string, usdcStr: string) => {
    const e = parseFloat(ethStr);
    if (ethFloor.current != null && e + 1e-12 < ethFloor.current) setEthBalance(String(ethFloor.current));
    else { ethFloor.current = null; setEthBalance(ethStr); }
    const u = parseFloat(usdcStr);
    if (usdcFloor.current != null && u + 1e-9 < usdcFloor.current) setUsdcBalance(String(usdcFloor.current));
    else { usdcFloor.current = null; setUsdcBalance(usdcStr); }
  };

  // Per-post HOLDINGS-VALUE floor (receipt-true buy). After a BUY the new pieces are
  // worth ≈ what was PAID, but the market-price read lags Zora's index — so a reconcile
  // BEFORE the index would value them at the stale PRE-trade price and the wallet total
  // would dip below the spend (the "shows less than spent" trust bug). The floor holds
  // the displayed value at the receipt-true amount ONLY until Zora indexes the trade
  // (detected by the coin's price moving off its pre-trade value, or — for a first buy —
  // the coin gaining a price). Then it RELEASES to the true market value, even if that's
  // slightly below the spend (the legitimate AMM buy spread — NOT faked away). A 90s
  // safety timer clears any floor regardless, so nothing can persist.
  const holdingFloor = useRef<Map<string, { value: number; prePrice: number | null }>>(new Map());
  const applyHoldingFloors = (list: Holding[]): Holding[] => {
    if (holdingFloor.current.size === 0) return list;
    return list.map((h) => {
      const f = holdingFloor.current.get(h.postId);
      if (!f) return h;
      const indexed = f.prePrice != null
        ? (h.priceUsd != null && Math.abs(h.priceUsd - f.prePrice) > f.prePrice * 1e-3) // price moved → indexed
        : (h.priceUsd != null && h.valueUsd > 0); // first buy: coin gained a price → indexed
      if (indexed) { holdingFloor.current.delete(h.postId); return h; } // settle to truth (incl. spread)
      return { ...h, valueUsd: f.value }; // still pre-index → show ≈ what was paid, not a stale-low flash
    });
  };
  const setHoldingFloor = (postId: string, value: number, prePrice: number | null) => {
    holdingFloor.current.set(postId, { value, prePrice });
    window.setTimeout(() => holdingFloor.current.delete(postId), 90_000); // safety: never persist
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
      applyReadBalances(eth, usdc);
      setTxHistory(txs);
      setEthUsdRate(rate);
      setHoldings(null); // re-pull holdings on next tab view (pull-to-refresh)
    } catch (e) {
      console.error("fetchBalances error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Quiet AVAILABLE refresh — eth + usdc only, no loading flash, no holdings/tx
  // re-pull (those carry the market-read cost). Used by the deposit poll and by
  // post-trade proceeds so cash landing in the wallet shows up on its own.
  const refreshAvailable = async () => {
    if (!walletAddress) return;
    try {
      const [eth, usdc] = await Promise.all([
        getEthBalance(walletAddress),
        getUsdcBalance(walletAddress),
      ]);
      applyReadBalances(eth, usdc);
    } catch (e) {
      console.error("refreshAvailable error:", e);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [walletAddress]);

  // Autodetect incoming funds — poll the wallet while this page is visible.
  // One path serves both external deposits AND in-app proceeds: anything that
  // raises eth/usdc surfaces here. Paused when the tab is hidden; 25s cadence
  // keeps it well under any RPC ceiling for a single wallet.
  useEffect(() => {
    if (!walletAddress) return;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        await refreshAvailable();
      }
      timer = setTimeout(loop, 25000);
    };
    timer = setTimeout(loop, 25000);
    return () => clearTimeout(timer);
  }, [walletAddress]);

  // Detection lives on the underlying token balances, not the USD figure, so a
  // moving ETH/USD rate never fakes a deposit. Only INCREASES fire (deposits +
  // sale proceeds); outflows from sends/buys are ignored.
  const prevEth = useRef<number | null>(null);
  const prevUsdc = useRef<number | null>(null);
  useEffect(() => {
    if (ethBalance == null || usdcBalance == null) return;
    const e = parseFloat(ethBalance);
    const u = parseFloat(usdcBalance);
    if (prevEth.current != null && prevUsdc.current != null) {
      const dEth = e - prevEth.current;
      const dUsdc = u - prevUsdc.current;
      const incUsd = (dEth > 0 ? dEth * (ethUsdRate ?? 0) : 0) + (dUsdc > 0 ? dUsdc : 0);
      if (incUsd > 0.01) setFundPulse({ id: Date.now(), usd: incUsd });
    }
    prevEth.current = e;
    prevUsdc.current = u;
  }, [ethBalance, usdcBalance, ethUsdRate]);

  // Retire the [ +$X ] mark after it plays (matches the fundPulse keyframe).
  useEffect(() => {
    if (!fundPulse) return;
    const t = setTimeout(() => setFundPulse(null), 2800);
    return () => clearTimeout(t);
  }, [fundPulse]);

  // Holdings — the ownership ledger. Loaded eagerly: the headline TOTAL is
  // AVAILABLE + HOLDINGS, so both numbers exist from the start. Refreshed on
  // pull-to-refresh via fetchBalances → holdings reset.
  useEffect(() => {
    if (holdings !== null || !walletAddress) return;
    let cancelled = false;
    economy.getHoldings()
      .then((h) => { if (!cancelled) setHoldings(h); })
      .catch((e) => { console.error("[wallet] holdings load error:", e); if (!cancelled) setHoldings([]); });
    return () => { cancelled = true; };
  }, [holdings, walletAddress, economy]);

  // Guards async setState after unmount (the spaced reconcile reads + interval).
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // RECONCILE (Change 3): refetch real holdings — the SERVER /api/market cache is
  // busted on trade, so this reads fresh, not the pre-trade price. A few spaced
  // reads converge as Zora indexes the trade; the real read always WINS over the
  // optimistic patch. Reuses the hardened /api/market (retry/verify) — no bypass.
  const reconcileHoldings = useCallback(() => {
    [0, 1500, 4000].forEach((delay) => setTimeout(() => {
      economy.getHoldings()
        .then((h) => { if (mountedRef.current) setHoldings(applyHoldingFloors(h)); })
        .catch(() => {});
    }, delay));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [economy]);

  // POST-TRADE: OPTIMISTIC pieces patch (Change 2, holdings-only) THEN reconcile.
  // The affected holding's pieces update INSTANTLY — value recomputed with the
  // LAST KNOWN price (price/order reconcile from the real read, never guessed);
  // a holding emptied to 0 drops out; a brand-new holding is added by reconcile.
  // No blanking — the optimistic state shows until the real read replaces it.
  useEffect(() => onTradeSettled((postId, detail) => {
    const delta = detail?.piecesDelta;
    const spentUsd = detail?.spentUsd;
    if (postId && typeof delta === "number" && delta !== 0) {
      setHoldings((prev) => {
        if (!prev) return prev;
        return prev
          .map((h) => {
            if (h.postId !== postId) return h;
            const pieces = Math.max(0, h.pieces + delta);
            // BUY with receipt-true spend → value the position at old + paid (the new
            // pieces are worth what you paid). Floor it so the reconcile's lagged-price
            // read can't drop it below the spend. SELL / no-spent → last-known price.
            if (delta > 0 && spentUsd != null && spentUsd > 0) {
              const valueUsd = h.valueUsd + spentUsd;
              setHoldingFloor(postId, valueUsd, h.priceUsd ?? null); // release when this price moves
              return { ...h, pieces, valueUsd };
            }
            return { ...h, pieces, valueUsd: (h.priceUsd ?? 0) * pieces };
          })
          .filter((h) => h.pieces > 0)
          .sort((a, b) => b.valueUsd - a.valueUsd);
      });
    }
    // BRAND-NEW holding (first buy of this coin → no prev entry to patch): floor at the
    // spend (prePrice null → releases once the coin gains a price = Zora indexed).
    if (postId && typeof delta === "number" && delta > 0 && spentUsd != null && spentUsd > 0 && !holdingFloor.current.has(postId)) {
      setHoldingFloor(postId, spentUsd, null);
    }
    // INSTANT balance tick-up (Fix): a SELL carries receipt-true proceeds — bump the
    // received currency's balance NOW (don't wait the ~7s on-chain refetch). Sets a
    // floor so the reconcile read can't lower it until the chain catches up. ETH is
    // derived from proceedsUsd ÷ the live rate, so the displayed TOTAL ticks up by
    // exactly the receipt-true USD.
    const pUsd = detail?.proceedsUsd;
    const pCur = detail?.proceedsCurrency;
    if (pUsd != null && pUsd > 0 && pCur) {
      if (pCur === "USDC") {
        setUsdcBalance((prev) => { const next = (prev != null ? parseFloat(prev) : 0) + pUsd; usdcFloor.current = next; return String(next); });
      } else {
        const rate = ethUsdRateRef.current;
        if (rate && rate > 0) {
          const ethAmt = pUsd / rate;
          setEthBalance((prev) => { const next = (prev != null ? parseFloat(prev) : 0) + ethAmt; ethFloor.current = next; return String(next); });
        }
      }
    }
    reconcileHoldings();
    refreshAvailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [walletAddress, reconcileHoldings]);

  // 60s BACKGROUND staleness (Change 4): even absent an action, holdings are
  // never older than ~60s. Light — one batched getHoldings/min (reuses the
  // /api/market batch+cache, so no per-tile API storm / 429 regression).
  //
  // KEEP-LAST-GOOD (the established rule): a background tick must NEVER overwrite
  // a good value with $0 from a failed/unresolved price read. If a holding that
  // was PRICED comes back unpriced this tick (a traded coin doesn't lose its
  // discovered price → it's a failed read, not a real $0), keep its last-known
  // value. A genuinely untraded coin (always unpriced) stays $0; a sold-out coin
  // (0 pieces) is already dropped by getHoldings. The chunk fix above makes this
  // rare, but the merge guarantees the collapse can never recur.
  useEffect(() => {
    if (!walletAddress) return;
    const id = setInterval(() => {
      economy.getHoldings()
        .then((next) => {
          if (!mountedRef.current) return;
          setHoldings((prev) => {
            if (!prev) return applyHoldingFloors(next);
            const prevByPost = new Map(prev.map((h) => [h.postId, h]));
            const merged = next
              .map((h) => {
                if (h.priceUsd != null && h.valueUsd > 0) return h; // resolved — use it
                const old = prevByPost.get(h.postId);
                if (old && old.priceUsd != null && old.valueUsd > 0) {
                  // unresolved this tick but previously priced → keep last good
                  return { ...h, priceUsd: old.priceUsd, valueUsd: old.priceUsd * h.pieces };
                }
                return h; // genuinely unpriced (untraded) → stays $0
              });
            return applyHoldingFloors(merged).sort((a, b) => b.valueUsd - a.valueUsd);
          });
        })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [walletAddress, economy]);

  // Dollar figures only when the live rate exists — "$—" beats a wrong number.
  const ethUsd = ethBalance != null && ethUsdRate != null
    ? (parseFloat(ethBalance) * ethUsdRate).toFixed(2)
    : null;
  const usdcUsd = usdcBalance != null ? parseFloat(usdcBalance).toFixed(2) : null;

  // Activity: group raw transfer legs into readable trade rows (fragments, not raw
  // on-chain amounts). Reuses the single-source tokenomics conversion via walletActivity.
  const activityRows = useMemo<ActivityRow[]>(
    () => (walletAddress ? groupActivity(txHistory, walletAddress, ethUsdRate, coinTickers) : []),
    [txHistory, walletAddress, ethUsdRate, coinTickers],
  );
  // Load coin_address→ticker once (the posts table is the app's ticker source of truth).
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select("coin_address, ticker")
        .not("coin_address", "is", null)
        .eq("token_standard", "coin");
      if (!alive || !data) return;
      const m = new Map<string, string>();
      for (const p of data as { coin_address: string | null; ticker: string | null }[]) {
        if (p.coin_address && p.ticker) m.set(p.coin_address.toLowerCase(), p.ticker);
      }
      setCoinTickers(m);
    })();
    return () => { alive = false; };
  }, []);
  // WALLET STRUCTURE (decided): holdings never blend into available.
  // AVAILABLE = spendable USDC+ETH — the ONLY balance buy flows draw on.
  // HOLDINGS = positions value (price × pieces). TOTAL = the headline.
  const availableUsd =
    ethBalance != null && usdcBalance != null && ethUsdRate != null
      ? parseFloat(ethBalance) * ethUsdRate + parseFloat(usdcBalance)
      : null;
  // Rule 1: zero-trade coins are $0 by definition — valueUsd is always a number.
  const holdingsUsd = holdings != null ? holdings.reduce((s, h) => s + h.valueUsd, 0) : null;
  const totalNum = availableUsd != null ? availableUsd + (holdingsUsd ?? 0) : null;
  // TOTAL and AVAILABLE roll to new values (deposits, proceeds, holdings load).
  const animatedTotal = useCountUp(totalNum);
  const animatedAvailable = useCountUp(availableUsd);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 60 && !loading) fetchBalances();
  };

  // ── SEND mechanics ───────────────────────────────────────────────────────
  const sendUsdNum = parseFloat(sendAmount);
  const sendNativeNum = sendToken === "USDC"
    ? (isFinite(sendUsdNum) ? sendUsdNum : null)
    : (isFinite(sendUsdNum) && ethUsdRate != null ? sendUsdNum / ethUsdRate : null);

  const sendMax = () => {
    if (sendToken === "USDC") setSendAmount(parseFloat(usdcBalance ?? "0").toFixed(2));
    else if (ethUsdRate != null) {
      // ETH MAX = balance minus the gas reserve.
      const maxEth = Math.max(0, parseFloat(ethBalance ?? "0") - GAS_RESERVE_ETH);
      setSendAmount(Math.max(0, maxEth * ethUsdRate).toFixed(2));
    }
  };

  const buildSendTx = (to: `0x${string}`) =>
    sendToken === "ETH"
      ? { to, value: parseEther((sendNativeNum ?? 0).toFixed(18)), data: undefined as `0x${string}` | undefined }
      : {
          to: USDC_BASE as `0x${string}`,
          value: BigInt(0),
          data: encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: "transfer", args: [to, BigInt(Math.round((sendUsdNum || 0) * 1e6))] }),
        };

  const goReview = async () => {
    setSendError(null);
    // Checksum-validate LOUDLY — reject anything that isn't a valid address.
    let to: `0x${string}`;
    try { to = getAddress(sendTo.trim()); } catch {
      setSendError("That isn’t a valid address — check it and paste again.");
      return;
    }
    if (!isFinite(sendUsdNum) || sendUsdNum <= 0 || sendNativeNum == null) {
      setSendError(sendToken === "ETH" && ethUsdRate == null ? "Dollar rate unavailable right now — try again in a moment." : "Enter an amount.");
      return;
    }
    const avail = sendToken === "USDC" ? parseFloat(usdcBalance ?? "0") : Math.max(0, parseFloat(ethBalance ?? "0") - GAS_RESERVE_ETH);
    if (sendNativeNum > avail) { setSendError("That’s more than your available balance."); return; }
    try {
      const tx = buildSendTx(to);
      const [gas, gasPrice] = await Promise.all([
        publicClient.estimateGas({ ...tx, account: walletAddress as `0x${string}` }),
        publicClient.getGasPrice(),
      ]);
      const gasEth = Number(gas * gasPrice) / 1e18;
      setSendGasUsd(ethUsdRate != null ? gasEth * ethUsdRate : null);
    } catch { setSendGasUsd(null); }
    setSendStep("review");
  };

  const doSend = async () => {
    setSendStep("sending");
    setSendError(null);
    try {
      const embedded = wallets.find((w) => w.walletClientType === "privy");
      if (!embedded) throw new Error("Wallet not ready — try again in a moment.");
      await embedded.switchChain(base.id);
      const provider = await embedded.getEthereumProvider();
      const walletClient = createWalletClient({ account: embedded.address as `0x${string}`, chain: base, transport: custom(provider) });
      const to = getAddress(sendTo.trim());
      const tx = buildSendTx(to);
      const hash = await walletClient.sendTransaction({ ...tx, account: embedded.address as `0x${string}`, chain: base });
      console.log(`[wallet] SEND ${sendToken} $${sendUsdNum.toFixed(2)} → ${to} | tx: ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transfer reverted on-chain — nothing was sent.");
      setSentLabel(`[ SENT · $${sendUsdNum.toFixed(2)} ]`);
      setSendStep("sent");
      fetchBalances(); // AVAILABLE updates; ACTIVITY picks the tx up
      setTimeout(() => {
        setShowSend(false);
        setSendStep("input"); setSendTo(""); setSendAmount(""); setSentLabel("");
      }, 2500);
    } catch (e) {
      console.error("[wallet] send failed:", errInfo(e));
      const m = (e as Error)?.message ?? "";
      setSendError(m.length > 0 && m.length < 140 ? m : "The send didn’t go through — nothing left your wallet. Try again.");
      setSendStep("review");
    }
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
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "white", textTransform: "uppercase" }}>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "14px 16px 10px" }}>
        <img src="/scope-logo-new.png" alt="Scope" style={{ height: 28, display: "block", margin: "0 auto" }} />
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />

      {/* TOTAL (headline) — then the split that matters: AVAILABLE is what a
          purchase can actually draw on; HOLDINGS is position value. Never show
          a balance a buy can't spend. */}
      <div style={{ textAlign: "center", padding: "28px 16px 20px" }}>
        <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "white", opacity: 0.5, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Total
        </p>
        <div style={{ position: "relative" }}>
          {/* Incoming-funds mark — lands above TOTAL, then lifts away */}
          {fundPulse && (
            <span
              key={fundPulse.id}
              style={{
                ...SKB, position: "absolute", left: 0, right: 0, top: -16,
                fontSize: 'var(--fs-11)', color: "#FF0000", letterSpacing: "0.08em",
                animation: "fundPulse 2.6s ease-out forwards", pointerEvents: "none",
              }}
            >
              [ +${fundPulse.usd.toFixed(2)} ]
            </span>
          )}
          <p style={{ ...SKB, fontSize: 'var(--fs-32)', color: "white", margin: "0 0 8px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {loading && animatedTotal == null ? "..." : animatedTotal != null ? `$${animatedTotal.toFixed(2)}` : "$—"}
          </p>
        </div>
        {/* THE CANONICAL MONEY-PAIR: two-column stat row (label/value, profile-
            stat pattern). White = spendable cash, red = invested/at-market.
            Columns index the tabs beneath them. Reuse this layout wherever the
            AVAILABLE/HOLDINGS pair appears (earnings summary etc.). */}
        <div style={{ display: "flex", justifyContent: "center", gap: 56, margin: "14px 0 10px" }}>
          <div onClick={() => setActiveTab("balances")} style={{ cursor: "pointer" }}>
            <p style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 5px" }}>
              AVAILABLE
            </p>
            <p style={{ ...SKB, fontSize: 'var(--fs-16)', color: "#FFFFFF", margin: 0, fontVariantNumeric: "tabular-nums" }}>
              {animatedAvailable != null ? `$${animatedAvailable.toFixed(2)}` : "$—"}
            </p>
          </div>
          <div onClick={() => setActiveTab("holdings")} style={{ cursor: "pointer" }}>
            <p style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 5px" }}>
              HOLDINGS
            </p>
            <p style={{ ...SKB, fontSize: 'var(--fs-16)', color: "#FF0000", margin: 0, fontVariantNumeric: "tabular-nums" }}>
              {holdingsUsd != null ? `$${holdingsUsd.toFixed(2)}` : "…"}
            </p>
          </div>
        </div>
        {walletAddress && (
          <p
            onClick={() => {
              navigator.clipboard.writeText(walletAddress).then(() => showToast("Address copied"));
            }}
            style={{ ...SKR, fontSize: 'var(--fs-9)', color: "white", opacity: 0.4, margin: 0, cursor: "pointer" }}
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
          <span style={{ fontSize: 'var(--fs-24)', color: "white", lineHeight: 1 }}>+</span>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>DEPOSIT</span>
        </button>
        <button
          onClick={() => setShowSend(true)}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", padding: "14px 28px" }}
        >
          <span style={{ fontSize: 'var(--fs-24)', color: "white", lineHeight: 1 }}>↗</span>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>SEND</span>
        </button>
      </div>

      {/* Or deposit directly */}
      {walletAddress && (
        <div style={{ textAlign: "center", padding: "0 16px 20px" }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-8)', color: "white", opacity: 0.3, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>or deposit directly</p>
          <p
            onClick={() => navigator.clipboard.writeText(walletAddress).then(() => showToast("Address copied"))}
            style={{ ...SKR, fontSize: 'var(--fs-9)', color: "white", opacity: 0.5, margin: 0, cursor: "pointer", wordBreak: "break-all" }}
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
              ...SKB, fontSize: 'var(--fs-10)', background: "none", border: "none",
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
                  <span style={{ fontSize: 'var(--fs-16)', color: "white" }}>Ξ</span>
                </div>
                <div>
                  <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", margin: 0, textTransform: "uppercase" }}>ETH</p>
                  <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", opacity: 0.5, margin: "2px 0 0" }}>
                    {loading && ethBalance == null ? "..." : `${parseFloat(ethBalance ?? "0").toFixed(4)} ETH`}
                  </p>
                </div>
              </div>
              <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", margin: 0 }}>
                {loading && ethUsd == null ? "..." : ethUsd != null ? `$${ethUsd}` : "$—"}
              </p>
            </div>

            {/* USDC row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2775CA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 'var(--fs-13)', color: "white", fontWeight: "bold" }}>$</span>
                </div>
                <div>
                  <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", margin: 0, textTransform: "uppercase" }}>USDC</p>
                  <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", opacity: 0.5, margin: "2px 0 0" }}>
                    {loading && usdcBalance == null ? "..." : `${parseFloat(usdcBalance ?? "0").toFixed(2)} USDC`}
                  </p>
                </div>
              </div>
              <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", margin: 0 }}>
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
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>LOADING…</p>
            </div>
          ) : holdings.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "30vh" }}>
              <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", opacity: 0.5, textAlign: "center", lineHeight: 1.6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                No coin holdings yet
              </p>
            </div>
          ) : (
            <div>
              {/* Total holdings value — austere, dollars. "+" marks unpriced pools. */}
              <div style={{ borderBottom: "1px solid #FF0000", padding: "4px 0 14px", marginBottom: 14 }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-7)', color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 6px" }}>HOLDINGS VALUE</p>
                <p style={{ ...SKB, fontSize: 'var(--fs-26)', color: "#FF0000", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  ${holdings.reduce((s, h) => s + h.valueUsd, 0).toFixed(2)}
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
                    {h.ticker ? <TickerMark ticker={h.ticker} size={11.5} /> : <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "rgba(255,255,255,0.4)" }}>—</span>}
                    <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.45)", margin: "3px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {h.pieces.toLocaleString()} {h.pieces === 1 ? "FRAGMENT" : "FRAGMENTS"}
                    </p>
                  </div>
                  <span style={{ ...SKB, fontSize: 'var(--fs-13)', color: "white", fontVariantNumeric: "tabular-nums" }}>
                    {`$${h.valueUsd.toFixed(2)}`}
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

        {/* ACTIVITY — one readable row per trade (legs grouped by tx hash; amounts
            shown in FRAGMENTS via the single-source tokenomics conversion). */}
        {activeTab === "activity" && (
          <div>
            {loading && activityRows.length === 0 ? (
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "white", opacity: 0.4, textAlign: "center", marginTop: 40, textTransform: "uppercase" }}>Loading…</p>
            ) : activityRows.length === 0 ? (
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "white", opacity: 0.4, textAlign: "center", marginTop: 40, textTransform: "uppercase" }}>No transactions yet</p>
            ) : (
              activityRows.map((row, i) => {
                const frag = row.fragments != null && row.fragments > 0 ? row.fragments.toLocaleString() : '';
                const usdAbs = row.usd != null
                  ? (row.usd >= 1000 ? `$${Math.round(row.usd).toLocaleString()}` : `$${row.usd.toFixed(2)}`)
                  : null;
                // Plain-transfer hero amount (raw asset, e.g. "10.00 USDC").
                const cashLabel = row.cashAmount != null
                  ? `${Number(row.cashAmount).toFixed(row.cashAsset?.toUpperCase().startsWith('USD') ? 2 : 4)} ${row.cashAsset ?? ''}`.trim()
                  : '';

                // Directional icon circle: tint + glyph + color by action.
                const cfg = ({
                  buy:     { tint: 'rgba(255,0,0,0.10)',     glyph: '↓', color: '#ff4d4d' },
                  sell:    { tint: 'rgba(74,222,128,0.10)',  glyph: '↑', color: '#4ade80' },
                  mint:    { tint: 'rgba(255,255,255,0.06)', glyph: '✦', color: '#888888' },
                  receive: { tint: 'rgba(74,222,128,0.10)',  glyph: '↓', color: '#4ade80' },
                  send:    { tint: 'rgba(255,0,0,0.10)',     glyph: '↑', color: '#ff4d4d' },
                } as const)[row.kind];

                // Hero verb + amount (white); ticker rendered red via TickerMark.
                const showTicker = row.kind === 'buy' || row.kind === 'sell' || row.kind === 'mint';
                const heroText =
                  row.kind === 'buy'  ? `Bought ${frag} ` :
                  row.kind === 'sell' ? `Sold ${frag} ` :
                  row.kind === 'mint' ? `Minted ${frag ? frag + ' ' : ''}` :
                  row.kind === 'send' ? `Sent ${cashLabel}` :
                                        `Received ${cashLabel}`;

                // Sub line: counterparty (plain transfers) + date, muted.
                const subParts: string[] = [];
                if (row.kind === 'send' && row.counterparty) subParts.push(`To ${shortAddr0x(row.counterparty)}`);
                if (row.kind === 'receive' && row.counterparty) subParts.push(`From ${shortAddr0x(row.counterparty)}`);
                if (row.date) subParts.push(row.date);

                // Right ledger value: signed $; sell/receive green, buy/send neutral, mint CREATED.
                const positive = row.kind === 'sell' || row.kind === 'receive';
                const rightVal = usdAbs ?? (cashLabel || '');
                const rightText = row.kind === 'mint'
                  ? 'CREATED'
                  : rightVal ? `${positive ? '+' : '−'}${rightVal}` : '';
                const rightColor = row.kind === 'mint' ? '#5a5a5a' : positive ? '#4ade80' : '#ffffff';

                return (
                  <div
                    key={row.hash + i}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #141414" }}
                  >
                    {/* LEFT — tinted directional icon circle */}
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: cfg.tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 14, lineHeight: 1, color: cfg.color }}>{cfg.glyph}</span>
                    </div>

                    {/* MIDDLE — hero line + muted sub line */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...SKB, fontSize: 15, color: "#ffffff", margin: 0, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {heroText}
                        {showTicker && row.ticker && <TickerMark ticker={row.ticker} size={15} color="#ff4d4d" />}
                      </p>
                      <p style={{ ...SKR, fontSize: 12, color: "#5a5a5a", margin: "3px 0 0", lineHeight: 1 }}>
                        {subParts.join(" · ")}
                      </p>
                    </div>

                    {/* RIGHT — signed $ ledger value */}
                    <p style={{ ...SKB, fontSize: 14, color: rightColor, margin: 0, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums", letterSpacing: row.kind === 'mint' ? "0.08em" : 0 }}>
                      {rightText}
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
            <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", marginTop: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>SEND</span>
            <button
              onClick={() => setShowSend(false)}
              style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 'var(--fs-18)', lineHeight: 1, padding: 0, marginTop: 4 }}
            >×</button>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {sendStep === "sent" ? (
              /* TERMINAL — bracket state, then the sheet resolves itself. */
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-14)', color: "#FF0000", textTransform: "uppercase", letterSpacing: "0.12em" }}>{sentLabel}</span>
              </div>
            ) : sendStep === "sending" ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 180 }}>
                <FrameLoader size={23.5} />
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  SENDING · ${isFinite(sendUsdNum) ? sendUsdNum.toFixed(2) : ""}…
                </span>
              </div>
            ) : sendStep === "review" ? (
              /* THE REVIEW STEP — the sanctioned two-step (irreversible act). */
              <>
                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.5)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.12em" }}>REVIEW — SENDING</p>
                <p style={{ ...SKB, fontSize: 'var(--fs-22)', color: "white", margin: "0 0 2px", fontVariantNumeric: "tabular-nums" }}>${sendUsdNum.toFixed(2)}</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: "rgba(255,255,255,0.5)", margin: "0 0 16px" }}>
                  = {sendToken === "USDC" ? `${sendUsdNum.toFixed(2)} USDC` : `${(sendNativeNum ?? 0).toFixed(6)} ETH`}
                </p>
                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.5)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.12em" }}>TO</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: "white", margin: "0 0 16px", wordBreak: "break-all", lineHeight: 1.5 }}>{(() => { try { return getAddress(sendTo.trim()); } catch { return sendTo; } })()}</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.45)", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  EST. GAS {sendGasUsd != null ? `$${sendGasUsd.toFixed(4)}` : "$—"}
                </p>
                <div style={{ border: "1px solid rgba(255,0,0,0.55)", padding: "10px 12px", marginBottom: 16 }}>
                  <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#FF0000", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, lineHeight: 1.5 }}>
                    BASE NETWORK ONLY — funds sent to addresses on other networks are unrecoverable.
                  </p>
                </div>
                {sendError && <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: "#FF0000", margin: "0 0 12px", lineHeight: 1.4 }}>{sendError}</p>}
                <button onClick={doSend} style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", background: "#FF0000", border: "none", cursor: "pointer", padding: "13px", width: "100%", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  SEND · ${sendUsdNum.toFixed(2)}
                </button>
                <button onClick={() => { setSendStep("input"); setSendError(null); }} style={{ ...SKB, fontSize: 'var(--fs-10)', color: "rgba(255,255,255,0.5)", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", padding: "11px", width: "100%", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  BACK
                </button>
              </>
            ) : (
              /* INPUT — currencies only (no coin/piece transfers in v1). */
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  {(["ETH", "USDC"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => { setSendToken(t); setSendError(null); }}
                      style={{
                        ...SKB, fontSize: 'var(--fs-10)', background: "transparent",
                        border: `1px solid ${sendToken === t ? "white" : "rgba(255,255,255,0.3)"}`,
                        color: "white", opacity: sendToken === t ? 1 : 0.4,
                        cursor: "pointer", padding: "6px 16px", textTransform: "uppercase", letterSpacing: "0.06em",
                      }}
                    >{t}</button>
                  ))}
                </div>

                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", opacity: 0.5, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>TO</p>
                <input
                  type="text"
                  value={sendTo}
                  onChange={e => { setSendTo(e.target.value); setSendError(null); }}
                  placeholder="0x… wallet address (Base)"
                  style={{
                    ...SKR, fontSize: 'var(--fs-11)', color: "white", background: "transparent",
                    border: "none", borderBottom: "1px solid rgba(255,255,255,0.3)",
                    outline: "none", width: "100%", padding: "4px 0", marginBottom: 20,
                    boxSizing: "border-box",
                  }}
                />

                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", opacity: 0.5, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>AMOUNT · DOLLARS</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ ...SKB, fontSize: 'var(--fs-14)', color: sendAmount ? "white" : "rgba(255,255,255,0.3)" }}>$</span>
                  <input
                    inputMode="decimal"
                    value={sendAmount}
                    onChange={e => { setSendAmount(e.target.value.replace(/[^0-9.]/g, "")); setSendError(null); }}
                    placeholder="0.00"
                    style={{
                      ...SKB, fontSize: 'var(--fs-14)', color: "white", background: "transparent",
                      border: "none", borderBottom: "1px solid rgba(255,255,255,0.3)",
                      outline: "none", flex: 1, padding: "4px 0", fontVariantNumeric: "tabular-nums",
                    }}
                  />
                  <button onClick={sendMax} style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", background: "transparent", border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", padding: "5px 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    MAX
                  </button>
                </div>
                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", opacity: 0.5, margin: "0 0 20px", textTransform: "uppercase" }}>
                  Available: {sendToken === "ETH"
                    ? `${parseFloat(ethBalance ?? "0").toFixed(4)} ETH${ethUsd != null ? ` ($${ethUsd})` : ""}`
                    : `${parseFloat(usdcBalance ?? "0").toFixed(2)} USDC`}
                </p>

                {sendError && <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: "#FF0000", margin: "0 0 12px", lineHeight: 1.4 }}>{sendError}</p>}

                <button
                  onClick={goReview}
                  style={{
                    ...SKB, fontSize: 'var(--fs-11)', color: "white", background: "transparent",
                    border: "1px solid white", cursor: "pointer", padding: "12px",
                    width: "100%", textTransform: "uppercase", letterSpacing: "0.06em",
                  }}
                >
                  REVIEW
                </button>
              </>
            )}
          </div>
        </div>
      </>

    </div>
  );
}
