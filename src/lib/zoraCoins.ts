// ── Zora Coins — Phase 1 mint path (1155 → createCoin) ───────────────────────
//
// New posts mint as a Zora COIN (createCoin) with Scope set as platformReferrer.
// Conforms to Scope_Economy.docx §9 + docs/economy/Phase1_Coin_Migration_Proposal.md.
// The legacy 1155 path (src/lib/zora.ts mintNewPost) stays intact but dormant —
// the rollback lifeboat. Do not delete it.
//
// Pinned to @zoralabs/coins-sdk@0.6.0 (CreateCoinArgs: creator, name, symbol,
// metadata{type:'RAW_URI',uri}, currency, chainId, startingMarketCap,
// platformReferrer, payoutRecipientOverride). NOTE: 0.6.0 has NO initialPurchase
// param — the creator self-buy is a SEPARATE post-create tradeCoin (backOwnCoin).

import {
  createCoin,
  createTradeCall,
  getCoinCreateFromLogs,
  CreateConstants,
  type ContentCoinCurrency,
} from "@zoralabs/coins-sdk";
import { createPublicClient, http, getAddress, parseEther, formatEther } from "viem";
import { base } from "viem/chains";
import { supabase } from "@/lib/supabase/client";
import { getEthUsdRate } from "@/lib/coingecko";

export const publicClient = createPublicClient({
  chain: base,
  transport: http(
    process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || "https://mainnet.base.org"
  ),
});

// ── Platform referrer hard-guard ──────────────────────────────────────────────
//
// ARCHITECTURE: this address receives Zora's protocol-level platform referral —
// 0.2% of volume on every trade of every Scope-minted coin, forever, paid by
// Zora's contracts automatically. It is PERMANENT per coin (immutable for the
// coin's life) and deliberately SEPARATE from the Scope treasury
// (0xEEb0…C1c5, which receives Pro payments today + Phase 1.5 router fees later).
// Receiving-only; swept manually.
//
// HARD-GUARD: a coin must NEVER be created without this exact, valid referrer.
// getAddress() throws on a missing/malformed/bad-checksum value, so a
// misconfigured environment fails loudly instead of minting un-referred coins.
export function getScopePlatformReferrer(): `0x${string}` {
  const raw = process.env.NEXT_PUBLIC_SCOPE_PLATFORM_REFERRER;
  if (!raw || !raw.trim()) {
    throw new Error(
      "[zoraCoins] NEXT_PUBLIC_SCOPE_PLATFORM_REFERRER is not set — refusing to create an un-referred coin."
    );
  }
  return getAddress(raw.trim()); // throws on invalid checksum/format
}

// Pool base currency. DEFAULT: ZORA — the burner check (2026-06-12) proved
// Zora's market router cannot route ETH-paired content coins ("Failed to
// create route", price null, MC 0; every live content coin pairs against a
// creator coin / ZORA). The ratified §1.4 fallback applies. ETH remains an
// env override only for if/when Zora's router supports it. Stored on the post
// for audit.
export function getCoinCurrency(): ContentCoinCurrency {
  const v = (process.env.NEXT_PUBLIC_SCOPE_COIN_CURRENCY || "ZORA").toUpperCase();
  return (v === "ETH" ? "ETH" : "ZORA") as ContentCoinCurrency;
}

// ── Coin metadata (image = the GRADED media) ──────────────────────────────────
//
// image = poster_url (video hero frame) for video, the baked/edited image for
// photos — never the raw upload; the image URL stays in post-media. Only the
// JSON lives in the dedicated PUBLIC 'coin-metadata' bucket (application/json
// allowed; see migrations/2026-06-12_coin_metadata_bucket.sql).
//
// Path scheme: {postId}.json — STABLE and immutable: postId is the permanent
// pre-coin key (the coin address doesn't exist yet at upload time), and this
// URL becomes the coin's permanent tokenURI. Retries upsert the same path with
// identical content (idempotent).
async function uploadCoinMetadata(args: {
  userId: string;
  postId: string;
  name: string;
  description: string;
  image: string;          // graded media URL
  animationUrl?: string | null; // baked video clip, if any
  mimeType?: string;
}): Promise<string> {
  const metadata: Record<string, unknown> = {
    name: args.name,
    description: args.description ?? "",
    image: args.image,
  };
  if (args.animationUrl) {
    metadata.animation_url = args.animationUrl;
    metadata.content = { mime: args.mimeType || "video/mp4", uri: args.animationUrl };
  }

  const blob = new Blob([JSON.stringify(metadata)], { type: "application/json" });
  const path = `${args.postId}.json`;
  const { error } = await supabase.storage
    .from("coin-metadata")
    .upload(path, blob, { cacheControl: "3600", upsert: true, contentType: "application/json" });
  if (error) throw error;

  const { data } = supabase.storage.from("coin-metadata").getPublicUrl(path);
  const url = data.publicUrl;

  // PRE-MINT ASSERTION: a coin must never point at an unreachable or non-JSON
  // tokenURI. Verify the public URL actually serves 200 + application/json
  // BEFORE createCoin fires; a failure throws into the coin-failed path
  // (post survives, retryable — no half-mint).
  const probe = await fetch(url, { cache: "no-store" });
  const ctype = probe.headers.get("content-type") || "";
  if (!probe.ok || !ctype.includes("application/json")) {
    throw new Error(
      `[zoraCoins] metadata URI failed pre-mint check: HTTP ${probe.status}, content-type "${ctype}" (${url})`
    );
  }
  console.log("[zoraCoins] metadata URI verified (200, application/json):", url);
  return url;
}

export interface CreateScopeCoinResult {
  coinAddress: `0x${string}`;
  hash: `0x${string}`;
  currency: ContentCoinCurrency;
  metadataUri: string;
}

// ── Create the post's coin ────────────────────────────────────────────────────
export async function createScopeCoin({
  walletClient,
  creatorAddress,
  post,
}: {
  walletClient: any;
  creatorAddress: string;
  post: {
    id: string;
    userId: string;
    name: string;
    description: string;
    symbol: string;        // ticker
    image: string;         // GRADED media URL
    animationUrl?: string | null;
    mimeType?: string;
  };
}): Promise<CreateScopeCoinResult> {
  // Guard FIRST — never reach createCoin without a valid referrer.
  const platformReferrer = getScopePlatformReferrer();
  const creator = getAddress(creatorAddress);
  const currency = getCoinCurrency();

  const metadataUri = await uploadCoinMetadata({
    userId: post.userId,
    postId: post.id,
    name: post.name,
    description: post.description,
    image: post.image,
    animationUrl: post.animationUrl,
    mimeType: post.mimeType,
  });

  console.log("[zoraCoins] createScopeCoin — creator:", creator, "symbol:", post.symbol, "currency:", currency);

  const { hash, address, deployment } = await createCoin({
    call: {
      creator,
      name: post.name,
      symbol: post.symbol,
      metadata: { type: "RAW_URI", uri: metadataUri },
      currency,
      chainId: base.id,
      startingMarketCap: CreateConstants.StartingMarketCaps.LOW, // ratified LOW — early-collector upside
      platformReferrer,
      payoutRecipientOverride: creator, // creator receives native 0.5% + 1% allocation
    },
    walletClient,
    publicClient: publicClient as any,
  });

  const coinAddress = (address ?? deployment?.coin) as `0x${string}` | undefined;
  if (!coinAddress) {
    // The tx may have landed without a parseable address — surface for the
    // reconciliation path (the caller persisted coin_tx_hash already).
    throw new Error("[zoraCoins] createCoin returned no coin address (tx: " + hash + ")");
  }

  console.log("[zoraCoins] createScopeCoin — coin:", coinAddress, "tx:", hash);
  return { coinAddress, hash, currency, metadataUri };
}

// ── Reconciliation (retry detection) ──────────────────────────────────────────
//
// Given a persisted createCoin tx hash, detect whether the coin actually landed
// on-chain (the post-mining DB write may have failed). Returns the coin address
// if found, so the retry path can BACK-FILL instead of re-creating (proposal
// §5.5 / amendment C). The unique index on coin_address is the backstop.
export async function reconcileCoinFromTx(
  txHash: string
): Promise<`0x${string}` | null> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (!receipt || receipt.status !== "success") return null;
    const deployment = getCoinCreateFromLogs(receipt as any);
    return ((deployment as any)?.coin ?? null) as `0x${string}` | null;
  } catch {
    return null; // tx not found / not mined → safe to (re)create
  }
}

// ── Creator self-buy ("Back your post") ───────────────────────────────────────
//
// Ratified mechanism: a SEPARATE post-create trade (0.6.0 createCoin has no
// initialPurchase). Dollar-led: $ → ETH via the live rate → tradeCoin ETH→coin
// from the creator's own wallet, at the curve price, paying like anyone (§5).
// ISOLATED: a self-buy failure must NOT fail the coin creation — the caller
// runs this best-effort after the coin confirms.
export async function backOwnCoin({
  walletClient,
  creatorAddress,
  coinAddress,
  usdAmount,
  slippage = 0.05,
}: {
  walletClient: any;
  creatorAddress: string;
  coinAddress: string;
  usdAmount: number;
  slippage?: number;
}): Promise<{ hash: `0x${string}`; pieces: number | null }> {
  // HONEST FAILURE: converting $ at a wrong rate buys the wrong amount —
  // refuse rather than guess. (The self-buy is isolated; the coin survives.)
  const ethUsd = await getEthUsdRate();
  if (ethUsd === null) throw new Error("ETH/USD rate unavailable — self-buy skipped, try again from the post");
  const ethAmount = usdAmount / ethUsd;
  const amountIn = parseEther(ethAmount.toFixed(18));
  const sender = getAddress(creatorAddress);

  const tradeParameters = {
    sell: { type: "eth" as const },
    buy: { type: "erc20" as const, address: getAddress(coinAddress) },
    amountIn,
    slippage,
    sender,
    recipient: sender,
  };

  // READINESS: a freshly created pool may not be quotable for a few seconds —
  // poll the quote with backoff before committing the trade. Every attempt
  // logs the exact request so a routing 500 is never blind.
  const DELAYS_MS = [0, 2000, 4000, 8000, 8000, 8000]; // ~30s total
  let lastErr: unknown = null;
  let quote: any = null;
  for (let i = 0; i < DELAYS_MS.length; i++) {
    if (DELAYS_MS[i] > 0) await new Promise((r) => setTimeout(r, DELAYS_MS[i]));
    console.log(
      `[zoraCoins] backOwnCoin quote attempt ${i + 1}/${DELAYS_MS.length}:`,
      JSON.stringify({ ...tradeParameters, amountIn: amountIn.toString(), chainId: base.id, usd: usdAmount, ethUsd })
    );
    try {
      quote = await createTradeCall(tradeParameters); // quote only — no tx
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[zoraCoins] backOwnCoin quote not ready (attempt ${i + 1}):`, (e as Error)?.message);
    }
  }
  if (lastErr) {
    throw new Error(
      `Backing not available yet — the market may still be opening. You can back it from the post shortly. (${(lastErr as Error)?.message})`
    );
  }
  // The full quote response — the receipt's first leg.
  console.log("[zoraCoins] backOwnCoin quote response:", JSON.stringify(quote)?.slice(0, 500));

  // Pieces delta: balance before/after so the receipt shows what arrived.
  const piecesBefore = await readPieces(coinAddress, sender);

  const { hash } = await executeQuotedTrade({ walletClient, sender, quote, label: `backing $${usdAmount}` });

  const piecesAfter = await readPieces(coinAddress, sender);
  const delta = piecesBefore != null && piecesAfter != null ? piecesAfter - piecesBefore : null;
  const effective = delta && delta > 0 ? (usdAmount / delta).toFixed(4) : null;
  console.log(
    `[zoraCoins] backOwnCoin COMPLETE — tx: ${hash} | pieces received: ${delta ?? "?"} (balance ${piecesBefore ?? "?"} → ${piecesAfter ?? "?"}) | $${usdAmount} ≈ ${ethAmount} ETH${effective ? ` | effective $${effective}/piece` : ""}`
  );
  return { hash, pieces: delta };
}

// ── Trade execution (quote → SIMULATE → estimate fresh → send 1.5×) ───────────
//
// The first real backing tx (0x6b26db66…) ran OUT OF GAS: the first-ever trade
// on a fresh V4 pool touches all-cold storage across a multihop route, and the
// gas limit chosen downstream (1.82M) was under the real cost. We take control:
// simulate the exact call (surfaces any real revert reason BEFORE spending
// gas), estimate against fresh state, and send with a 1.5× buffer. Used by
// backing now and the collect-sheet trades (Stage B) next.
const TOKENS_PER_PIECE = 100_000;
const ERC20_BAL = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;

export async function readPieces(coinAddress: string, holder: `0x${string}`): Promise<number | null> {
  try {
    const b = await publicClient.readContract({ address: getAddress(coinAddress), abi: ERC20_BAL, functionName: "balanceOf", args: [holder] });
    return Math.floor(parseFloat(formatEther(b as bigint)) / TOKENS_PER_PIECE);
  } catch { return null; }
}

export async function executeQuotedTrade({
  walletClient,
  sender,
  quote,
  label,
}: {
  walletClient: any;
  sender: `0x${string}`;
  quote: any; // PostQuoteResponse from createTradeCall
  label: string;
}): Promise<{ hash: `0x${string}` }> {
  const call = {
    to: getAddress(quote.call.target),
    data: quote.call.data as `0x${string}`,
    value: BigInt(quote.call.value),
  };

  // 1. SIMULATE the exact call — a revert surfaces its real reason here,
  //    before any gas is spent on-chain.
  await publicClient.call({ ...call, account: sender });

  // 2. Estimate against fresh state, send with 1.5× headroom (fresh-pool
  //    cold-storage drift is exactly what OOG'd the first backing).
  const est = await publicClient.estimateGas({ ...call, account: sender });
  const gas = (est * BigInt(15)) / BigInt(10);
  console.log(`[zoraCoins] trade (${label}) simulate OK — gas est ${est}, sending with limit ${gas} (1.5×)`);

  const hash = await walletClient.sendTransaction({ ...call, gas, account: sender, chain: base });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Trade reverted on-chain (tx ${hash}, gas used ${receipt.gasUsed}/${gas})`);
  }
  console.log(`[zoraCoins] trade (${label}) LANDED — tx: ${hash} | gas used ${receipt.gasUsed}/${gas}`);
  return { hash };
}
