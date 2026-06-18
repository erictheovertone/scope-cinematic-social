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
import type { EconomyApi, PostMarket, Holding, BuyQuote, SellQuote, TradeCurrency, CollectResult, Badges } from "./types";

const TOKENS_PER_PIECE = 100_000;

const BALANCE_OF_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

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
    await fetch("/api/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bust: [coinAddress.toLowerCase()] }),
    });
  } catch { /* fall back to TTL */ }
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
// refetch, MC chip) is post-trade fresh — not a stale cached value.
if (typeof window !== "undefined") {
  import("./tradeEvents").then(({ onTradeSettled }) => onTradeSettled(() => marketCache.clear()));
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
          const res = await fetch(`/api/market?addresses=${addrs.join(",")}`);
          markets = (await res.json())?.markets ?? {};
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
      const { count } = await supabase
        .from("first_cut_awards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      const firstCutCount = count ?? 0;
      return { ...base, firstCutCount: firstCutCount > 0 ? firstCutCount : undefined };
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
      await bustServerMarket(coinAddress); // freshness: next read isn't the pre-trade price
      return { ok: true, pieces: pieces ?? 0, ref: hash };
    },

    async sell(postId: string, pieces: number, currency: TradeCurrency = "ETH"): Promise<CollectResult> {
      const coinAddress = await coinAddressFor(postId);
      if (!coinAddress) return mockEconomy.sell(postId, pieces);
      if (!viewerAddress || !getWalletClient) throw new Error("Wallet not ready — try again in a moment.");
      const walletClient = await getWalletClient();
      const r = await sellCoin({ walletClient, sender: getAddress(viewerAddress), coinAddress, pieces, currency });
      await bustServerMarket(coinAddress); // freshness: next read isn't the pre-trade price
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

      const rows = await Promise.all(
        coinPosts.map(async (p): Promise<Holding | null> => {
          try {
            const bal = (await publicClient.readContract({
              address: p.coin_address as `0x${string}`,
              abi: BALANCE_OF_ABI,
              functionName: "balanceOf",
              args: [wallet as `0x${string}`],
            })) as bigint;
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

      const rows = await Promise.all(
        coinPosts.map(async (p): Promise<Holding | null> => {
          try {
            const bal = (await publicClient.readContract({
              address: p.coin_address as `0x${string}`,
              abi: BALANCE_OF_ABI,
              functionName: "balanceOf",
              args: [viewerAddress as `0x${string}`],
            })) as bigint;
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
