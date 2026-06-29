// ── Wallet activity: raw Alchemy transfer legs → readable trade rows ─────────
//
// getTransactionHistory returns one transfer per LEG (a buy = cash-out leg +
// coin-in leg, same tx hash; a sell = coin-out + cash-in). This groups legs by
// hash and classifies each tx into one readable row, converting coin amounts to
// FRAGMENTS via the single-source tokenomics conversion (never a raw on-chain
// number) so activity matches holdings / the collect sheet everywhere.

import { tokenUnitsToFragments } from '@/lib/economy/tokenomics';

export interface RawTransfer {
  hash?: string;
  uniqueId?: string;
  from?: string;
  to?: string;
  value?: number;
  asset?: string;
  category?: string;
  blockNum?: string;
  metadata?: { blockTimestamp?: string };
}

export type ActivityKind = 'buy' | 'sell' | 'mint' | 'send' | 'receive';

export interface ActivityRow {
  hash: string;
  kind: ActivityKind;
  /** coin ticker for buy/sell/mint */
  ticker?: string;
  /** normalized fragment count for buy/sell/mint */
  fragments?: number;
  /** dollar value of the cash leg, when derivable */
  usd?: number;
  /** raw cash leg fallback when no USD (e.g. ETH with no rate, plain transfers) */
  cashAsset?: string;
  cashAmount?: number;
  /** counterparty short address for plain send/receive */
  counterparty?: string;
  date: string;
  blockNum: number;
}

const CASH = new Set(['ETH', 'WETH', 'USDC', 'USDBC', 'USDC.E']);
const isCash = (asset?: string) => !!asset && CASH.has(asset.toUpperCase());

/** Cash leg → USD. USDC-family is already ~dollars; ETH/WETH needs the live rate. */
function legUsd(asset: string | undefined, amount: number, ethUsdRate: number | null): number | undefined {
  if (!asset) return undefined;
  const a = asset.toUpperCase();
  if (a.startsWith('USD')) return amount;
  if ((a === 'ETH' || a === 'WETH') && ethUsdRate && ethUsdRate > 0) return amount * ethUsdRate;
  return undefined;
}

/**
 * Group raw transfer legs into readable activity rows, newest-first.
 * @param transfers raw Alchemy transfers (already deduped by getTransactionHistory)
 * @param walletAddress the viewer's wallet (to read leg direction)
 * @param ethUsdRate live ETH→USD rate, or null
 */
export function groupActivity(
  transfers: RawTransfer[],
  walletAddress: string,
  ethUsdRate: number | null,
): ActivityRow[] {
  const w = walletAddress.toLowerCase();
  const out = (l: RawTransfer) => l.from?.toLowerCase() === w;
  const inn = (l: RawTransfer) => l.to?.toLowerCase() === w;

  // Group by tx hash (legs of one trade share it). Legs with no hash stand alone.
  const groups = new Map<string, RawTransfer[]>();
  for (const t of transfers) {
    const key = t.hash ?? `nohash:${t.uniqueId ?? Math.random()}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  const rows: ActivityRow[] = [];
  for (const [hash, legs] of groups) {
    const block = Math.max(...legs.map((l) => parseInt(l.blockNum ?? '0x0', 16) || 0));
    const ts = legs.find((l) => l.metadata?.blockTimestamp)?.metadata?.blockTimestamp;
    const date = ts ? new Date(ts).toLocaleDateString() : '';

    // The coin leg = a non-cash token transfer (the post's ERC-20/1155 ticker).
    const coinLeg = legs.find(
      (l) => l.asset && !isCash(l.asset) && (l.category === 'erc20' || l.category === 'erc1155'),
    );
    const cashLegs = legs.filter((l) => isCash(l.asset));

    if (coinLeg) {
      const coinIn = inn(coinLeg);
      const fragments = tokenUnitsToFragments(Number(coinLeg.value ?? 0));
      // BUY = coin in + cash out of wallet. SELL = coin out + cash in. No matching
      // cash leg on a coin-in tx = a mint/airdrop (received with no spend).
      const cashLeg = coinIn ? cashLegs.find(out) : cashLegs.find(inn);
      const kind: ActivityKind = coinIn ? (cashLegs.some(out) ? 'buy' : 'mint') : 'sell';
      rows.push({
        hash,
        kind,
        ticker: coinLeg.asset,
        fragments,
        usd: cashLeg ? legUsd(cashLeg.asset, Number(cashLeg.value ?? 0), ethUsdRate) : undefined,
        cashAsset: cashLeg?.asset,
        cashAmount: cashLeg ? Number(cashLeg.value ?? 0) : undefined,
        date,
        blockNum: block,
      });
    } else {
      // No coin leg → a plain transfer. Pick the leg that touches the wallet.
      const leg = legs.find(out) ?? legs.find(inn) ?? legs[0];
      const sent = out(leg);
      rows.push({
        hash,
        kind: sent ? 'send' : 'receive',
        counterparty: sent ? leg.to : leg.from,
        cashAsset: leg.asset ?? 'ETH',
        cashAmount: Number(leg.value ?? 0),
        date,
        blockNum: block,
      });
    }
  }

  rows.sort((a, b) => b.blockNum - a.blockNum);
  return rows;
}
