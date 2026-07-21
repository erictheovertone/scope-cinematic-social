"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import DesktopWallet from '@/components/desktop/DesktopWallet';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useTitleDebugTap } from '@/components/ViewportDebug';
import { usePrivy, useFundWallet, useWallets } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { createWalletClient, custom, getAddress, parseEther, encodeFunctionData } from "viem";
import { publicClient, errInfo, quoteSwap } from "@/lib/zoraCoins";
import { getEthBalance, getUsdcBalance, getZoraBalance, getTransactionHistoryCached, invalidateTxHistory } from "@/lib/wallet";
import { useEconomy } from "@/components/EconomyProvider";
import TickerMark from "@/components/economy/TickerMark";
import FrameLoader from "@/components/FrameLoader";
import CollectSheetGate from "@/components/economy/CollectSheetGate";
import type { Holding } from "@/lib/economy/types";
import { onTradeSettled } from "@/lib/economy/tradeEvents";
import { useCountUp } from "@/lib/economy/useCountUp";
import { groupActivity, shortAddr as shortAddr0x, type ActivityRow } from "@/lib/walletActivity";
import { supabase } from "@/lib/supabase/client";
import { getUserByPrivyId } from "@/lib/userService";
import { getEarnings, sumAll, type EarningsData } from "@/lib/economy/earnings";
import { feedImage } from "@/lib/mediaUrl";
import EarningsSheet from "@/components/economy/EarningsSheet";
import { LedgerCard, DottedLeader } from "@/components/Ledger";
import SwapSheet, { type SwapInitial } from "@/components/SwapSheet";
import ImportAssetSheet from "@/components/ImportAssetSheet";
import { getUserAssets, readAssetBalance, type UserAsset } from "@/lib/userAssets";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  const router = useRouter();
  const walletAddress = user?.wallet?.address ?? "";

  const isDesktop = useIsDesktop();
  const [activeTab, setActiveTab] = useState<"balances" | "holdings" | "earnings" | "activity">("balances");
  // ETH/USD via the boundary's single source; null = rate unavailable → "$—".
  const [ethUsdRate, setEthUsdRate] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  // ACTIVITY fetch state — failed is a REAL state now (429s used to read as
  // an empty history); the tab renders a retry instead of a false empty.
  const [txLoading, setTxLoading] = useState(false);
  const [txFailed, setTxFailed] = useState(false);
  // coin_address(lowercase) → ticker, from posts — the app's ticker source of truth,
  // so activity resolves real tickers (never a bare numeric on-chain symbol).
  const [coinTickers, setCoinTickers] = useState<Map<string, string>>(new Map());
  const [holdings, setHoldings] = useState<Holding[] | null>(null); // null = not loaded
  const [openHolding, setOpenHolding] = useState<Holding | null>(null);
  // SCOPE EARNINGS — historical cumulative from the session-cached /api/earnings
  // dataset. NEVER summed into TOTAL (it would double-count: much of it is
  // already held or spent). earnTarget goes 0 → allTime so the stat counts up
  // on wallet open (useCountUp lands the first value instantly by design).
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  // FIRST CUT REWARDS accruals (the COLLECTED category) — fetched when the
  // EARNINGS pane opens; per-post rows from the append-only fc_rewards ledger.
  type FcRewardPost = { postId: string; coinAddress: string; accruedUsd: number; unpaidUsd: number; ticker: string | null; thumb: string | null; layoutId: string | null };
  const [fcRewards, setFcRewards] = useState<{ posts: FcRewardPost[]; totalUsd: number; unpaidUsd: number } | null>(null);
  const [openCat, setOpenCat] = useState<'portfolio' | 'collected' | null>(null);
  const [earnTarget, setEarnTarget] = useState<number | null>(null);
  const [earnOpen, setEarnOpen] = useState(false);
  // Bell: unread MARKET (non-social) notifications → red dot; tap deep-links
  // the notifications page onto the MARKET tab (?tab=market).
  const [marketUnread, setMarketUnread] = useState(false);
  // Imported ERC-20 assets (user_assets + localStorage fallback) + balances.
  const [userUuid, setUserUuid] = useState<string | null>(null);
  const [importedAssets, setImportedAssets] = useState<(UserAsset & { balance: string | null })[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [addPressed, setAddPressed] = useState(false);
  const [logoPressed, setLogoPressed] = useState(false);
  const debugTap = useTitleDebugTap(); // Brief W2-1c — 5 rapid title taps toggle the viewport overlay
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  // Incoming-funds acknowledgment: { id } restarts the [ +$X ] pulse animation.
  const [fundPulse, setFundPulse] = useState<{ id: number; usd: number } | null>(null);
  // SEND v1 — CURRENCIES ONLY (ETH | USDC from AVAILABLE). No coin/piece
  // transfers: gifting pieces collides with First Cut HOLD-ALL provenance —
  // deferred as its own design question.
  const [showSend, setShowSend] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [swapInitial, setSwapInitial] = useState<SwapInitial | null>(null);
  // ZORA = the token every creator-fee stream pays in → the CREATOR EARNINGS
  // row. USD hero = a real full-balance ZORA→USDC quote (what a cash-out would
  // actually deliver), not a spot-price estimate.
  const [zoraBalance, setZoraBalance] = useState<string | null>(null);
  const [zoraUsd, setZoraUsd] = useState<number | null>(null);
  // PIXEL-QA overlay (?skin=1) — DEV ONLY, never ships: the exported Figma skin
  // at 50% over the live page for alignment work. NODE_ENV gate keeps it out of
  // production builds even if the query param is passed.
  const [skinOverlay, setSkinOverlay] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    setSkinOverlay(new URLSearchParams(window.location.search).get("skin") === "1");
  }, []);
  const [sendToken, setSendToken] = useState<"ETH" | "USDC">("ETH");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState(""); // DOLLARS
  const [sendStep, setSendStep] = useState<"input" | "review" | "sending" | "sent">("input");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendGasUsd, setSendGasUsd] = useState<number | null>(null);
  const [sentLabel, setSentLabel] = useState("");
  const GAS_RESERVE_ETH = 0.0002; // ETH MAX leaves this for gas

  // Pull-to-refresh — armed only when the gesture starts at scrollTop 0
  const touchStartY = useRef(0);
  const touchStartAtTop = useRef(false);
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

  // Mirrors holdings for non-render readers (fetchBalances gates its holdings
  // re-pull on "already loaded" without a stale closure).
  const holdingsRef = useRef<Holding[] | null>(null);
  holdingsRef.current = holdings;

  // THE one in-place holdings refresh (KEEP-LAST-GOOD merge — see the 60s
  // staleness block below for the rule). Both the interval and pull-to-refresh
  // land here: the list is never blanked, so it never unmounts and scroll
  // position survives every refresh.
  const mergeHoldingsInPlace = useCallback((next: Holding[]) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBalances = async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      // Transfers are NOT here anymore — they're the CU-expensive call, owned by
      // loadActivity (session-cached, refreshed on stale tab-open / retry).
      const [eth, usdc, zora, rate] = await Promise.all([
        getEthBalance(walletAddress),
        getUsdcBalance(walletAddress),
        getZoraBalance(walletAddress).catch(() => null),
        economy.getEthUsdRate(),
      ]);
      applyReadBalances(eth, usdc);
      if (zora != null) setZoraBalance(zora);
      setEthUsdRate(rate);
      // Holdings refresh IN PLACE — never setHoldings(null): blanking swapped the
      // list for LOADING… mid-scroll (unmount → scroll destroyed). First load is
      // owned by the holdings===null effect; a refresh merges over the live list.
      if (holdingsRef.current !== null) {
        economy.getHoldings()
          .then((next) => { if (mountedRef.current) mergeHoldingsInPlace(next); })
          .catch(() => {});
      }
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
      const [eth, usdc, zora] = await Promise.all([
        getEthBalance(walletAddress),
        getUsdcBalance(walletAddress),
        getZoraBalance(walletAddress).catch(() => null),
      ]);
      applyReadBalances(eth, usdc);
      if (zora != null) setZoraBalance(zora);
    } catch (e) {
      console.error("refreshAvailable error:", e);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [walletAddress]);

  // ACTIVITY loader — session-cached transfers; force bypasses the cache.
  // Honest failure: a rate-limited read renders the retry state, never a
  // false "no transactions".
  const loadActivity = useCallback(async (force = false) => {
    if (!walletAddress) return;
    setTxLoading(true); setTxFailed(false);
    try {
      const txs = await getTransactionHistoryCached(walletAddress, { force });
      if (mountedRef.current) setTxHistory(txs);
    } catch (e) {
      console.error("[wallet] activity load failed:", e);
      if (mountedRef.current) setTxFailed(true);
    } finally {
      if (mountedRef.current) setTxLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  // Fetch on wallet open; re-check when the ACTIVITY tab opens (the cache
  // answers instantly unless stale >2.5 min).
  useEffect(() => { loadActivity(); }, [loadActivity]);
  useEffect(() => { if (activeTab === "activity") loadActivity(); }, [activeTab, loadActivity]);

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
  // AVAILABLE + HOLDINGS, so both numbers exist from the start. This effect owns
  // the FIRST load only; every refresh merges in place (mergeHoldingsInPlace).
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

  // 120s BACKGROUND staleness (Change 4, slowed from 60s for CU economics —
  // nothing depended on the 60s cadence; post-trade freshness comes from the
  // reconcile path, not this timer): holdings never older than ~2 min. Light —
  // one batched getHoldings per tick (reuses the
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
        .then((next) => { if (mountedRef.current) mergeHoldingsInPlace(next); })
        .catch(() => {});
    }, 120_000);
    return () => clearInterval(id);
  }, [walletAddress, economy]);

  // SCOPE EARNINGS load — once per app session (getEarnings caches by uuid);
  // wallet re-opens read the cache. 0 → allTime two-step drives the count-up.
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const u = await getUserByPrivyId(user.id);
      if (!alive || !u) return;
      const data = await getEarnings(u.id);
      if (!alive || !data) return;
      setEarnings(data);
      setEarnTarget(0);
      requestAnimationFrame(() => { if (alive) setEarnTarget(sumAll(data.events)); });
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // Bell dot — any unread NON-social (market) notification. One head-count read.
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .eq("is_read", false)
      .not("type", "in", "(like,comment,follow,mention,reply)")
      .then(({ count }) => { if (alive) setMarketUnread((count ?? 0) > 0); });
    return () => { alive = false; };
  }, [user?.id]);

  // COLLECTED accruals load — on first EARNINGS-pane open (uuid via the same
  // verified path the earnings load uses).
  useEffect(() => {
    if (activeTab !== "earnings" || fcRewards !== null || !user?.id) return;
    let alive = true;
    (async () => {
      try {
        const u = await getUserByPrivyId(user.id);
        if (!u || !alive) return;
        const r = await fetch(`/api/fc-rewards?user=${u.id}`);
        const j = await r.json();
        if (alive) setFcRewards({ posts: j.posts ?? [], totalUsd: j.totalUsd ?? 0, unpaidUsd: j.unpaidUsd ?? 0 });
      } catch { if (alive) setFcRewards({ posts: [], totalUsd: 0, unpaidUsd: 0 }); }
    })();
    return () => { alive = false; };
  }, [activeTab, fcRewards, user?.id]);

  // Imported assets: resolve uuid once, load the list, then read balances via
  // the existing readContract pattern (balance-only rows; USD out of scope).
  useEffect(() => {
    if (!user?.id || !walletAddress) return;
    let alive = true;
    (async () => {
      const u = await getUserByPrivyId(user.id);
      if (!alive || !u) return;
      setUserUuid(u.id);
      const assets = await getUserAssets(u.id);
      if (!alive || assets.length === 0) return;
      setImportedAssets(assets.map((a) => ({ ...a, balance: null })));
      const withBalances = await Promise.all(
        assets.map(async (a) => ({ ...a, balance: await readAssetBalance(a, walletAddress as `0x${string}`) })),
      );
      if (alive) setImportedAssets(withBalances);
    })();
    return () => { alive = false; };
  }, [user?.id, walletAddress]);

  // CREATOR EARNINGS hero $ — a REAL full-balance ZORA→USDC quote (what a
  // cash-out delivers, price impact included), refreshed when the balance moves.
  useEffect(() => {
    const z = zoraBalance != null ? parseFloat(zoraBalance) : 0;
    if (!walletAddress || !(z > 0)) { setZoraUsd(null); return; }
    let alive = true;
    quoteSwap({ sell: "ZORA", buy: "USDC", amountIn: BigInt(Math.round(z * 1e6)) * BigInt(1e12), sender: walletAddress as `0x${string}` })
      .then(({ amountOut }) => { if (alive) setZoraUsd(Number(amountOut) / 1e6); })
      .catch(() => { if (alive) setZoraUsd(null); }); // quote down → "$—", never a fake number
    return () => { alive = false; };
  }, [walletAddress, zoraBalance]);

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
  // AVAILABLE = spendable ETH + USDC + held ZORA at CURRENT spot (zoraUsd —
  // the same real full-balance quote the CREATOR EARNINGS row shows; one
  // source). DISTINCTION: this is the current value of held TOKENS joining
  // the spendable sum — NOT the SCOPE EARNINGS stat (historical cumulative),
  // which stays separate and never sums into TOTAL.
  // HOLDINGS = positions value (price × pieces). TOTAL = the headline.
  const availableUsd =
    ethBalance != null && usdcBalance != null && ethUsdRate != null
      ? parseFloat(ethBalance) * ethUsdRate + parseFloat(usdcBalance) + (zoraUsd ?? 0)
      : null;
  // Rule 1: zero-trade coins are $0 by definition — valueUsd is always a number.
  const holdingsUsd = holdings != null ? holdings.reduce((s, h) => s + h.valueUsd, 0) : null;
  const totalNum = availableUsd != null ? availableUsd + (holdingsUsd ?? 0) : null;
  // TOTAL and AVAILABLE roll to new values (deposits, proceeds, holdings load).
  const animatedTotal = useCountUp(totalNum);
  const animatedAvailable = useCountUp(availableUsd);
  const animatedEarned = useCountUp(earnTarget); // 0 → allTime on wallet open (~700ms)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    // Pull-to-refresh is only armed when the gesture STARTS at the top of the
    // scroller — scrolling back up through the list must never read as a pull.
    touchStartAtTop.current = (containerRef.current?.scrollTop ?? 0) <= 0;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartAtTop.current) return;
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
      fetchBalances(); // AVAILABLE updates
      invalidateTxHistory(); loadActivity(true); // ACTIVITY picks the send up (fresh, not cached)
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

  // ── DESKTOP SEAM: ≥1024 renders the desktop wallet (its own component,
  // same services/session caches; mobile layout untouched below). ──
  if (isDesktop) return <DesktopWallet />;

  return (
    <div
      ref={containerRef}
      className="bg-black"
      style={{ position: "fixed", inset: 0, overflowY: "auto", color: "#E5E1DB", paddingBottom: "env(safe-area-inset-bottom, 0px)", ...(skinOverlay ? { width: 375, right: "auto" } : {}) }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* PIXEL-QA skin overlay — dev-only (?skin=1), 375 reference, 50%.
          Left-anchored (with the root pinned to 375 in skin mode) so alignment
          holds regardless of the actual viewport width. */}
      {skinOverlay && (
        <img
          src="/wallet-redux/wallet-redux-skin-ui.png"
          alt=""
          style={{ position: "fixed", top: 0, left: 0, width: 375, height: 812, opacity: 0.5, pointerEvents: "none", zIndex: 9999 }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: "#111", border: "1px solid rgba(229,225,219,0.15)",
          padding: "8px 16px", zIndex: 999,
        }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "#E5E1DB", textTransform: "uppercase" }}>{toast}</span>
        </div>
      )}

      {/* Header — the plain white logomark, straight into the balance card
          (no divider, per the Figma hero). Bell top-right above the card:
          red dot = unread MARKET notifications; tap → MARKET tab deep-link. */}
      {/* padding keeps total header height ~53 with the 44px tap target, so the
          balance card stays seated at y79 */}
      {/* Chrome (node 37:123): title top-left, truncated address + copy under it,
          logomark top-right (return-home). Bell kept beside the logomark so the
          market-notifications entry isn't stranded (frame shows only the mark). */}
      <div style={{ position: "relative", padding: "calc(10px + var(--safe-top)) 10px 6px" }}>
        <h1 onClick={debugTap} style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, lineHeight: 1, letterSpacing: "var(--track-display)", color: "var(--ink-100)", margin: 0 }}>
          Wallet
        </h1>
        {walletAddress && (
          <button
            onClick={() => navigator.clipboard.writeText(walletAddress).then(() => showToast("Address copied"))}
            aria-label="Copy wallet address"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "5px 0 0", margin: 0, cursor: "pointer" }}
          >
            <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 9.8, letterSpacing: "var(--track-body)", color: "rgba(229,225,219,0.5)" }}>
              {walletAddress.slice(0, 5)}<span style={{ letterSpacing: "0.18em" }}>...</span>{walletAddress.slice(-5)}
            </span>
            {/* double-square copy glyph (hairline) */}
            <span style={{ position: "relative", width: 11, height: 11, flexShrink: 0, display: "block" }}>
              <span style={{ position: "absolute", top: 0, left: 0, width: 7, height: 7, border: "0.5px solid rgba(229,225,219,0.5)" }} />
              <span style={{ position: "absolute", top: 3, left: 3, width: 7, height: 7, border: "0.5px solid rgba(229,225,219,0.5)" }} />
            </span>
          </button>
        )}
        {/* Brief 2.3a (N0c): logomark-only — the bell trigger is removed here; the
            /profile/notifications?tab=market route is unchanged, reached elsewhere. */}
        <div style={{ position: "absolute", top: "calc(4px + var(--safe-top))", right: 6, display: "flex", alignItems: "center" }}>
          <Link
            href="/"
            aria-label="Home"
            onPointerDown={() => setLogoPressed(true)}
            onPointerUp={() => setLogoPressed(false)}
            onPointerLeave={() => setLogoPressed(false)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "9px 6px", textDecoration: "none", outline: "none",
              transform: logoPressed ? "scale(0.92)" : "scale(1)", opacity: logoPressed ? 0.75 : 1,
              transition: "transform 120ms ease, opacity 120ms ease",
            }}
          >
            <img src="/design-updates-071526/scope-logomark-offwhite.png" alt="Scope" style={{ width: 39, height: "auto", objectFit: "contain", display: "block" }} />
          </Link>
        </div>
      </div>

      {/* ══ WALLET REDUX chrome (Figma 962:886 + 957:565) — chrome only ══ */}

      {/* TOTAL BALANCE card — 353×188 @ (12,79) at the 375 reference. AVAILABLE
          is what a purchase can draw on; HOLDINGS is position value; SCOPE
          EARNINGS is historical cumulative and NEVER part of TOTAL. */}
      {/* ASPECT-LOCKED to the asset (353/188) so the chrome PNG scales uniformly
          at any width; interior spacing is %-of-width so content scales with it. */}
      {/* TOTAL BALANCE — ledger card (border variant). Hero amount is a MUST-BE-SEEN
          element (full opacity). Three dotted-leader rows draw from the SAME verified
          balance values as before (animatedAvailable / holdingsUsd / animatedEarned).
          RECEIPT-TRUE: presentation only — no fetch/refresh touched. */}
      <LedgerCard variant="border" radius={10} style={{ width: 236, maxWidth: "92%", margin: "22px auto 0", padding: "16px 22px 20px", boxSizing: "border-box" }}>
        <div style={{ position: "relative", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "rgba(229,225,219,0.6)", margin: 0, letterSpacing: "var(--track-body)" }}>
            Total Balance
          </p>
          {/* Incoming-funds mark — lands above the amount, then lifts away */}
          {fundPulse && (
            <span key={fundPulse.id} style={{ ...SKB, position: "absolute", left: 0, right: 0, top: 8, fontSize: 12.5, color: "#E5E1DB", letterSpacing: "0.08em", animation: "fundPulse 2.6s ease-out forwards", pointerEvents: "none" }}>
              [ +${fundPulse.usd.toFixed(2)} ]
            </span>
          )}
          <p style={{ margin: "8px 0 0", lineHeight: 1, whiteSpace: "nowrap" }}>
            <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 36, color: "var(--ink-100)", letterSpacing: "-1.8px", marginRight: "0.12em" }}>$</span>
            <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 36, color: "var(--ink-100)", letterSpacing: "-1.8px", fontVariantNumeric: "tabular-nums" }}>
              {loading && animatedTotal == null ? "…" : animatedTotal != null ? animatedTotal.toFixed(2) : "—"}
            </span>
          </p>
          <div style={{ width: 107, height: 1, background: "var(--hairline)", margin: "12px auto 0" }} />
          {/* Brief 2.3a: row pitch ~37px (gap 24 + ~13px row) — spacing grows below the
              hairline; the amount block above keeps its position. */}
          <div style={{ margin: "18px 0 0", display: "flex", flexDirection: "column", gap: 24 }}>
            {([
              { label: "Available", value: animatedAvailable, info: false, onClick: () => setActiveTab("balances") },
              { label: "Holdings", value: holdingsUsd, info: false, onClick: () => setActiveTab("holdings") },
              { label: "Earnings", value: animatedEarned, info: true, onClick: () => { if (earnings) setEarnOpen(true); } },
            ] as const).map((row) => (
              <div key={row.label} onClick={row.onClick} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 11.8, color: "rgba(229,225,219,0.75)", letterSpacing: "var(--track-body)", whiteSpace: "nowrap" }}>{row.label}</span>
                  {row.info && (
                    <span aria-hidden style={{ width: 8, height: 8, border: "0.5px solid rgba(229,225,219,0.5)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "flex-start", transform: "translateY(-2px)" }}>
                      <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 6, lineHeight: 1, color: "rgba(229,225,219,0.6)" }}>i</span>
                    </span>
                  )}
                </span>
                <DottedLeader />
                <span style={{ display: "inline-flex", alignItems: "baseline", flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 13, color: "rgba(229,225,219,0.79)", marginRight: "0.14em" }}>$</span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "rgba(229,225,219,0.79)", fontVariantNumeric: "tabular-nums" }}>{row.value != null ? row.value.toFixed(2) : "—"}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </LedgerCard>

      {/* ACTION CARDS — DEPOSIT · SWAP · SEND, ledger gradient variant (node 37:123).
          Thin-stroke arrow glyphs: down / swap-pair / up-right. Tap behaviors
          (fundWallet / swap sheet / send sheet) unchanged. The full-address copy now
          lives in the header, so the old DIRECT DEPOSIT bar is retired. */}
      <div style={{ display: "flex", gap: 10, margin: "18px 10px 0" }}>
        {([
          { label: "DEPOSIT", sub: "Add funds to your wallet", onClick: () => walletAddress && fundWallet(walletAddress, { chain: base }) },
          { label: "SWAP", sub: "Convert money on scope", onClick: () => setShowSwap(true) },
          { label: "SEND", sub: "Send to any address", onClick: () => setShowSend(true) },
        ] as const).map((card) => (
          <LedgerCard
            key={card.label}
            variant="gradient"
            radius={6}
            role="button"
            tabIndex={0}
            onClick={card.onClick}
            style={{ flex: 1, aspectRatio: "112 / 105", cursor: "pointer", display: "flex", flexDirection: "column", padding: "12px 11px 12px", boxSizing: "border-box", overflow: "hidden" }}
          >
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, letterSpacing: "var(--track-display)", color: "rgba(229,225,219,0.67)", textTransform: "uppercase" }}>{card.label}</span>
            <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 9.5, color: "rgba(229,225,219,0.43)", letterSpacing: "var(--track-body)", marginTop: 3, lineHeight: 1.2 }}>{card.sub}</span>
            {/* Brief W2 §4 — arrows CENTERED in the lower zone (justifyContent center, was
                left-tucked) + ~25% larger + house-family stroke (1 → 1.3, reads consistent
                with the BottomToolbar icon weight at this enlarged size). */}
            <span style={{ marginTop: "auto", display: "flex", justifyContent: "center" }}>
              {card.label === "DEPOSIT" && (
                <svg width="28" height="28" viewBox="0 0 22 22" fill="none" stroke="rgba(229,225,219,0.82)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="11" y1="3" x2="11" y2="18" /><path d="M5 12 L11 18 L17 12" />
                </svg>
              )}
              {card.label === "SWAP" && (
                <svg width="33" height="23" viewBox="0 0 26 18" fill="none" stroke="rgba(229,225,219,0.82)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6 H21 M17 2 L21 6 L17 10" /><path d="M23 12 H5 M9 8 L5 12 L9 16" />
                </svg>
              )}
              {card.label === "SEND" && (
                <svg width="25" height="25" viewBox="0 0 20 20" fill="none" stroke="rgba(229,225,219,0.82)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="4" y1="16" x2="15" y2="5" /><path d="M6 5 H15 V14" />
                </svg>
              )}
            </span>
          </LedgerCard>
        ))}
      </div>

      {/* SEGMENT ROW — Balances · Holdings · Earnings · Activity (node 37:123).
          Active = 4px dot at the left + --ink-100; inactive ~67%, no dot. The dot
          slot is always reserved (transparent when inactive) so switching doesn't
          shift the labels. EARNINGS pane + the info sheet behavior are unchanged. */}
      {/* Brief 2.3a: faint full-width rounded band (node 38:75, 355×32) around the
          row; gap actions→segment ~42px. Row content unchanged. */}
      <div style={{ margin: "42px 10px 0", background: "rgba(229,225,219,0.035)", borderRadius: 6, padding: "0 4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
          {(["balances", "holdings", "earnings", "activity"] as const).map(tab => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "9px 0", display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: active ? "var(--ink-100)" : "transparent", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 12, letterSpacing: "var(--track-body)", color: active ? "var(--ink-100)" : "rgba(229,225,219,0.67)" }}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — gap segment→panel ~28px */}
      <div style={{ padding: "28px 10px 16px 13px" }}>

        {/* BALANCES — the TOKEN PANEL: 352×190, GREY border (not red). Row
            hairlines at 45/95/145 inside (skin y521/571/621); two empty asset
            slots below USDC; ADD/IMPORT rides BELOW the panel. */}
        {activeTab === "balances" && (
          <>
          {/* BALANCES — ledger card (border variant, node 37:123). Rows retinted to
              the ledger language: 30px coin icon · ticker 75 Bold 12px · amount line
              10px 55 Roman wide-tracked · fiat value right-aligned ($ + 75 Bold).
              Full-width ivory-4% highlight on hover/press (.ledger-row). Padding is
              vertical-only so the highlight strip runs edge-to-edge. */}
          {/* Brief 2.3a: token rows at ~62px pitch with hairline separators + the new
              MONOCHROME 30px icon set (token-icons/, red Zora chip retired); fiat "$ N"
              spacing. Empty ruled rows fill the panel to ledger-paper; the ADD/IMPORT
              action is the FINAL ruled row (item 8 interim). Empty-row mechanism is
              LOCAL to the wallet (not in LedgerCard — it's a token-panel treatment). */}
          <LedgerCard variant="border" radius={10} style={{ padding: "0" }}>
            {/* ETH row */}
            <div className="ledger-row" style={{ position: "relative", display: "flex", alignItems: "center", height: 62, padding: "0 14px", boxSizing: "border-box", borderBottom: "1px solid var(--hairline)" }}>
              <img src="/design-updates-071526/token-icons/ethereum.png" alt="" style={{ width: 30, height: 30, objectFit: "contain", display: "block", flexShrink: 0, marginRight: 12 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, color: "rgba(229,225,219,0.74)", margin: 0, letterSpacing: "var(--track-body)" }}>ETHEREUM</p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 10, color: "rgba(229,225,219,0.74)", letterSpacing: "1.1px", margin: "2px 0 0" }}>
                  {loading && ethBalance == null ? "…" : `${parseFloat(ethBalance ?? "0").toFixed(4)} ETH`}
                </p>
              </div>
              <span style={{ display: "inline-flex", alignItems: "baseline", flexShrink: 0 }}>
                <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 13, color: "rgba(229,225,219,0.9)", marginRight: "0.14em" }}>$</span>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "rgba(229,225,219,0.9)", fontVariantNumeric: "tabular-nums" }}>{loading && ethUsd == null ? "…" : ethUsd ?? "—"}</span>
              </span>
            </div>

            {/* USDC row */}
            <div className="ledger-row" style={{ position: "relative", display: "flex", alignItems: "center", height: 62, padding: "0 14px", boxSizing: "border-box", borderBottom: "1px solid var(--hairline)" }}>
              <img src="/design-updates-071526/token-icons/usdc.png" alt="" style={{ width: 30, height: 30, objectFit: "contain", display: "block", flexShrink: 0, marginRight: 12 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, color: "rgba(229,225,219,0.74)", margin: 0, letterSpacing: "var(--track-body)" }}>USDC</p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 10, color: "rgba(229,225,219,0.74)", letterSpacing: "1.1px", margin: "2px 0 0" }}>
                  {loading && usdcBalance == null ? "…" : `${parseFloat(usdcBalance ?? "0").toFixed(2)} USDC`}
                </p>
              </div>
              <span style={{ display: "inline-flex", alignItems: "baseline", flexShrink: 0 }}>
                <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 13, color: "rgba(229,225,219,0.9)", marginRight: "0.14em" }}>$</span>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "rgba(229,225,219,0.9)", fontVariantNumeric: "tabular-nums" }}>{loading && usdcUsd == null ? "…" : usdcUsd ?? "0.00"}</span>
              </span>
            </div>

            {/* CREATOR — the ZORA balance (creator-earnings framing). One tap →
                prefilled ZORA→USDC CASH OUT. Hidden until earned. */}
            {zoraBalance != null && parseFloat(zoraBalance) > 0 && (
              <div
                className="ledger-row"
                // floor to 0.01 — toFixed(4) ROUNDED (up) past the balance → overMax blocked the swap
                onClick={() => { setSwapInitial({ sell: "ZORA", buy: "USDC", amount: (Math.floor(parseFloat(zoraBalance) * 100) / 100).toFixed(2), cashOut: true }); setShowSwap(true); }}
                style={{ position: "relative", display: "flex", alignItems: "center", height: 62, padding: "0 14px", boxSizing: "border-box", borderBottom: "1px solid var(--hairline)", cursor: "pointer" }}
              >
                <img src="/design-updates-071526/token-icons/creator.png" alt="" style={{ width: 30, height: 30, objectFit: "contain", display: "block", flexShrink: 0, marginRight: 12 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, color: "rgba(229,225,219,0.74)", margin: 0, letterSpacing: "var(--track-body)" }}>CREATOR</p>
                  <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 10, color: "rgba(229,225,219,0.74)", letterSpacing: "1.1px", margin: "2px 0 0" }}>
                    {parseFloat(zoraBalance) >= 1000 ? Math.round(parseFloat(zoraBalance)).toLocaleString() : parseFloat(zoraBalance).toFixed(2)} ZORA
                  </p>
                </div>
                <span style={{ display: "inline-flex", alignItems: "baseline", flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 13, color: "rgba(229,225,219,0.9)", marginRight: "0.14em" }}>$</span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "rgba(229,225,219,0.9)", fontVariantNumeric: "tabular-nums" }}>{zoraUsd != null ? zoraUsd.toFixed(2) : "—"}</span>
                </span>
              </div>
            )}

            {/* Imported ERC-20 rows — same shape; balance-only when unpriced. */}
            {importedAssets.map((a) => (
              <div key={a.address} className="ledger-row" style={{ position: "relative", display: "flex", alignItems: "center", height: 62, padding: "0 14px", boxSizing: "border-box", borderBottom: "1px solid var(--hairline)" }}>
                <span style={{ width: 30, height: 30, flexShrink: 0, marginRight: 12, borderRadius: "50%", background: "#141414", border: "0.5px solid rgba(229,225,219,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ ...SKB, fontSize: 13.5, color: "#E5E1DB", opacity: 0.8 }}>{a.symbol.slice(0, 1)}</span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, color: "rgba(229,225,219,0.74)", margin: 0, letterSpacing: "var(--track-body)" }}>{a.symbol}</p>
                  <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 10, color: "rgba(229,225,219,0.74)", letterSpacing: "1.1px", margin: "2px 0 0" }}>
                    {a.balance != null ? `${a.balance} ${a.symbol}` : "…"}
                  </p>
                </div>
                <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 12, color: "rgba(229,225,219,0.37)", flexShrink: 0 }}>$—</span>
              </div>
            ))}

            {/* Empty ledger rows — the panel reads as ruled paper (item 2). */}
            {[0, 1].map((i) => (
              <div key={`empty-${i}`} style={{ height: 62, borderBottom: "1px solid var(--hairline)" }} />
            ))}

            {/* + ADD / IMPORT — the FINAL ruled row (item 8, interim). Quiet 10px
                65 Medium ~45%; press-pop → the import sheet. Behavior unchanged. */}
            <button
              onClick={() => setShowImport(true)}
              onPointerDown={() => setAddPressed(true)}
              onPointerUp={() => setAddPressed(false)}
              onPointerLeave={() => setAddPressed(false)}
              className="ledger-row"
              style={{ display: "flex", alignItems: "center", width: "100%", height: 62, padding: "0 14px", boxSizing: "border-box", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ fontFamily: "var(--font-medium)", fontWeight: 500, fontSize: 10, color: "rgba(229,225,219,0.45)", letterSpacing: "var(--track-body)", textTransform: "uppercase", opacity: addPressed ? 0.75 : 1 }}>
                + ADD / IMPORT ASSET
              </span>
            </button>
          </LedgerCard>
          </>
        )}

        {/* HOLDINGS — the ownership ledger: every Scope coin held, OWN posts
            included (allocation + backing). Dollars lead; null price → "$—". */}
        {activeTab === "holdings" && (
          holdings === null ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "30vh" }}>
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "rgba(229,225,219,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>LOADING…</p>
            </div>
          ) : holdings.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "30vh" }}>
              <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: "#E5E1DB", opacity: 0.5, textAlign: "center", lineHeight: 1.6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                No coin holdings yet
              </p>
            </div>
          ) : (
            <div>
              {/* Total holdings value — austere, dollars. "+" marks unpriced pools. */}
              <div style={{ borderBottom: "1px solid #E5E1DB", padding: "4px 0 14px", marginBottom: 14 }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-7)', color: "rgba(229,225,219,0.4)", textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 6px" }}>HOLDINGS VALUE</p>
                <p style={{ ...SKB, fontSize: 'var(--fs-26)', color: "#E5E1DB", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  ${holdings.reduce((s, h) => s + h.valueUsd, 0).toFixed(2)}
                </p>
              </div>
              {holdings.map((h) => (
                <div
                  key={h.postId}
                  onClick={() => setOpenHolding(h)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid rgba(229,225,219,0.07)", cursor: "pointer" }}
                >
                  {h.thumbUrl
                    ? <img src={h.thumbUrl} alt="" style={{ width: 44, height: 30, objectFit: "cover", flexShrink: 0, background: "#111" }} />
                    : <div style={{ width: 44, height: 30, background: "#111", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {h.ticker ? <TickerMark ticker={h.ticker} size={13.5} /> : <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "rgba(229,225,219,0.4)" }}>—</span>}
                    <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(229,225,219,0.45)", margin: "3px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {h.pieces.toLocaleString()} {h.pieces === 1 ? "FRAGMENT" : "FRAGMENTS"}
                    </p>
                  </div>
                  <span style={{ ...SKB, fontSize: 'var(--fs-13)', color: "#E5E1DB", fontVariantNumeric: "tabular-nums" }}>
                    {`$${h.valueUsd.toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {/* SCOPE EARNINGS detail sheet — reads the same session-cached dataset. */}
        {earnOpen && earnings && (
          <EarningsSheet data={earnings} onClose={() => setEarnOpen(false)} />
        )}

        {/* IMPORT ASSET — address-paste ERC-20 → balances list */}
        <ImportAssetSheet
          visible={showImport}
          onClose={() => setShowImport(false)}
          userUuid={userUuid}
          onAdded={(a) => {
            setImportedAssets((prev) => [...prev, { ...a, balance: null }]);
            if (walletAddress) {
              readAssetBalance(a, walletAddress as `0x${string}`).then((b) =>
                setImportedAssets((prev) => prev.map((x) => (x.address === a.address ? { ...x, balance: b } : x))),
              );
            }
            showToast(`${a.symbol} added`);
          }}
        />

        {/* SWAP — ETH ⇄ USDC (receipt-true engine; wallet re-reads balances
            through refreshAvailable's floor discipline after a landed swap). */}
        <SwapSheet
          visible={showSwap}
          onClose={() => { setShowSwap(false); setSwapInitial(null); }}
          ethBalance={ethBalance != null ? parseFloat(ethBalance) : 0}
          usdcBalance={usdcBalance != null ? parseFloat(usdcBalance) : 0}
          zoraBalance={zoraBalance != null ? parseFloat(zoraBalance) : 0}
          initial={swapInitial}
          onSwapped={() => { refreshAvailable(); }}
        />

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
        {/* EARNINGS — the detail view (the ⓘ sheet stays the summary+chart).
            Two categories: PORTFOLIO (creator fees per post — the SAME decoded
            events as SCOPE EARNINGS, so totals match to the cent) and COLLECTED
            (First Cut reward accruals per FC-held post + position value).
            Brand: earnings-sheet language — hairlines, SK-Modernist, money-
            green for received, muted for accrued-unpaid. */}
        {activeTab === "earnings" && (() => {
          const green = '#00E08A';
          const portfolioTotal = earnings ? sumAll(earnings.events) : null;
          const byPost = earnings?.byPost ?? [];
          const held = new Map((holdings ?? []).map((h) => [h.postId, h]));
          const catHeader = (label: string, total: string, open: boolean, onTap: () => void, sub?: string) => (
            <button onClick={onTap} style={{ display: 'flex', width: '100%', alignItems: 'baseline', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 2px 12px' }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {sub && <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sub}</span>}
                <span style={{ ...SKB, fontSize: 'var(--fs-13)', color: green, fontVariantNumeric: 'tabular-nums' }}>{total}</span>
                <span style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.4)' }}>{open ? '−' : '+'}</span>
              </span>
            </button>
          );
          const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px' };
          const thumbStyle: React.CSSProperties = { width: 44, height: 28, objectFit: 'cover', display: 'block', background: '#111', flexShrink: 0 };
          return (
            <div>
              {/* ── PORTFOLIO — creator fees, per post ── */}
              {catHeader('PORTFOLIO', portfolioTotal != null ? `$${portfolioTotal.toFixed(2)}` : '…', openCat === 'portfolio', () => setOpenCat(openCat === 'portfolio' ? null : 'portfolio'), 'CREATOR FEES')}
              <div style={{ height: 1, background: 'rgba(229,225,219,0.12)' }} />
              {openCat === 'portfolio' && (
                byPost.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '12px 2px' }}>
                    {earnings ? 'NO CREATOR FEES YET — FEES ACCRUE ON EVERY COLLECT & TRADE OF YOUR WORK' : 'LOADING…'}
                  </p>
                ) : byPost.map((p) => (
                  <div key={p.postId} style={rowStyle}>
                    {p.thumb ? <img src={feedImage(p.thumb, 96)} alt="" style={thumbStyle} /> : <div style={thumbStyle} />}
                    <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#E5E1DB', textTransform: 'uppercase', flex: 1 }}>{p.ticker ? `[ ${p.ticker} ]` : '—'}</span>
                    <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: green, fontVariantNumeric: 'tabular-nums' }}>${p.usd.toFixed(2)}</span>
                  </div>
                ))
              )}

              {/* ── COLLECTED — First Cut rewards, per FC-held post ── */}
              {catHeader('COLLECTED', fcRewards ? `$${fcRewards.totalUsd.toFixed(2)}` : '…', openCat === 'collected', () => setOpenCat(openCat === 'collected' ? null : 'collected'), fcRewards && fcRewards.unpaidUsd > 0.005 ? `$${fcRewards.unpaidUsd.toFixed(2)} PENDING` : 'FIRST CUT REWARDS')}
              <div style={{ height: 1, background: 'rgba(229,225,219,0.12)' }} />
              {openCat === 'collected' && (
                !fcRewards || fcRewards.posts.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '12px 2px' }}>
                    {fcRewards ? 'NO FIRST CUT REWARDS YET — HOLD A FIRST CUT AND EARN FROM EVERY TRADE' : 'LOADING…'}
                  </p>
                ) : (
                  <>
                    {fcRewards.unpaidUsd > 0.005 && (
                      /* copy DRAFT — Eric approves before ship */
                      <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 2px 0' }}>
                        ${fcRewards.unpaidUsd.toFixed(2)} ACCRUED · PAYS OUT WEEKLY
                      </p>
                    )}
                    {fcRewards.posts.map((p) => {
                      const pos = held.get(p.postId);
                      return (
                        <div key={p.postId} style={rowStyle}>
                          {p.thumb ? <img src={feedImage(p.thumb, 96)} alt="" style={thumbStyle} /> : <div style={thumbStyle} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#E5E1DB', textTransform: 'uppercase', display: 'block' }}>{p.ticker ? `[ ${p.ticker} ]` : '—'}</span>
                            <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {pos ? `POSITION $${pos.valueUsd.toFixed(2)}` : 'POSITION EXITED'}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {/* PAID portion in money-green; a muted pending sub-line
                                when unpaid accruals exist on this post. */}
                            <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: p.accruedUsd - p.unpaidUsd > 0.005 ? green : 'rgba(229,225,219,0.75)', fontVariantNumeric: 'tabular-nums', display: 'block' }}>${p.accruedUsd.toFixed(2)}</span>
                            {p.unpaidUsd > 0.005 && <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums' }}>· ${p.unpaidUsd.toFixed(2)} PENDING</span>}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )
              )}
            </div>
          );
        })()}

        {activeTab === "activity" && (
          <div>
            {txLoading && activityRows.length === 0 ? (
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "#E5E1DB", opacity: 0.4, textAlign: "center", marginTop: 40, textTransform: "uppercase" }}>Loading…</p>
            ) : txFailed && activityRows.length === 0 ? (
              /* HONEST FAILURE — a rate-limited read is not an empty history. */
              <button
                onClick={() => loadActivity(true)}
                style={{ display: "block", width: "100%", background: "transparent", border: "1px solid rgba(229,225,219,0.55)", cursor: "pointer", padding: "13px 0", marginTop: 40 }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Couldn&rsquo;t load activity — tap to retry
                </span>
              </button>
            ) : activityRows.length === 0 ? (
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "#E5E1DB", opacity: 0.4, textAlign: "center", marginTop: 40, textTransform: "uppercase" }}>No transactions yet</p>
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
                  buy:     { tint: 'rgba(229,225,219,0.10)',     glyph: '↓', color: '#ff4d4d' },
                  sell:    { tint: 'rgba(74,222,128,0.10)',  glyph: '↑', color: '#4ade80' },
                  mint:    { tint: 'rgba(229,225,219,0.06)', glyph: '✦', color: '#888888' },
                  receive: { tint: 'rgba(74,222,128,0.10)',  glyph: '↓', color: '#4ade80' },
                  send:    { tint: 'rgba(229,225,219,0.10)',     glyph: '↑', color: '#ff4d4d' },
                } as const)[row.kind];

                // Hero verb + amount (white); ticker rendered red via TickerMark.
                const showTicker = row.kind === 'buy' || row.kind === 'sell' || row.kind === 'mint';
                const heroText =
                  row.kind === 'buy'  ? `Bought${frag ? ' ' + frag : ''}` :
                  row.kind === 'sell' ? `Sold${frag ? ' ' + frag : ''}` :
                  row.kind === 'mint' ? `Minted${frag ? ' ' + frag : ''}` :
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
                const rightColor = row.kind === 'mint' ? '#5a5a5a' : positive ? '#4ade80' : '#E5E1DB';

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
                      <p style={{ ...SKB, fontSize: 15, color: "#E5E1DB", margin: 0, lineHeight: 1.25, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {heroText}
                        {showTicker && row.ticker && (
                          <span style={{ marginLeft: 10 }}>
                            <TickerMark ticker={row.ticker} size={17} color="#E5E1DB" />
                          </span>
                        )}
                      </p>
                      <p style={{ ...SKR, fontSize: 12, color: "#5a5a5a", margin: "3px 0 0", lineHeight: 1, textTransform: "uppercase" }}>
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
            backgroundColor: "#0a0a0a", borderTop: "1px solid rgba(229,225,219,0.1)",
            zIndex: 301, display: "flex", flexDirection: "column",
            transform: showSend ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {/* Header */}
          <div style={{ flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 16px 8px" }}>
            <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 40, height: 2, backgroundColor: "rgba(229,225,219,0.2)" }} />
            <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "#E5E1DB", marginTop: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>SEND</span>
            <button
              onClick={() => setShowSend(false)}
              style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#E5E1DB", fontSize: 'var(--fs-18)', lineHeight: 1, padding: 0, marginTop: 4 }}
            >×</button>
          </div>
          <div style={{ height: 1, background: "rgba(229,225,219,0.08)" }} />

          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {sendStep === "sent" ? (
              /* TERMINAL — bracket state, then the sheet resolves itself. */
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-14)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.12em" }}>{sentLabel}</span>
              </div>
            ) : sendStep === "sending" ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 180 }}>
                <FrameLoader size={23.5} />
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  SENDING · ${isFinite(sendUsdNum) ? sendUsdNum.toFixed(2) : ""}…
                </span>
              </div>
            ) : sendStep === "review" ? (
              /* THE REVIEW STEP — the sanctioned two-step (irreversible act). */
              <>
                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(229,225,219,0.5)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.12em" }}>REVIEW — SENDING</p>
                <p style={{ ...SKB, fontSize: 'var(--fs-22)', color: "#E5E1DB", margin: "0 0 2px", fontVariantNumeric: "tabular-nums" }}>${sendUsdNum.toFixed(2)}</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: "rgba(229,225,219,0.5)", margin: "0 0 16px" }}>
                  = {sendToken === "USDC" ? `${sendUsdNum.toFixed(2)} USDC` : `${(sendNativeNum ?? 0).toFixed(6)} ETH`}
                </p>
                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(229,225,219,0.5)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.12em" }}>TO</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: "#E5E1DB", margin: "0 0 16px", wordBreak: "break-all", lineHeight: 1.5 }}>{(() => { try { return getAddress(sendTo.trim()); } catch { return sendTo; } })()}</p>
                <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(229,225,219,0.45)", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  EST. GAS {sendGasUsd != null ? `$${sendGasUsd.toFixed(4)}` : "$—"}
                </p>
                <div style={{ border: "1px solid rgba(229,225,219,0.55)", padding: "10px 12px", marginBottom: 16 }}>
                  <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, lineHeight: 1.5 }}>
                    BASE NETWORK ONLY — funds sent to addresses on other networks are unrecoverable.
                  </p>
                </div>
                {sendError && <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: "#E5E1DB", margin: "0 0 12px", lineHeight: 1.4 }}>{sendError}</p>}
                <button onClick={doSend} style={{ ...SKB, fontSize: 'var(--fs-11)', color: "#E5E1DB", background: "#E5E1DB", border: "none", cursor: "pointer", padding: "13px", width: "100%", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  SEND · ${sendUsdNum.toFixed(2)}
                </button>
                <button onClick={() => { setSendStep("input"); setSendError(null); }} style={{ ...SKB, fontSize: 'var(--fs-10)', color: "rgba(229,225,219,0.5)", background: "transparent", border: "1px solid rgba(229,225,219,0.15)", cursor: "pointer", padding: "11px", width: "100%", textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
                        border: `1px solid ${sendToken === t ? "#E5E1DB" : "rgba(229,225,219,0.3)"}`,
                        color: "#E5E1DB", opacity: sendToken === t ? 1 : 0.4,
                        cursor: "pointer", padding: "6px 16px", textTransform: "uppercase", letterSpacing: "0.06em",
                      }}
                    >{t}</button>
                  ))}
                </div>

                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", opacity: 0.5, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>TO</p>
                <input
                  type="text"
                  value={sendTo}
                  onChange={e => { setSendTo(e.target.value); setSendError(null); }}
                  placeholder="0x… wallet address (Base)"
                  style={{
                    ...SKR, fontSize: 'max(16px, var(--fs-11))', color: "#E5E1DB", background: "transparent",
                    border: "none", borderBottom: "1px solid rgba(229,225,219,0.3)",
                    outline: "none", width: "100%", padding: "4px 0", marginBottom: 20,
                    boxSizing: "border-box",
                  }}
                />

                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", opacity: 0.5, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>AMOUNT · DOLLARS</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ ...SKB, fontSize: 'var(--fs-14)', color: sendAmount ? "#E5E1DB" : "rgba(229,225,219,0.3)" }}>$</span>
                  <input
                    inputMode="decimal"
                    value={sendAmount}
                    onChange={e => { setSendAmount(e.target.value.replace(/[^0-9.]/g, "")); setSendError(null); }}
                    placeholder="0.00"
                    style={{
                      ...SKB, fontSize: 'max(16px, var(--fs-14))', color: "#E5E1DB", background: "transparent",
                      border: "none", borderBottom: "1px solid rgba(229,225,219,0.3)",
                      outline: "none", flex: 1, padding: "4px 0", fontVariantNumeric: "tabular-nums",
                    }}
                  />
                  <button onClick={sendMax} style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", background: "transparent", border: "1px solid rgba(229,225,219,0.3)", cursor: "pointer", padding: "5px 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    MAX
                  </button>
                </div>
                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "#E5E1DB", opacity: 0.5, margin: "0 0 20px", textTransform: "uppercase" }}>
                  Available: {sendToken === "ETH"
                    ? `${parseFloat(ethBalance ?? "0").toFixed(4)} ETH${ethUsd != null ? ` ($${ethUsd})` : ""}`
                    : `${parseFloat(usdcBalance ?? "0").toFixed(2)} USDC`}
                </p>

                {sendError && <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: "#E5E1DB", margin: "0 0 12px", lineHeight: 1.4 }}>{sendError}</p>}

                <button
                  onClick={goReview}
                  style={{
                    ...SKB, fontSize: 'var(--fs-11)', color: "#E5E1DB", background: "transparent",
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
