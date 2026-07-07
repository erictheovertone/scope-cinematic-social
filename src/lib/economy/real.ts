// ── Real economy reads (Stage A of the mock→real swap) ──────────────────────
//
// For COIN posts (coin_address present) getPostMarket returns REAL numbers.
// Source: OUR /api/market route (server-side batch + cache + Zora API key +
// 429 backoff) — tiles never call Zora from the browser (the 429+CORS storm).
// Returns tokenPrice.priceInUsdc (per base token; NULL for a no-trades pool)
// and uniqueHolders. The viewer's holding is read on-chain (ERC-20 balanceOf
// via our Base RPC) — pieces math: 1 piece = 100,000 base tokens (18 decimals).
//
// HONEST NO-TRADES STATE: a brand-new pool has no discovered price —
// priceUsd stays NULL (UI shows "—") and marketCap reads 0. No NaNs, no
// fabricated starting numbers.
//
// Everything else (First Cut provenance, Top 1k, earnings, quotes/trades)
// stays MOCK until the indexer / Stage B — this module delegates those to the
// mock so the preview-flag surfaces keep working unchanged.

import { createTradeCall } from "@zoralabs/coins-sdk";
import { formatEther, parseEther, getAddress } from "viem";
import { base } from "viem/chains";
import { supabase } from "@/lib/supabase/client";
import { mockEconomy, PIECE_SUPPLY, FOUNDING_AMOUNT } from "./mock";
import { publicClient, buyCoin, sellCoin } from "@/lib/zoraCoins";
import { getEthUsdRate } from "@/lib/coingecko";
import { TOKENS_PER_PIECE } from "./tokenomics";
import type { EconomyApi, PostMarket, Holding, BuyQuote, SellQuote, TradeCurrency, CollectResult, Badges } from "./types";

const BALANCE_OF_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ── BATCHED balance reads (CU economics) ──────────────────────────────────────
// ONE alchemy_getTokenBalances call for the whole coin set instead of N
// per-coin balanceOf reads (the per-token path was the wallet's biggest CU
// spender and fed the 429s that shed getAssetTransfers). Falls back to the old
// per-token readContract path if the batch endpoint errors (e.g. a non-Alchemy
// RPC) — correctness over economy, holdings never break on the optimization.
const RPC_URL = process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || "https://mainnet.base.org";
async function balancesFor(owner: string, contracts: string[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  const unique = [...new Set(contracts.map((c) => c.toLowerCase()))];
  if (!unique.length) return out;
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getTokenBalances", params: [owner, unique] }),
    }).then((r) => r.json());
    const list = res?.result?.tokenBalances;
    if (Array.isArray(list) && list.length) {
      for (const tb of list) {
        const hex = tb?.tokenBalance;
        if (typeof hex === "string" && hex.startsWith("0x") && hex.length > 2) {
          try { out.set(String(tb.contractAddress).toLowerCase(), BigInt(hex)); } catch { /* skip bad entry */ }
        }
      }
      if (out.size) return out;
    }
  } catch { /* fall through to per-token */ }
  await Promise.all(unique.map(async (c) => {
    try {
      const bal = (await publicClient.readContract({
        address: getAddress(c), abi: BALANCE_OF_ABI, functionName: "balanceOf", args: [owner as `0x${string}`],
      })) as bigint;
      out.set(c, bal);
    } catch { /* skip — this coin reads as 0 this tick */ }
  }));
  return out;
}

// postId → coin_address lookup (null = not a coin post). Tiny cache so feed
// scrolling doesn't re-query the same posts.
const coinAddrCache = new Map<string, string | null>();
async function coinAddressFor(postId: string): Promise<string | null> {
  if (coinAddrCache.has(postId)) return coinAddrCache.get(postId)!;
  const { data } = await supabase
    .from("posts")
    .select("coin_address, token_standard")
    .eq("id", postId)
    .maybeSingle();
  const addr =
    data?.coin_address && data?.token_standard === "coin" ? data.coin_address : null;
  coinAddrCache.set(postId, addr);
  return addr;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return isFinite(n) ? n : 0;
};

// Bust the SERVER /api/market cache for a just-traded coin so the next read
// serves fresh data, not the ≤45s pre-trade price. Best-effort: a failure just
// falls back to the normal TTL. The next GET re-reads through the hardened path.
async function bustServerMarket(coinAddress: string): Promise<void> {
  try {
    // Hard timeout so this best-effort read can NEVER hang resources. (Always called
    // fire-and-forget — never awaited in a trade path — so the trade can't wait on it.)
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    await fetch("/api/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bust: [coinAddress.toLowerCase()] }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch { /* timeout / abort / failure → fall back to the normal TTL */ }
}

// ── Market transport: /api/market (server-side batch/cache/key) ──────────────
//
// Tiles NEVER fetch Zora independently (the 429+CORS storm). getPostMarket
// calls within a 40ms window batch into ONE /api/market request; a short
// client cache absorbs re-mounts. The server route holds the Zora key, the
// upstream batching, the SWR cache, and the 429 backoff.
interface CoinRead {
  found: boolean;
  priceInUsdc: string | null;
  marketCap: string | null; // Zora's authoritative MC (USD) — see /api/market
  uniqueHolders: number;
  symbol: string | null;
}
const CLIENT_TTL_MS = 30_000;
const marketCache = new Map<string, { data: CoinRead; at: number }>();

// A settled trade invalidates the cached prices so the very next read (holdings
// refetch, MC chip) is post-trade fresh — not a stale cached value. It also pokes the
// Screening Room to recompute its ranking immediately (self-throttled single-flight),
// so buying into a post can move the leaderboard without waiting for the next view/cron.
if (typeof window !== "undefined") {
  import("./tradeEvents").then(({ onTradeSettled }) => onTradeSettled(() => {
    marketCache.clear();
    fetch("/api/screening-room/refresh", { method: "POST", keepalive: true }).catch(() => {});
  }));
}
let pendingAddrs = new Map<string, Array<(r: CoinRead) => void>>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function marketFor(coinAddress: string): Promise<CoinRead> {
  const addr = coinAddress.toLowerCase();
  const hit = marketCache.get(addr);
  // Only RESOLVED reads are cached (see the set below), so an unresolved miss is
  // never served from cache — a caller retry re-hits /api/market, which by then
  // has retried Zora and warmed up.
  if (hit && Date.now() - hit.at < CLIENT_TTL_MS) {
    return Promise.resolve(hit.data);
  }
  return new Promise((resolve) => {
    const list = pendingAddrs.get(addr) ?? [];
    list.push(resolve);
    pendingAddrs.set(addr, list);
    if (!batchTimer) {
      batchTimer = setTimeout(async () => {
        const batch = pendingAddrs;
        pendingAddrs = new Map();
        batchTimer = null;
        const addrs = [...batch.keys()];
        let markets: Record<string, CoinRead> = {};
        try {
          // CHUNK to ≤20 addresses/request: /api/market → getCoins caps at 20
          // ids ("max batch size is 20"). Sending all of a wallet's >20 holdings
          // in ONE request makes getCoins throw → EVERY coin returns found:false
          // → every holding reads $0 (the 60s-refresh collapse). One request per
          // ≤20 chunk; merge. Each chunk still rides the hardened /api/market.
          const CHUNK = 20;
          const groups: string[][] = [];
          for (let i = 0; i < addrs.length; i += CHUNK) groups.push(addrs.slice(i, i + CHUNK));
          const results = await Promise.all(
            groups.map((g) =>
              fetch(`/api/market?addresses=${g.join(",")}`)
                .then((r) => r.json())
                .catch((e) => { console.warn("[economy] market chunk failed:", (e as Error)?.message); return {}; })
            )
          );
          for (const res of results) Object.assign(markets, res?.markets ?? {});
        } catch (e) {
          console.warn("[economy] market read failed (serving empty):", (e as Error)?.message);
        }
        const now = Date.now();
        for (const [a, resolvers] of batch) {
          const data: CoinRead = markets[a] ?? { found: false, priceInUsdc: null, marketCap: null, uniqueHolders: 0, symbol: null };
          if (data.found) marketCache.set(a, { data, at: now }); // never cache an unresolved miss → retry re-fetches
          resolvers.forEach((r) => r(data));
        }
      }, 40);
    }
  });
}

async function realPostMarket(
  coinAddress: string,
  viewerAddress: string | null
): Promise<PostMarket> {
  const [token, viewerBalance] = await Promise.all([
    marketFor(coinAddress),
    viewerAddress
      ? publicClient
          .readContract({
            address: coinAddress as `0x${string}`,
            abi: BALANCE_OF_ABI,
            functionName: "balanceOf",
            args: [viewerAddress as `0x${string}`],
          })
          .catch(() => BigInt(0))
      : Promise.resolve(BigInt(0)),
  ]);

  // FRESH-COIN GRACE: a just-created coin may be missing from Zora's index for
  // a short window — that's the honest "market opening" state (price —,
  // MC $0.00), NEVER an error. The short client retry window re-checks it.

  // priceInUsdc is per BASE TOKEN; a piece is 100,000 tokens. NULL price
  // (no trades yet) stays null — the UI shows "—".
  const perToken = token.priceInUsdc;
  const priceUsd =
    perToken != null && isFinite(parseFloat(perToken))
      ? parseFloat(perToken) * TOKENS_PER_PIECE
      : null;

  // Viewer pieces: balance (wei) → tokens → pieces, floored.
  const viewerTokens = parseFloat(formatEther(viewerBalance as bigint));
  const collectedByViewer = Math.floor(viewerTokens / TOKENS_PER_PIECE);

  // MARKET CAP: use Zora's authoritative `marketCap` field — the SAME value the
  // Screening Room ranks by, so the feed corner and the room agree. Critically,
  // marketCap is populated from pool state even when no swap price has been
  // discovered yet, so it does NOT collapse to $0.00 the way price × supply does
  // when priceInUsdc is null (the bug: a live coin reading "MC: $0.00"). Falls
  // back to the price-derived value only if the field is genuinely absent; a
  // truly empty pool stays 0 (honest "market opening").
  const mcField =
    token.marketCap != null && isFinite(parseFloat(token.marketCap))
      ? parseFloat(token.marketCap)
      : null;
  const mcUsd = mcField ?? (priceUsd != null ? priceUsd * PIECE_SUPPLY : 0);

  return {
    priceUsd,
    mcUsd,
    live: true,
    // False when /api/market couldn't resolve this coin yet (transient — a 429
    // burst). The corner/lightbox treat this as "retry shortly", NOT as a $0
    // market. A genuinely untraded coin resolves with found:true + marketCap 0.
    marketResolved: token.found,
    supply: PIECE_SUPPLY,
    holders: num(token.uniqueHolders),
    collectedByViewer,
    foundingAmount: FOUNDING_AMOUNT,
    // No indexer yet: founding/provenance unknown — empty, never fabricated.
    // (The provenance UI is preview-flag-gated until the indexer lands.)
    viewerFounding: false,
    firstCut: { slots: [], openCount: 10 },
  };
}

/**
 * The Stage-A boundary implementation: real reads for coin posts, mock for
 * everything else. `viewerAddress` (the Privy wallet) enables the real
 * "you hold N pieces" read; null viewer just reads 0.
 */
export function createRealEconomy(
  viewerAddress: string | null,
  /** Provider-injected: builds a signing wallet client at trade time. */
  getWalletClient?: () => Promise<any>
): EconomyApi {
  // First Cut ACTIVE coins = unreleased bookkeeping rows JOINED against the
  // live on-chain balance — the balance is the truth, expired_at is the
  // bookkeeping (which the sell hook + daily cron keep converging). Threshold:
  // ≥1 whole fragment — in-app "sell all" leaves sub-fragment DUST, so a
  // strict >0 join would have kept the stale badge this fix removes.
  // FAIL-OPEN per read: an unresolved balance counts the row (a flaky RPC
  // must never falsely hide a badge — the false-revocation discipline).
  const firstCutActiveCoins = async (userId: string): Promise<string[]> => {
      let res = await supabase
        .from("first_cut_awards")
        .select("coin_address")
        .eq("user_id", userId)
        .is("expired_at", null);
      if (res.error) {
        res = await supabase.from("first_cut_awards").select("coin_address").eq("user_id", userId);
      }
      const coins = (res.data ?? [])
        .map((row: { coin_address?: string | null }) => (row.coin_address ?? "").toLowerCase())
        .filter(Boolean);
      if (coins.length === 0) return [];
      const { data: u } = await supabase.from("users").select("wallet_address").eq("id", userId).maybeSingle();
      const wallet = u?.wallet_address;
      if (!wallet) return coins; // no wallet resolvable → bookkeeping stands (fail-open)
      const MIN_HOLD = BigInt(TOKENS_PER_PIECE) * BigInt('1000000000000000000'); // 1 whole fragment, raw units
      const checks = await Promise.all(coins.map(async (c) => {
        try {
          const bal = (await publicClient.readContract({
            address: getAddress(c), abi: BALANCE_OF_ABI, functionName: "balanceOf", args: [getAddress(wallet)],
          })) as bigint;
          return bal >= MIN_HOLD;
        } catch { return true; } // unresolved read → keep (never falsely hide)
      }));
      return coins.filter((_, i) => checks[i]);
  };

  return {
    ...mockEconomy,
    async getPostMarket(postId: string): Promise<PostMarket> {
      const coinAddress = await coinAddressFor(postId);
      if (!coinAddress) return mockEconomy.getPostMarket(postId);
      return realPostMarket(coinAddress, viewerAddress);
    },

    // FIRST CUT is authoritative: firstCutCount comes from the immutable
    // first_cut_awards table (one row per coin where the user is a first-10
    // founder), NOT the mock. >0 → the First Cut badge lights up. Other badge
    // flags still read from their own columns on the profile pages; this only
    // makes the First Cut signal real.

    async getBadges(userId: string): Promise<Badges> {
      const base = await mockEconomy.getBadges(userId).catch(() => ({} as Badges));
      // HOLDING-GATED by the balance join above — count = coins actually held.
      const active = await firstCutActiveCoins(userId).catch(() => [] as string[]);
      const firstCutCount = active.length;
      return { ...base, firstCutCount: firstCutCount > 0 ? firstCutCount : undefined };
    },

    // COLLECTED-tab insignia — the SAME balance-joined read as the badge count
    // (one source: mark and count cannot disagree).
    async getFirstCutCoins(userId: string): Promise<string[]> {
      return firstCutActiveCoins(userId);
    },

    // ── Stage B: real quotes + trades for coin posts (mock otherwise) ────────
    async quoteBuy(postId: string, usdAmount: number): Promise<BuyQuote> {
      const coinAddress = await coinAddressFor(postId);
      if (!coinAddress) return mockEconomy.quoteBuy(postId, usdAmount);
      const rate = await getEthUsdRate();
      if (rate === null) throw new Error("Dollar rate unavailable right now.");
      const ethAmount = usdAmount / rate;
      const quote: any = await createTradeCall({
        sell: { type: "eth" }, buy: { type: "erc20", address: getAddress(coinAddress) },
        amountIn: parseEther(ethAmount.toFixed(18)), slippage: 0.05,
        sender: (viewerAddress ?? "0x0000000000000000000000000000000000000001") as `0x${string}`,
      });
      const pieces = Math.floor(Number(BigInt(quote?.quote?.amountOut ?? 0)) / 1e23);
      return { usdAmount, pieces, ethAmount };
    },

    async quoteSell(postId: string, pieces: number): Promise<SellQuote> {
      const coinAddress = await coinAddressFor(postId);
      if (!coinAddress) return mockEconomy.quoteSell(postId, pieces);
      const rate = await getEthUsdRate();
      const quote: any = await createTradeCall({
        sell: { type: "erc20", address: getAddress(coinAddress) }, buy: { type: "eth" },
        amountIn: BigInt(Math.round(pieces)) * BigInt(100_000) * BigInt("1000000000000000000"),
        slippage: 0.05,
        sender: (viewerAddress ?? "0x0000000000000000000000000000000000000001") as `0x${string}`,
      });
      const ethAmount = Number(BigInt(quote?.quote?.amountOut ?? 0)) / 1e18;
      return { pieces, usdAmount: rate != null ? ethAmount * rate : 0, ethAmount };
    },

    async buy(postId: string, usdAmount: number, currency: TradeCurrency): Promise<CollectResult> {
      const coinAddress = await coinAddressFor(postId);
      if (!coinAddress) return mockEconomy.buy(postId, usdAmount, currency);
      if (!viewerAddress || !getWalletClient) throw new Error("Wallet not ready — try again in a moment.");
      const walletClient = await getWalletClient();
      const { hash, pieces } = await buyCoin({ walletClient, sender: getAddress(viewerAddress), coinAddress, usdAmount, currency });
      // FIRE-AND-FORGET — the trade is DONE the moment buyCoin confirms; never block
      // completion on a post-trade read (awaiting this hung the buy when /api/market
      // stalled). Freshness still happens, just off the critical path.
      void bustServerMarket(coinAddress);
      return { ok: true, pieces: pieces ?? 0, ref: hash };
    },

    async sell(postId: string, pieces: number, currency: TradeCurrency = "ETH"): Promise<CollectResult> {
      const coinAddress = await coinAddressFor(postId);
      if (!coinAddress) return mockEconomy.sell(postId, pieces);
      if (!viewerAddress || !getWalletClient) throw new Error("Wallet not ready — try again in a moment.");
      const walletClient = await getWalletClient();
      const r = await sellCoin({ walletClient, sender: getAddress(viewerAddress), coinAddress, pieces, currency });
      // FIRE-AND-FORGET (see buy) — never block trade completion on a post-trade read.
      void bustServerMarket(coinAddress);
      // Receipt-true: pieces and proceeds from the trade result, never estimates.
      return { ok: true, pieces: r.pieces ?? pieces, ref: r.hash, proceedsUsd: r.proceedsUsd };
    },

    // COLLECTED — posts where the GIVEN user holds >0 pieces, EXCLUDING their
    // own posts (ratified). Public by nature (on-chain data): works for any
    // profile, not just the viewer.
    async getCollected(userId: string): Promise<Holding[]> {
      const { data: userRow } = await supabase
        .from("users").select("wallet_address").eq("id", userId).maybeSingle();
      const wallet = userRow?.wallet_address;
      if (!wallet) return [];
      const { data: coinPosts } = await supabase
        .from("posts")
        .select("*")
        .not("coin_address", "is", null)
        .eq("token_standard", "coin")
        .neq("user_id", userId); // external curation only — never own posts
      if (!coinPosts?.length) return [];

      // ONE batched balance read for the whole set (fallback inside).
      const balances = await balancesFor(wallet, coinPosts.map((p) => p.coin_address as string));
      const rows = await Promise.all(
        coinPosts.map(async (p): Promise<Holding | null> => {
          try {
            const bal = balances.get((p.coin_address as string).toLowerCase()) ?? BigInt(0);
            const pieces = Math.floor(parseFloat(formatEther(bal)) / TOKENS_PER_PIECE);
            if (pieces <= 0) return null;
            let priceUsd: number | null = null;
            try {
              const t = await marketFor(p.coin_address);
              priceUsd = t.priceInUsdc != null && isFinite(parseFloat(t.priceInUsdc))
                ? parseFloat(t.priceInUsdc) * TOKENS_PER_PIECE
                : null;
            } catch { /* honest null */ }
            return {
              postId: p.id,
              ticker: p.ticker ?? null,
              thumbUrl: (p.media_type === "video" ? p.poster_url : null) || p.thumbnail_url || p.media_urls?.[0] || null,
              pieces,
              priceUsd,
              valueUsd: priceUsd != null ? priceUsd * pieces : 0,
              post: p,
            };
          } catch { return null; }
        })
      );
      return rows.filter((r): r is Holding => r !== null).sort((a, b) => b.valueUsd - a.valueUsd);
    },

    // The wallet's ownership ledger — every Scope coin the viewer holds,
    // including their own posts (allocation + backing). balanceOf per coin
    // over the platform's coin set, price from the same Zora read as
    // getPostMarket, value derived (price × pieces; null price → null value).
    async getHoldings(): Promise<Holding[]> {
      if (!viewerAddress) return [];
      const { data: coinPosts } = await supabase
        .from("posts")
        .select("*")
        .not("coin_address", "is", null)
        .eq("token_standard", "coin");
      if (!coinPosts?.length) return [];

      // ONE batched balance read for the whole set (fallback inside).
      const balances = await balancesFor(viewerAddress, coinPosts.map((p) => p.coin_address as string));
      const rows = await Promise.all(
        coinPosts.map(async (p): Promise<Holding | null> => {
          try {
            const bal = balances.get((p.coin_address as string).toLowerCase()) ?? BigInt(0);
            const pieces = Math.floor(parseFloat(formatEther(bal)) / TOKENS_PER_PIECE);
            if (pieces <= 0) return null;

            let priceUsd: number | null = null;
            try {
              const t = await marketFor(p.coin_address); // batched via /api/market
              priceUsd =
                t.priceInUsdc != null && isFinite(parseFloat(t.priceInUsdc))
                  ? parseFloat(t.priceInUsdc) * TOKENS_PER_PIECE
                  : null;
            } catch { /* price unavailable → honest null */ }

            return {
              postId: p.id,
              ticker: p.ticker ?? null,
              thumbUrl: (p.media_type === "video" ? p.poster_url : null) || p.thumbnail_url || p.media_urls?.[0] || null,
              pieces,
              priceUsd,
              // VALUATION RULE 1 (ratified, as amended): valuation activates on
              // ANY trade — including the creator's own backing (real liquidity,
              // real price, real dollars). Zero-trade coins value at $0 — spam-
              // post allocations inflate nothing, by construction. (priceInUsdc
              // is null until the first trade, so the rule maps exactly.)
              valueUsd: priceUsd != null ? priceUsd * pieces : 0,
              post: p,
            };
          } catch {
            return null;
          }
        })
      );
      return rows
        .filter((r): r is Holding => r !== null)
        .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
    },
  };
}
