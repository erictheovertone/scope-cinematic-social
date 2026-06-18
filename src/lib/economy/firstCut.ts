// ── First Cut — authoritative founder computation (Awarding layer · Step 3) ───
//
// Plan: docs/economy/Indexer_Decisions.md §First Cut. First Cut = the first 10
// EXTERNAL collectors of a coin (buyer ≠ creator), ordered by first acquisition.
// It is PERMANENT and IMMUTABLE — so this read must be AUTHORITATIVE, never
// optimistic. The Step-2 lesson: a truncated/degraded API read must NEVER
// produce a false award. We therefore:
//   1. Paginate getCoinSwaps to INCEPTION (the first 10 live at the oldest end)
//      and VERIFY completeness against the API's own swapActivities.count — a
//      short read is unverified → defer (never award on partial data).
//   2. Cross-check the specific buyer's acquisition against on-chain truth
//      (viem getLogs over the coin's Transfer events) — the chain is the
//      ground-truth backstop the scoping doc calls for.
// A missed award is recoverable (a later verified pass / Moment 2 still fires);
// a false award is not. When in doubt, DEFER.

import { getCoinSwaps, setApiKey } from '@zoralabs/coins-sdk';
import { getAddress } from 'viem';
import { publicClient } from '@/lib/zoraCoins';

const BASE_CHAIN = 8453;
const SWAP_PAGE = 100;
const SWAP_MAX_PAGES = 50;   // bound pagination; hitting the cap = unverified → defer
const MAX_RETRIES = 3;
// keccak256("Transfer(address,address,uint256)") — the ERC-20 Transfer topic.
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ── First Cut config (tunable in ONE place, like the Collector weights) ───────
export const FIRST_CUT_CONFIG = {
  /** Anti-spam floor in USD, INCLUSIVE (a qualifying buy must be ≥ this). Without
   *  it the permanent, reward-bearing badge is farmable for cents.
   *  SET TO $4.50 = a 10% slippage tolerance below the $5 intent: a genuine $5
   *  buy nets <$5 of pool value after slippage/fees (a live test hit $4.99 and
   *  was wrongly disqualified by a strict $5.00). $4.50 rescues real ~$5 backers
   *  at the boundary while keeping spam impossible — $0.02 dust is nowhere near
   *  it. Applies uniformly to current AND historical buys. */
  minQualifyingUsd: 4.5,
  /** Founding slots per coin. */
  slots: 10,
};
const FOUNDER_SLOTS = FIRST_CUT_CONFIG.slots;

const lc = (s?: string | null) => (s ?? '').toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// USD value of a swap from its currency leg: priceUsdc (USD per currency unit) ×
// the amount spent. Returns 0 when price/amount can't be read — a missing value
// never clears the $5 floor (safe: a buy of unknown value can't farm a slot).
function swapUsd(n: any): number {
  const price = parseFloat(n?.currencyAmountWithPrice?.priceUsdc ?? '0');
  const amt = n?.currencyAmountWithPrice?.currencyAmount?.amountDecimal;
  const usd = (Number.isFinite(price) ? price : 0) * (typeof amt === 'number' ? amt : 0);
  return Number.isFinite(usd) ? usd : 0;
}

let _keyed = false;
function ensureKey() {
  if (!_keyed && process.env.ZORA_API_KEY) {
    setApiKey(process.env.ZORA_API_KEY);
    _keyed = true;
  }
}

async function apiCall<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await sleep(300 * Math.pow(3, attempt));
    }
  }
  throw lastErr;
}

export interface FirstCutComputation {
  /** Ordered, distinct external founder wallets (oldest first, ≤ 10). */
  founders: string[];
  /** True only when the swap history was read COMPLETE (count-verified to
      inception). False → the read was truncated/degraded; caller must DEFER. */
  verified: boolean;
}

/**
 * The count-verified, oldest-first list of the coin's first 10 external founder
 * wallets. `verified:false` means the swap history could not be fully read this
 * pass — the caller must NOT award (defer to a later verified pass).
 */
export async function externalFounders(
  coinAddress: string,
  creatorAddress: string,
): Promise<FirstCutComputation> {
  ensureKey();
  const creator = lc(creatorAddress);
  const buys: { wallet: string; ts: string; usd: number }[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  let expected = Infinity;  // swapActivities.count — verified to be the TOTAL
  let collected = 0;
  let threw = false;
  let reachedInception = false;

  for (let page = 0; page < SWAP_MAX_PAGES; page++) {
    let res: any;
    try {
      res = await apiCall(() => getCoinSwaps({ address: coinAddress, chain: BASE_CHAIN, first: SWAP_PAGE, after }));
    } catch {
      threw = true;
      break;
    }
    const sa = res?.data?.zora20Token?.swapActivities;
    const edges = sa?.edges ?? [];
    if (page === 0 && typeof sa?.count === 'number') expected = sa.count;
    collected += edges.length;
    for (const edge of edges) {
      const n = edge?.node;
      if (!n || seen.has(n.id)) continue;
      seen.add(n.id);
      if (n.activityType !== 'BUY') continue;       // founders acquire via BUY
      buys.push({ wallet: lc(n.senderAddress), ts: n.blockTimestamp, usd: swapUsd(n) });
    }
    if (sa?.pageInfo?.hasNextPage && sa?.pageInfo?.endCursor) {
      after = sa.pageInfo.endCursor;
      continue;
    }
    reachedInception = true; // API reports no older page
    break;
  }

  // VERIFIED only if: no fetch error, we reached inception, AND we gathered
  // every swap the API claims exists (count). A premature hasNextPage:false with
  // fewer edges than count is the exact truncation that must not award.
  const verified = !threw && reachedInception && expected !== Infinity && collected >= expected;
  if (!verified) return { founders: [], verified: false };

  // Oldest-first, then distinct external wallets among QUALIFYING (≥$5) buys.
  // A sub-$5 buy is skipped entirely — it never occupies or "uses up" a slot;
  // the slot passes to the next external buyer who clears the floor.
  const min = FIRST_CUT_CONFIG.minQualifyingUsd;
  buys.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const founders: string[] = [];
  for (const b of buys) {
    if (b.wallet === creator) continue;             // creator never earns First Cut
    if (b.usd < min) continue;                      // sub-$5 — invisible to First Cut
    if (founders.includes(b.wallet)) continue;      // distinct; keep first QUALIFYING buy
    founders.push(b.wallet);
    if (founders.length >= FOUNDER_SLOTS) break;
  }
  return { founders, verified: true };
}

/**
 * Ground-truth backstop: does `txHash` actually show the coin's ERC-20 being
 * transferred TO `buyer` (a real acquisition by this wallet)? Reads the receipt
 * from chain — immune to API truncation. Binds the award to on-chain reality so
 * a spoofed/replayed request can't mint a First Cut.
 */
export async function confirmBuyOnChain(
  txHash: string,
  coinAddress: string,
  buyer: string,
): Promise<boolean> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (!receipt || receipt.status !== 'success') return false;
    const coin = lc(coinAddress);
    const to = lc(buyer).replace(/^0x/, '');
    for (const log of receipt.logs ?? []) {
      if (lc(log.address) !== coin) continue;
      if (log.topics?.[0] !== TRANSFER_TOPIC) continue;
      // topics[2] = indexed `to`, left-padded to 32 bytes.
      if ((log.topics?.[2] ?? '').toLowerCase().endsWith(to)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface FirstCutCheck {
  rank: number | null;   // 1..10 if already among the qualifying founders, else null
  slotsFilled: number;   // # qualifying (≥$5, external) founders currently filled (≤10)
  verified: boolean;     // false → defer (do not award/celebrate this pass)
}

/**
 * Is `buyerWallet` one of the coin's first 10 QUALIFYING external founders
 * (≥$5 buys)? Authoritative: count-verified swap history for the ranking.
 * `verified:false` → defer. `slotsFilled` lets the caller tell a still-open
 * window (a just-confirmed buy may not be indexed yet → defer) from a full one.
 */
export async function computeFirstCutRank(
  coinAddress: string,
  creatorAddress: string,
  buyerWallet: string,
): Promise<FirstCutCheck> {
  if (lc(buyerWallet) === lc(creatorAddress)) return { rank: null, slotsFilled: 0, verified: true }; // creator excluded
  const { founders, verified } = await externalFounders(coinAddress, creatorAddress);
  if (!verified) return { rank: null, slotsFilled: 0, verified: false };
  const idx = founders.indexOf(lc(buyerWallet));
  return { rank: idx >= 0 ? idx + 1 : null, slotsFilled: founders.length, verified: true };
}

export { getAddress };
