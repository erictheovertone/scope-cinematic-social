// ── Zora Coins — Phase 1 mint path (1155 → createCoin) ───────────────────────
//
// New posts mint as a Zora COIN (createCoin) with Scope set as platformReferrer.
// Conforms to Scope_Economy.docx §9 + docs/economy/Phase1_Coin_Migration_Proposal.md.
// The legacy 1155 path (src/lib/zora.ts mintNewPost) stays intact but dormant —
// the rollback lifeboat. Do not delete it.
//
// Pinned to @zoralabs/coins-sdk@0.8.0 (CreateCoinArgs: creator, name, symbol,
// metadata{type:'RAW_URI',uri}, currency, chainId, startingMarketCap,
// platformReferrer, payoutRecipientOverride). Still NO initialPurchase param —
// the creator self-buy is a SEPARATE post-create tradeCoin (backOwnCoin).
// Brief Z2 raised 0.6.0 → 0.8.0: three additive releases, CreateCoinArgs
// unchanged, zero new type errors. The SDK version was never the bug — see
// zoraApi.ts for what actually was.

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
import { TOKENS_PER_PIECE } from "@/lib/economy/tokenomics";
// Brief Z2 — points the SDK at the keyed transport for this context (proxy in
// the browser, key-injecting fetch on the server). Module-scope side effect:
// it MUST run before any SDK call below. See src/lib/zoraApi.ts.
import { ensureZoraApi, ZORA_PROXY_PATH, ZORA_KEYED_HEADER } from "@/lib/zoraApi";
import { recordZoraApiFailure, classifyZoraFailure } from "@/lib/zoraErrors";

ensureZoraApi();

export const publicClient = createPublicClient({
  chain: base,
  transport: http(
    process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || "https://mainnet.base.org"
  ),
});

// LOG HYGIENE: SDK errors carry non-enumerable props — logging the raw object
// prints "{}". Always log through this extractor.
//
// Brief Z1 — the SDK's createTradeCall ATTACHES the upstream response body to the
// error it throws (err.errorType / err.errorBody) and that is the ONLY record of
// what the SDK API actually said (status text, rate-limit notice, auth refusal).
// The old extractor read name/message/cause and dropped both, so every quote
// failure logged a bare "Quote failed". Surfaced here, so every existing callsite
// (backing hand-off, collect, swap) gains the evidence with no callsite change.
export const errInfo = (e: unknown) => {
  const body = (e as any)?.errorBody;
  return {
    name: (e as any)?.name,
    message: (e as any)?.message,
    cause: (e as any)?.cause?.message ?? (e as any)?.cause,
    ...((e as any)?.errorType ? { errorType: (e as any).errorType } : {}),
    ...(body ? { errorBody: typeof body === "string" ? body.slice(0, 400) : JSON.stringify(body)?.slice(0, 400) } : {}),
  };
};

// ── Brief Z1 — Zora SDK API evidence capture (DIAGNOSTIC, logging only) ───────
//
// WHY THIS EXISTS: coins-sdk@0.6.0's createCoin builds its calldata SERVER-side
// (POST https://api-sdk.zora.engineering/create/content), and its generated
// fetch client does NOT throw on non-2xx — it returns { data: undefined, error,
// response }. The SDK then does:
//     if (!res.data?.calls) throw new Error("Failed to create content calldata")
// discarding `error` and `response` entirely. The HTTP status, the response body
// and the endpoint are destroyed inside the SDK before we ever see them, so a
// 401/403/429 (auth / rate-limit) is indistinguishable from a genuine 5xx —
// both arrive as that one generic string, which CreatePostFlow's regex then
// reports as "Zora's service is having trouble".
//
// So we tap the ONE layer below the SDK that still holds the truth: a scoped
// globalThis.fetch wrapper, active only for the awaited call, always restored
// (the withQuietConsoleError discipline). It observes and logs; it never
// modifies the request, the response, or control flow — a failure inside the tap
// is swallowed so diagnostics can never break a mint.
//
// Logged via console.warn, NOT console.error, deliberately: backOwnCoin runs
// under withQuietConsoleError, which would otherwise mute this evidence.
// Brief Z2 — the tap is no longer diagnostics-only: it is the SOURCE OF TRUTH
// for error classification. It records each failing response into the shared
// slot in zoraErrors.ts, which classifyZoraFailure() then reads, so the status
// the SDK threw away is what decides the message the user sees.
const ZORA_SDK_API_HOST = "api-sdk.zora.engineering";

// Reentrancy guard: backOwnCoin → buyCoin nests wrapped calls. Stacking taps
// would double-log and double-record; the outermost one already observes every
// inner request, so nested calls simply pass through.
let tapActive = false;

export async function withZoraApiEvidence<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  if (typeof orig !== "function" || tapActive) return fn();
  tapActive = true;

  globalThis.fetch = async function (input: any, init?: any) {
    const res = await orig(input, init);
    try {
      const url = typeof input === "string" ? input : (input?.url ?? String(input));
      // Brief Z2 — the SDK now talks to our proxy in the browser, so match BOTH
      // the proxy path and the direct upstream host (server-side, and any
      // caller that hasn't been re-pointed).
      if (url.includes(ZORA_SDK_API_HOST) || url.includes(ZORA_PROXY_PATH)) {
        // Was this call keyed? In the browser the key is attached by the proxy,
        // downstream of here and invisible to us — so the proxy reports it back
        // on a response header. Server-side, the request header is visible
        // directly. Either way this line is the verification the walk depends on.
        const hdrs: Headers | undefined = input?.headers instanceof Headers ? input.headers : (init?.headers instanceof Headers ? init.headers : undefined);
        const proxyKeyed = res.headers.get(ZORA_KEYED_HEADER);
        const keyed: boolean | "unknown" =
          proxyKeyed ? proxyKeyed === "sent" : (hdrs ? hdrs.has("api-key") : "unknown");
        if (!res.ok) {
          // clone() so the SDK still gets an unread body.
          const body = await res.clone().text().catch(() => "<unreadable>");
          // THE HANDOFF: this is the evidence the SDK is about to destroy.
          // Record it before the generic throw so the classifier can use it.
          recordZoraApiFailure({ status: res.status, body, url, keyed, at: Date.now() });
          console.warn(
            `[zora] ${label} — SDK API FAILED\n` +
            `  endpoint : ${(init?.method ?? input?.method ?? "GET").toUpperCase()} ${url}\n` +
            `  status   : ${res.status} ${res.statusText}\n` +
            `  api-key  : ${keyed === true ? "sent" : keyed === false ? "ABSENT (keyless request)" : "unknown"}\n` +
            `  body     : ${body.slice(0, 600)}`
          );
        } else {
          console.log(`[zora] ${label} — SDK API ok (${res.status}) ${url} | api-key: ${keyed === true ? "sent" : keyed === false ? "ABSENT" : "unknown"}`);
        }
      }
    } catch { /* the tap must never affect the call it observes */ }
    return res;
  } as typeof fetch;

  try { return await fn(); } finally { globalThis.fetch = orig; tapActive = false; }
}

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
// creator coin / ZORA). The ratified §1.4 fallback applies. This resolves the
// configured pairing and is stored on the post for audit; an ETH value is
// HARD-BLOCKED at mint by the routability guard in createScopeCoin (ETH would
// mint a permanently untradeable coin), so ETH is inert until/unless Zora's
// router supports it AND that guard is lifted.
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
// ── Brief V2e — coin image + animation chain (video posts) ───────────────────
// ONE builder for the coin's image, used by BOTH mint paths (publish + retry). Four links;
// uploadCoinMetadata's guard is the final backstop.
//   image = posterUrl ?? thumbnailUrl ?? stream_poster_url ?? constructed-Stream-thumbnail(uid)
// The Stream URLs are DETERMINISTIC from the video uid + the customer subdomain code, so
// they're valid at publish time (before the webhook lands stream_poster_url). The code MUST
// be NEXT_PUBLIC — the mint builds this metadata in the browser.
const STREAM_CUSTOMER_CODE = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE;
export const HLS_MIME = "application/x-mpegURL";

export function streamThumbnailUrl(uid: string | null | undefined): string | null {
  return uid && STREAM_CUSTOMER_CODE ? `https://customer-${STREAM_CUSTOMER_CODE}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg` : null;
}
/** Deterministic HLS manifest for a Stream uid (Brief V2e §2 — coin animation_url). */
export function streamHlsUrl(uid: string | null | undefined): string | null {
  return uid && STREAM_CUSTOMER_CODE ? `https://customer-${STREAM_CUSTOMER_CODE}.cloudflarestream.com/${uid}/manifest/video.m3u8` : null;
}
/** The four-link coin image chain for a video post. Null only if every link is empty AND
 *  there's no uid/customer-code — then uploadCoinMetadata's guard fires (honest failure). */
export function coinImageUrl(f: { posterUrl?: string | null; thumbnailUrl?: string | null; streamPosterUrl?: string | null; streamUid?: string | null }): string | null {
  return f.posterUrl ?? f.thumbnailUrl ?? f.streamPosterUrl ?? streamThumbnailUrl(f.streamUid);
}

async function uploadCoinMetadata(args: {
  userId: string;
  postId: string;
  name: string;
  description: string;
  image: string;          // graded media URL
  animationUrl?: string | null; // baked video clip, if any
  mimeType?: string;
}): Promise<string> {
  // Brief V2b — the coins-sdk validates the fetched tokenURI: name/description/image must
  // all be strings ("Metadata image is required and must be a string"). Guard image HERE so
  // a missing one throws a CLEAR, retryable coin-failed error instead of the cryptic SDK one.
  if (typeof args.image !== "string" || !args.image) {
    throw new Error("[zoraCoins] coin metadata image missing — video poster/thumbnail unavailable (cannot mint)");
  }
  const metadata: Record<string, unknown> = {
    name: args.name,
    description: args.description ?? "",
    image: args.image,
  };
  // OMIT animation_url when absent (V2b: never write it as null — the SDK requires a string
  // IF the key is present). Video coins are poster-only until V3 wires Stream playback.
  if (args.animationUrl) {
    metadata.animation_url = args.animationUrl;
    metadata.content = { mime: args.mimeType || "video/mp4", uri: args.animationUrl };
  }

  const blob = new Blob([JSON.stringify(metadata)], { type: "application/json" });
  const path = `${args.postId}.json`;
  const { error } = await supabase.storage
    .from("coin-metadata")
    .upload(path, blob, { cacheControl: "31536000", upsert: true, contentType: "application/json" });
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

  // ROUTABILITY HARD-GUARD (mirrors the referrer guard above). A coin must
  // NEVER mint with a currency Zora's router can't route. ETH-paired content
  // coins are unroutable — every BUY / SELL / backing returns "Failed to create
  // route" forever, and the pairing is immutable, so an ETH currency here mints
  // a PERMANENTLY DEAD token (proven 2026-06-12, re-proven live 2026-06-16:
  // 6/6 ETH-paired coins fail all legs; every ZORA-paired coin routes). A bad
  // env (NEXT_PUBLIC_SCOPE_COIN_CURRENCY=ETH) is a misconfiguration — fail LOUD
  // here, before createCoin, rather than strand a creator with a dead coin.
  if (currency !== "ZORA") {
    throw new Error(
      `[zoraCoins] refusing to mint a ${currency}-paired coin — Zora's router cannot route it, so it would be permanently untradeable. Set NEXT_PUBLIC_SCOPE_COIN_CURRENCY=ZORA.`
    );
  }

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

  // Brief Z1 — the createCoin call is wrapped in the SDK-API evidence tap so a
  // failure logs the VERBATIM upstream response (status, body, endpoint, whether
  // an api-key was sent) instead of the SDK's generic "Failed to create content
  // calldata". Logging only — the call itself is unchanged.
  const { hash, address, deployment } = await withZoraApiEvidence("createCoin", () =>
    createCoin({
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
    })
  );

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
const WETH_BASE = "0x4200000000000000000000000000000000000006";
// Withdrawal(address indexed src, uint256 wad) — emitted when WETH is unwrapped
// to native ETH. For an ETH-out sell the router unwraps exactly the swap output
// to the seller, so `wad` is the RECEIPT-TRUE realized proceeds in ETH (no
// balance-read timing race).
const WETH_WITHDRAWAL_TOPIC = "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";
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
    const res: any = await withZoraApiEvidence("buyCoin(USDC)", () => tradeCoin({ tradeParameters, walletClient, publicClient: publicClient as any, account: sender, validateTransaction: true }));
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
    const quote = await withZoraApiEvidence("buyCoin(ETH) quote", () => createTradeCall(tradeParameters));
    console.log("[zoraCoins] buyCoin quote response:", JSON.stringify(quote)?.slice(0, 400));
    const exec = await executeQuotedTrade({ walletClient, sender, quote, label: `buy $${usdAmount}` });
    hash = exec.hash;
    receipt = exec.receipt;
  }

  // ── RECEIPT-TRUE GATE (A) ───────────────────────────────────────────────────
  // A buy is "real" ONLY if the tx MINED with status:success AND the coins actually
  // arrived in THIS buyer's wallet on-chain. A ghost or MIS-ROUTED tx (delivered
  // nowhere, or to a different address than `sender`) must throw — surfacing a FAILURE,
  // never a confirmation or an optimistic balance. We re-read receipt + balance from the
  // chain (not the SDK result), so the truth comes from on-chain, not the SDK's word.
  if (!hash) throw new Error("Purchase didn't broadcast — no transaction hash. You were not charged for tokens.");
  const minedReceipt = await publicClient.waitForTransactionReceipt({ hash });
  if (minedReceipt.status !== "success") {
    throw new Error(`Purchase reverted on-chain (tx ${hash}) — no tokens were bought.`);
  }
  // On-chain delivery to the BUYER, with a few retries to absorb RPC index lag on a
  // just-mined tx (a real buy reflects within a couple seconds; a mis-routed/ghost one
  // never does → it throws).
  let piecesAfter: number | null = null;
  for (let i = 0; i < 4; i++) {
    piecesAfter = await readPieces(coinAddress, sender);
    if (piecesAfter != null && piecesBefore != null && piecesAfter > piecesBefore) break;
    if (i < 3) await new Promise((r) => setTimeout(r, 1500));
  }
  const deltaPieces = piecesBefore != null && piecesAfter != null ? piecesAfter - piecesBefore : null;
  if (deltaPieces == null || deltaPieces <= 0) {
    // The tx mined but the coins are NOT in this wallet — mis-routed or undelivered.
    throw new Error(`Purchase didn't deliver coins to your wallet (tx ${hash}). Your balance was not changed — please try again.`);
  }
  console.log(`[zoraCoins] buyCoin COMPLETE — tx: ${hash} | delivered pieces (on-chain): ${deltaPieces} | receipt-parsed: ${piecesFromReceipt(receipt, coinAddress, sender) ?? "?"}`);
  return { hash, pieces: deltaPieces };
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
  const res: any = await withZoraApiEvidence("sellCoin", () => tradeCoin({ tradeParameters, walletClient, publicClient: publicClient as any, account: sender, validateTransaction: true }));
  const hash = (res?.transactionHash ?? res?.hash) as `0x${string}`;

  // RECEIPT-TRUE GATE (A): only a tx that MINED with status:success is a real sale —
  // never confirm proceeds for a ghost/reverted tx.
  if (!hash) throw new Error("Sale didn't broadcast — no transaction hash.");
  const minedReceipt = await publicClient.waitForTransactionReceipt({ hash });
  if (minedReceipt.status !== "success") {
    throw new Error(`Sale reverted on-chain (tx ${hash}) — nothing was sold.`);
  }

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
      // ETH path. REALIZED OUTPUT, not balance math: the router unwraps WETH →
      // native ETH to the seller, so the WETH Withdrawal `wad` in THIS receipt is
      // the true proceeds (in ETH). The old balance-delta (ethAfter − ethBefore)
      // was a timing race — a lagging RPC read of ethAfter collapsed real $4.91
      // proceeds to ~$0.02 on the confirmation. Sum Withdrawals (one per sell;
      // multi-hop ends in a single WETH→ETH unwrap). Fall back to the balance
      // delta only if no Withdrawal is present (a router that sends native ETH).
      let ethWei = BigInt(0);
      for (const log of res?.logs ?? []) {
        if ((log.address || "").toLowerCase() !== WETH_BASE) continue;
        if (log.topics?.[0] !== WETH_WITHDRAWAL_TOPIC) continue;
        ethWei += BigInt(log.data);
      }
      let receivedEth: number;
      if (ethWei > BigInt(0)) {
        receivedEth = Number(ethWei) / 1e18; // receipt-true
      } else {
        const ethAfter = await publicClient.getBalance({ address: sender });
        const gasCost = BigInt(res?.gasUsed ?? 0) * BigInt(res?.effectiveGasPrice ?? 0);
        receivedEth = Number(ethAfter - ethBefore + gasCost) / 1e18; // fallback
      }
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
  // Brief Z2 §3 — the hand-off message used to append the SDK's raw message,
  // which for a quote failure is the constant "Quote failed" (no information).
  // Classify instead: a 429 says wait, an outage says outage, and only a genuine
  // pool-not-ready failure says "the market may still be opening".
  const verdict = classifyZoraFailure(lastErr, { action: "trade" });
  console.warn(`[zoraCoins] backing did not land in-flow — handing off [${verdict.kind}: ${verdict.evidence}]:`, errInfo(lastErr));
  throw new Error(
    verdict.kind === "unknown" || verdict.kind === "chain"
      ? "Backing not available yet — the market may still be opening. You can back it from the post shortly."
      : `${verdict.message} You can back it from the post shortly.`
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

// ── ETH ⇄ USDC swap (wallet SWAP sheet) ───────────────────────────────────────
//
// SIBLING of buyCoin/sellCoin — the same Zora-router machinery pointed at the
// plain ETH/USDC pair (verified live both directions; no Zora hook on this pair,
// so the only cost is the Uniswap pool fee + spread, ~0.1%/leg). USDC→ETH rides
// the SDK's tradeCoin (Permit2, exactly like USDC collects); ETH→USDC rides
// createTradeCall + executeQuotedTrade (simulate → 1.5× gas → receipt). Deep
// 5bp pair → tight default slippage (NOT the backing's 0.15).

export type SwapToken = "ETH" | "USDC" | "ZORA";
const SWAP_SLIPPAGE = 0.02;
export const ZORA_BASE = "0x1111111111166b7FE7bd91427724B487980aFc69" as const;
const SWAP_META: Record<SwapToken, { erc20: `0x${string}` | null; decimals: number }> = {
  ETH: { erc20: null, decimals: 18 },
  USDC: { erc20: USDC_BASE, decimals: 6 },
  ZORA: { erc20: ZORA_BASE, decimals: 18 },
};
export const swapTokenDecimals = (t: SwapToken) => SWAP_META[t].decimals;

// Uniswap Permit2 — the ERC-20 legs' one-time approval target (allowance
// pre-read lets the sheet surface "first swap includes an approval" honestly).
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
const ERC20_ALLOWANCE = [
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const readSwapSide = async (owner: `0x${string}`, token: SwapToken): Promise<bigint> => {
  const meta = SWAP_META[token];
  if (!meta.erc20) return publicClient.getBalance({ address: owner });
  return (await publicClient.readContract({ address: meta.erc20, abi: ERC20_BAL, functionName: "balanceOf", args: [owner] })) as bigint;
};

/** True when this wallet's first swap SELLING `token` will include the one-time Permit2 approval tx. */
export async function erc20SwapNeedsApproval(owner: `0x${string}`, token: SwapToken): Promise<boolean> {
  const meta = SWAP_META[token];
  if (!meta.erc20) return false; // native ETH needs no approval
  try {
    const allowance = (await publicClient.readContract({
      address: meta.erc20, abi: ERC20_ALLOWANCE, functionName: "allowance", args: [owner, PERMIT2_ADDRESS],
    })) as bigint;
    return allowance === BigInt(0);
  } catch { return false; } // unknown → don't scare the user; tradeCoin handles it either way
}

const swapSide = (token: SwapToken) =>
  SWAP_META[token].erc20 ? ({ type: "erc20", address: SWAP_META[token].erc20! } as const) : ({ type: "eth" } as const);
const swapParams = (sell: SwapToken, buy: SwapToken, amountIn: bigint, sender: `0x${string}`, slippage: number) => ({
  sell: swapSide(sell), buy: swapSide(buy), amountIn, slippage, sender, recipient: sender,
});

/** Display quote for the sheet (execution always re-quotes internally at send).
    Verified routable pairs: ETH⇄USDC and ZORA⇄USDC (both directions, live-checked). */
export async function quoteSwap({ sell, buy, amountIn, sender, slippage = SWAP_SLIPPAGE }: {
  sell: SwapToken; buy: SwapToken;
  amountIn: bigint; // base units of the sell token
  sender: `0x${string}`;
  slippage?: number;
}): Promise<{ amountOut: bigint }> {
  const quote: any = await withZoraApiEvidence("quoteSwap", () => createTradeCall(swapParams(sell, buy, amountIn, sender, slippage)));
  return { amountOut: BigInt(quote?.quote?.amountOut ?? 0) };
}

/**
 * RECEIPT-TRUE swap (any verified pair): snapshot BOTH sides → execute → mined
 * status:success → re-read both → the ACTUAL deltas are the result (never the
 * quote). Success requires the receive side to have genuinely increased, else
 * this throws. `paid`/`received` are floats in display units; `paid` on an
 * ETH sell includes gas — the honest number.
 */
export async function swapTokens({ walletClient, sender, sell, buy, amountIn, slippage = SWAP_SLIPPAGE }: {
  walletClient: any;
  sender: `0x${string}`;
  sell: SwapToken; buy: SwapToken;
  amountIn: bigint; // base units of the sell token
  slippage?: number;
}): Promise<{ hash: `0x${string}`; paid: number; received: number }> {
  const [sellBefore, buyBefore] = await Promise.all([readSwapSide(sender, sell), readSwapSide(sender, buy)]);

  let hash: `0x${string}`;
  if (sell !== "ETH") {
    // ERC-20 sell → Permit2 leg — the SDK orchestrates approval (first time) + signature + send.
    const { tradeCoin } = await import("@zoralabs/coins-sdk");
    const res: any = await withZoraApiEvidence(`swap ${sell}->${buy}`, () => tradeCoin({
      tradeParameters: swapParams(sell, buy, amountIn, sender, slippage),
      walletClient, publicClient: publicClient as any, account: sender, validateTransaction: true,
    }));
    hash = (res?.transactionHash ?? res?.hash) as `0x${string}`;
    if (!hash) throw new Error("Swap didn't broadcast — no transaction hash. Nothing was swapped.");
    const mined = await publicClient.waitForTransactionReceipt({ hash });
    if (mined.status !== "success") throw new Error(`Swap reverted on-chain (tx ${hash}) — nothing was swapped.`);
  } else {
    const quote = await withZoraApiEvidence(`swap ${sell}->${buy} quote`, () => createTradeCall(swapParams(sell, buy, amountIn, sender, slippage)));
    const exec = await executeQuotedTrade({ walletClient, sender, quote, label: `swap ${sell}→${buy}` });
    hash = exec.hash; // executeQuotedTrade already enforced mined status:success
  }

  // Receive-side delta must be REAL — retries absorb RPC index lag on a
  // just-mined tx (the buyCoin discipline); a mis-routed swap never reflects → throw.
  let sellAfter = sellBefore, buyAfter = buyBefore;
  for (let i = 0; i < 4; i++) {
    [sellAfter, buyAfter] = await Promise.all([readSwapSide(sender, sell), readSwapSide(sender, buy)]);
    if (buyAfter > buyBefore) break;
    if (i < 3) await new Promise((r) => setTimeout(r, 1500));
  }

  const received = Number(buyAfter - buyBefore) / 10 ** SWAP_META[buy].decimals;
  const paid = Number(sellBefore - sellAfter) / 10 ** SWAP_META[sell].decimals;
  if (!(received > 0)) {
    throw new Error(`Swap didn't deliver to your wallet (tx ${hash}) — check the transaction before retrying.`);
  }
  console.log(`[zoraCoins] swap ${sell}→${buy} COMPLETE — tx: ${hash} | paid ${paid} | received ${received} (receipt-true deltas)`);
  return { hash, paid, received };
}
