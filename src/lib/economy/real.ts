// ── Real economy reads (Stage A of the mock→real swap) ──────────────────────
//
// For COIN posts (coin_address present) getPostMarket returns REAL numbers.
// Source: Zora's Coins API via the SDK's getCoin query (api-sdk.zora.engineering
// /coin) — one call returns marketCap (USD), tokenPrice.priceInUsdc (per base
// token; NULL for a no-trades pool), and uniqueHolders, already indexed by
// Zora. The viewer's holding is read on-chain (ERC-20 balanceOf via our Base
// RPC) — pieces math: 1 piece = 100,000 base tokens (18 decimals).
//
// HONEST NO-TRADES STATE: a brand-new pool has no discovered price —
// priceUsd stays NULL (UI shows "—") and marketCap reads 0. No NaNs, no
// fabricated starting numbers.
//
// Everything else (First Cut provenance, Top 1k, earnings, quotes/trades)
// stays MOCK until the indexer / Stage B — this module delegates those to the
// mock so the preview-flag surfaces keep working unchanged.

import { getCoin } from "@zoralabs/coins-sdk";
import { formatEther } from "viem";
import { base } from "viem/chains";
import { supabase } from "@/lib/supabase/client";
import { mockEconomy, PIECE_SUPPLY, FOUNDING_AMOUNT } from "./mock";
import { publicClient } from "@/lib/zoraCoins";
import type { EconomyApi, PostMarket, Holding } from "./types";

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

async function realPostMarket(
  coinAddress: string,
  viewerAddress: string | null
): Promise<PostMarket> {
  const [coinRes, viewerBalance] = await Promise.all([
    getCoin({ address: coinAddress, chain: base.id }),
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

  const token = (coinRes as any)?.data?.zora20Token;
  if (!token) throw new Error(`[economy] coin not found in Zora index: ${coinAddress}`);

  // priceInUsdc is per BASE TOKEN; a piece is 100,000 tokens. NULL price
  // (no trades yet) stays null — the UI shows "—".
  const perToken = token.tokenPrice?.priceInUsdc;
  const priceUsd =
    perToken != null && isFinite(parseFloat(perToken))
      ? parseFloat(perToken) * TOKENS_PER_PIECE
      : null;

  // Viewer pieces: balance (wei) → tokens → pieces, floored.
  const viewerTokens = parseFloat(formatEther(viewerBalance as bigint));
  const collectedByViewer = Math.floor(viewerTokens / TOKENS_PER_PIECE);

  // MC CONSISTENCY RULE: MC is ALWAYS price × total supply, derived here in
  // the boundary — never fetched independently (Zora's marketCap field lags
  // its own price and the two contradicted on screen). One source of truth:
  // price and MC can never disagree again. No price yet → MC 0.
  const mcUsd = priceUsd != null ? priceUsd * PIECE_SUPPLY : 0;

  return {
    priceUsd,
    mcUsd,
    live: true,
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
export function createRealEconomy(viewerAddress: string | null): EconomyApi {
  return {
    ...mockEconomy,
    async getPostMarket(postId: string): Promise<PostMarket> {
      const coinAddress = await coinAddressFor(postId);
      if (!coinAddress) return mockEconomy.getPostMarket(postId);
      return realPostMarket(coinAddress, viewerAddress);
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
              const res: any = await getCoin({ address: p.coin_address, chain: base.id });
              const perToken = res?.data?.zora20Token?.tokenPrice?.priceInUsdc;
              priceUsd =
                perToken != null && isFinite(parseFloat(perToken))
                  ? parseFloat(perToken) * TOKENS_PER_PIECE
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
