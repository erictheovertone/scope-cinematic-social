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

// LOG HYGIENE: SDK errors carry non-enumerable props — logging the raw object
// prints "{}". Always log through this extractor.
export const errInfo = (e: unknown) => ({
  name: (e as any)?.name,
  message: (e as any)?.message,
  cause: (e as any)?.cause?.message ?? (e as any)?.cause,
});

// The SDK's createTradeCall console.error()s its raw failed quote internally —
// pure noise during the readiness poll where failure is EXPECTED. Scoped
// suppression for the single awaited call; always restored.
async function withQuietConsoleError<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = orig; }
}

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

// ── Collect-sheet trades (Stage B) ────────────────────────────────────────────
//
// BUY (ETH path): $ → ETH at the live rate → quote → simulate → send (1.5×
// gas). SELL (coin → ETH) and USDC buys go through the SDK's tradeCoin with
// validateTransaction: true — those legs need Permit2 signatures, which the
// SDK orchestrates (signed silently by the embedded wallet; the labeled Scope
// button is the consent surface). Full quote logged before every execution.

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// THE COUNT comes from the RECEIPT, never stale state: parse the coin's ERC-20
// Transfer events to the buyer from the confirmed receipt and convert to
// pieces. (The old balance-delta read could race the RPC and report 0.)
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export function piecesFromReceipt(receipt: any, coinAddress: string, recipient: string): number | null {
  try {
    const coin = coinAddress.toLowerCase();
    const to = recipient.toLowerCase().replace(/^0x/, "");
    let total = BigInt(0);
    let found = false;
    for (const log of receipt?.logs ?? []) {
      if ((log.address || "").toLowerCase() !== coin) continue;
      if (log.topics?.[0] !== TRANSFER_TOPIC) continue;
      if (!(log.topics?.[2] || "").toLowerCase().endsWith(to)) continue;
      total += BigInt(log.data);
      found = true;
    }
    if (!found) return null;
    // wei → tokens (1e18) → pieces (100,000 tokens each) = 1e23
    return Math.floor(Number(total / BigInt("100000000000000000000")) / 1000);
  } catch {
    return null;
  }
}

export async function buyCoin({
  walletClient,
  sender,
  coinAddress,
  usdAmount,
  currency = "ETH",
  slippage = 0.05,
}: {
  walletClient: any;
  sender: `0x${string}`;
  coinAddress: string;
  usdAmount: number;
  currency?: "ETH" | "USDC";
  slippage?: number;
}): Promise<{ hash: `0x${string}`; pieces: number | null }> {
  const piecesBefore = await readPieces(coinAddress, sender);
  let hash: `0x${string}`;
  let receipt: any = null;

  if (currency === "USDC") {
    // USDC leg needs Permit2 — the SDK signs + sends (validated/estimated).
    const { tradeCoin } = await import("@zoralabs/coins-sdk");
    const tradeParameters = {
      sell: { type: "erc20" as const, address: USDC_BASE },
      buy: { type: "erc20" as const, address: getAddress(coinAddress) },
      amountIn: BigInt(Math.round(usdAmount * 1e6)), // USDC: 6 decimals
      slippage,
      sender,
      recipient: sender,
    };
    console.log("[zoraCoins] buyCoin USDC quote request:", JSON.stringify({ ...tradeParameters, amountIn: tradeParameters.amountIn.toString() }));
    const res: any = await tradeCoin({ tradeParameters, walletClient, publicClient: publicClient as any, account: sender, validateTransaction: true });
    receipt = res;
    hash = (res?.transactionHash ?? res?.hash) as `0x${string}`;
  } else {
    const ethUsd = await getEthUsdRate();
    if (ethUsd === null) throw new Error("Dollar rate unavailable right now — try again in a moment.");
    const amountIn = parseEther((usdAmount / ethUsd).toFixed(18));
    const tradeParameters = {
      sell: { type: "eth" as const },
      buy: { type: "erc20" as const, address: getAddress(coinAddress) },
      amountIn,
      slippage,
      sender,
      recipient: sender,
    };
    console.log("[zoraCoins] buyCoin quote request:", JSON.stringify({ ...tradeParameters, amountIn: amountIn.toString(), usd: usdAmount, ethUsd }));
    const quote = await createTradeCall(tradeParameters);
    console.log("[zoraCoins] buyCoin quote response:", JSON.stringify(quote)?.slice(0, 400));
    const exec = await executeQuotedTrade({ walletClient, sender, quote, label: `buy $${usdAmount}` });
    hash = exec.hash;
    receipt = exec.receipt;
  }

  // Receipt is the source of truth for the count; balance delta is the
  // cross-check fallback only.
  const receiptPieces = piecesFromReceipt(receipt, coinAddress, sender);
  const piecesAfter = await readPieces(coinAddress, sender);
  const deltaPieces = piecesBefore != null && piecesAfter != null ? piecesAfter - piecesBefore : null;
  const pieces = receiptPieces ?? deltaPieces;
  console.log(`[zoraCoins] buyCoin COMPLETE — tx: ${hash} | pieces (receipt): ${receiptPieces ?? "?"} | (balance delta cross-check): ${deltaPieces ?? "?"}`);
  return { hash, pieces };
}

// Pieces SOLD from the receipt: coin Transfers FROM the seller, summed.
export function piecesSoldFromReceipt(receipt: any, coinAddress: string, seller: string): number | null {
  try {
    const coin = coinAddress.toLowerCase();
    const from = seller.toLowerCase().replace(/^0x/, "");
    let total = BigInt(0);
    let found = false;
    for (const log of receipt?.logs ?? []) {
      if ((log.address || "").toLowerCase() !== coin) continue;
      if (log.topics?.[0] !== TRANSFER_TOPIC) continue;
      if (!(log.topics?.[1] || "").toLowerCase().endsWith(from)) continue;
      total += BigInt(log.data);
      found = true;
    }
    if (!found) return null;
    return Math.floor(Number(total / BigInt("100000000000000000000")) / 1000);
  } catch { return null; }
}

export async function sellCoin({
  walletClient,
  sender,
  coinAddress,
  pieces,
  currency = "ETH",
  slippage = 0.05,
}: {
  walletClient: any;
  sender: `0x${string}`;
  coinAddress: string;
  pieces: number;
  /** Receive side: ETH or USDC (same options as the buy's payment side). */
  currency?: "ETH" | "USDC";
  slippage?: number;
}): Promise<{ hash: `0x${string}`; pieces: number | null; proceedsUsd: number | null }> {
  // pieces → base-token wei: pieces × 100,000 tokens × 1e18.
  const amountIn = BigInt(Math.round(pieces)) * BigInt(100_000) * BigInt("1000000000000000000");
  const tradeParameters = {
    sell: { type: "erc20" as const, address: getAddress(coinAddress) },
    buy: currency === "USDC"
      ? { type: "erc20" as const, address: USDC_BASE }
      : { type: "eth" as const },
    amountIn,
    slippage,
    sender,
    recipient: sender,
  };
  console.log("[zoraCoins] sellCoin quote request:", JSON.stringify({ ...tradeParameters, amountIn: amountIn.toString(), pieces, currency }));

  // PROCEEDS measurement (ETH path): native receipts aren't ERC-20 logs, so
  // measure balance delta corrected for gas spent. USDC path parses Transfers.
  const ethBefore = currency === "ETH" ? await publicClient.getBalance({ address: sender }) : BigInt(0);

  // ERC-20 sells need Permit2 — the SDK signs the typed-data permit and sends
  // atomically inside tradeCoin (validated + estimated; no separate approval tx).
  const { tradeCoin } = await import("@zoralabs/coins-sdk");
  const res: any = await tradeCoin({ tradeParameters, walletClient, publicClient: publicClient as any, account: sender, validateTransaction: true });
  const hash = (res?.transactionHash ?? res?.hash) as `0x${string}`;

  // RECEIPT-TRUE numbers — pieces and proceeds are never estimates.
  const soldPieces = piecesSoldFromReceipt(res, coinAddress, sender);
  let proceedsUsd: number | null = null;
  try {
    if (currency === "USDC") {
      // USDC Transfers TO the seller in this receipt.
      const to = sender.toLowerCase().replace(/^0x/, "");
      let usdcWei = BigInt(0);
      for (const log of res?.logs ?? []) {
        if ((log.address || "").toLowerCase() !== USDC_BASE.toLowerCase()) continue;
        if (log.topics?.[0] !== TRANSFER_TOPIC) continue;
        if (!(log.topics?.[2] || "").toLowerCase().endsWith(to)) continue;
        usdcWei += BigInt(log.data);
      }
      proceedsUsd = Number(usdcWei) / 1e6;
    } else {
      const ethAfter = await publicClient.getBalance({ address: sender });
      const gasCost = BigInt(res?.gasUsed ?? 0) * BigInt(res?.effectiveGasPrice ?? 0);
      const receivedWei = ethAfter - ethBefore + gasCost; // net of gas
      const receivedEth = Number(receivedWei) / 1e18;
      const rate = await getEthUsdRate();
      proceedsUsd = rate != null && receivedEth > 0 ? receivedEth * rate : null;
    }
  } catch { /* proceeds unknown → terminal shows pieces only */ }

  console.log(`[zoraCoins] sellCoin COMPLETE — tx: ${hash} | pieces (receipt): ${soldPieces ?? "?"} | proceeds: ${proceedsUsd != null ? "$" + proceedsUsd.toFixed(4) : "?"} (${currency})`);
  return { hash, pieces: soldPieces, proceedsUsd };
}

// Classify a trade failure so the backing readiness loop knows whether to WAIT
// (a fresh pool that's still opening — quote 500s for a few seconds) or QUIT
// (a definitive on-chain revert or insufficient funds — retrying can't fix it).
function classifyTradeError(e: unknown): "route" | "reverted" | "insufficient" | "transient" {
  const m = `${(e as any)?.message ?? ""} ${(e as any)?.cause?.message ?? ""}`.toLowerCase();
  if (m.includes("insufficient")) return "insufficient";
  if (m.includes("reverted")) return "reverted";
  if (m.includes("failed to create route") || m.includes("no route") || m.includes("unroutable") || m.includes("cannot route")) return "route";
  return "transient";
}

// ── Creator self-buy ("Back your post") ───────────────────────────────────────
//
// Ratified mechanism: a SEPARATE post-create trade (0.6.0 createCoin has no
// initialPurchase). The creator buys their own coin at the curve price, paying
// like anyone (§5). ISOLATED: a self-buy failure must NOT fail the coin
// creation — the caller runs this best-effort after the coin confirms.
//
// CONVERGED PATH (the 2026-06-15 fix): the self-buy is now the SAME trade as a
// standalone collect — buyCoin, two entry points. The old backing hardcoded
// `sell: ETH`, for which a ZORA-paired content coin has NO route ("Failed to
// create route", every attempt) — the same ETH-routing failure proven at
// migration. The standalone collect routes because it sells USDC; so does this
// now. The failure was CURRENCY, not timing — a priced, live pool (MC > 0)
// still 500'd on ETH because the route never existed to begin with.
export async function backOwnCoin({
  walletClient,
  creatorAddress,
  coinAddress,
  usdAmount,
  currency = "USDC",
  slippage = 0.15,
}: {
  walletClient: any;
  creatorAddress: string;
  coinAddress: string;
  usdAmount: number;
  /** Sell side. MUST be the routable currency the standalone collect uses
      (CollectSheetV2 defaults to USDC). ETH is an escape hatch only — it has
      no route on a ZORA-paired content coin, so it is never the default. */
  currency?: "USDC" | "ETH";
  slippage?: number;
}): Promise<{ hash: `0x${string}`; pieces: number | null }> {
  const sender = getAddress(creatorAddress);

  // FAIL FAST, DON'T SPAM. Now that the route actually EXISTS (USDC), a healthy
  // pool quotes on the FIRST attempt — zero failed requests. So we no longer
  // poll a doomed route 3–6× and litter the console with 500s: a "Failed to
  // create route" (the pool isn't routable/indexed THIS instant) fails fast and
  // hands off — the creator can back from the post a moment later when it's
  // ready. Only a genuine TRANSIENT (a network blip, not a route/revert/funds
  // error) gets a single short retry. Definitive errors (route / revert /
  // insufficient funds) never retry. SDK console.error noise is muted; buyCoin's
  // own console.log success lines (not console.error) survive.
  const DELAYS_MS = [0, 3000]; // one short retry, transient-only
  let lastErr: unknown = null;
  for (let i = 0; i < DELAYS_MS.length; i++) {
    if (DELAYS_MS[i] > 0) await new Promise((r) => setTimeout(r, DELAYS_MS[i]));
    try {
      const r = await withQuietConsoleError(() =>
        buyCoin({ walletClient, sender, coinAddress, usdAmount, currency, slippage })
      );
      console.log(`[zoraCoins] backOwnCoin COMPLETE via buyCoin(${currency}) — tx: ${r.hash} | pieces: ${r.pieces ?? "?"} | $${usdAmount}`);
      return r;
    } catch (e) {
      lastErr = e;
      const kind = classifyTradeError(e);
      if (kind !== "transient") {
        // route / reverted / insufficient — definitive. Surface the REAL reason
        // and hand off; retrying an unroutable/reverting/underfunded call only
        // burns time and logs more 500s.
        console.warn(`[zoraCoins] backing not landing in-flow (${kind}) — handing off to the post:`, errInfo(e));
        break;
      }
      const next = DELAYS_MS[i + 1];
      console.debug(`[zoraCoins] backing transient${next ? `, one retry in ${next / 1000}s` : ""}`);
    }
  }
  // Hand off cleanly — the backing can still be done from the post's collect
  // sheet (where, a moment later, the pool is ready). The caller surfaces ONE
  // dismissible chip that auto-clears; no stuck UI.
  console.warn("[zoraCoins] backing did not land in-flow — handing off:", errInfo(lastErr));
  throw new Error(
    `Backing not available yet — the market may still be opening. You can back it from the post shortly. (${(lastErr as Error)?.message})`
  );
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
}): Promise<{ hash: `0x${string}`; receipt: any }> {
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
  return { hash, receipt };
}
