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
import type { EconomyApi, PostMarket } from "./types";

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
  };
}
