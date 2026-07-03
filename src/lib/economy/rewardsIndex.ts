// ── Creator-reward decoding (server-side) — ACTUAL earnings, no estimates ─────
//
// Ground truth (fee-test decode, 2026-07-03): every creator fee — buys AND
// sells — arrives as a ZORA ERC-20 Transfer from Zora's rewards distributor
// (0x0469…50c0, verified stable across coins/directions) to the creator wallet,
// inside the swap tx itself. This module decodes a swap tx's receipt into the
// exact creator reward:
//   rewardZora  = Σ ZORA transfers distributor → creator
//   price       = swapUsd ÷ the tx's ZORA leg (its largest ZORA transfer)
//   rewardUsd   = rewardZora × price   (receipt-time valuation — validated to
//                 the cent against the decoded fee-test txs)
// The distributor is identified PER TX as the address that pays the Scope
// platform referrer in the same tx (self-identifying), with the known constant
// as fallback — an ordinary ZORA send to the creator can never match.

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZORA_TOKEN = "0x1111111111166b7fe7bd91427724b487980afc69";
const KNOWN_DISTRIBUTOR = "0x0469a4bd3724dc86c9542f4694c976da13c450c0";

const topicAddr = (t: string) => ("0x" + t.slice(26)).toLowerCase();

export interface DecodedReward {
  /** Exact ZORA paid to the creator in this swap tx (display units). */
  rewardZora: number;
  /** Receipt-time ZORA/USD price derived from THIS swap (null if underivable). */
  priceUsdPerZora: number | null;
}

/** Decode one swap tx's creator reward from its receipt logs. */
export async function decodeCreatorReward(opts: {
  rpcUrl: string;
  txHash: string;
  creatorAddress: string;
  referrerAddress: string;
  /** The swap's USD notional (swapUsd from the same getCoinSwaps node). */
  swapUsd: number;
}): Promise<DecodedReward | null> {
  const { rpcUrl, txHash, creatorAddress, referrerAddress, swapUsd } = opts;
  let logs: { address: string; topics: string[]; data: string }[];
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
    }).then((r) => r.json());
    logs = res?.result?.logs;
    if (!Array.isArray(logs)) return null;
  } catch {
    return null;
  }

  const creator = creatorAddress.toLowerCase();
  const referrer = referrerAddress.toLowerCase();
  const zoraLegs = logs.filter(
    (l) => l.address?.toLowerCase() === ZORA_TOKEN && l.topics?.[0] === TRANSFER_TOPIC && l.topics.length >= 3,
  );
  if (!zoraLegs.length) return { rewardZora: 0, priceUsdPerZora: null };

  // The distributor self-identifies: it pays the platform referrer in this tx.
  const refLeg = zoraLegs.find((l) => topicAddr(l.topics[2]) === referrer);
  const distributor = refLeg ? topicAddr(refLeg.topics[1]) : KNOWN_DISTRIBUTOR;

  let rewardWei = BigInt(0);
  let maxLegWei = BigInt(0);
  for (const l of zoraLegs) {
    const amt = BigInt(l.data);
    if (amt > maxLegWei) maxLegWei = amt;
    if (topicAddr(l.topics[1]) === distributor && topicAddr(l.topics[2]) === creator) rewardWei += amt;
  }

  const rewardZora = Number(rewardWei) / 1e18;
  const zoraLeg = Number(maxLegWei) / 1e18;
  const priceUsdPerZora = swapUsd > 0 && zoraLeg > 0 ? swapUsd / zoraLeg : null;
  return { rewardZora, priceUsdPerZora };
}

// Bounded-concurrency map (shared shape with the routes' mapPool).
export async function mapPoolRewards<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
