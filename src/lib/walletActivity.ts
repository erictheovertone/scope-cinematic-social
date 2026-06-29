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
  rawContract?: { address?: string };
  metadata?: { blockTimestamp?: string };
}

export type ActivityKind = 'buy' | 'sell' | 'mint' | 'send' | 'receive';

export interface ActivityRow {
  hash: string;
  kind: ActivityKind;
  /** resolved coin ticker for buy/sell/mint — never a bare numeric id */
  ticker?: string;
  /** normalized fragment count; undefined/0 → render with no number (e.g. mint) */
  fragments?: number;
  /** dollar value of the cash leg, when derivable */
  usd?: number;
  /** raw cash leg (for hero amount on plain transfers + $ fallback) */
  cashAsset?: string;
  cashAmount?: number;
  /** counterparty short address for plain send/receive */
  counterparty?: string;
  date: string;
  blockNum: number;
}

const CASH = new Set(['ETH', 'WETH', 'USDC', 'USDBC', 'USDC.E']);
const isCash = (asset?: string) => !!asset && CASH.has(asset.toUpperCase());
const isNumericSymbol = (s?: string) => !s || /^\d+$/.test(s.trim());

export function shortAddr(addr?: string): string {
  if (!addr) return '—';
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** Cash leg → USD. USDC-family is already ~dollars; ETH/WETH needs the live rate. */
function legUsd(asset: string | undefined, amount: number, ethUsdRate: number | null): number | undefined {
  if (!asset) return undefined;
  const a = asset.toUpperCase();
  if (a.startsWith('USD')) return amount;
  if ((a === 'ETH' || a === 'WETH') && ethUsdRate && ethUsdRate > 0) return amount * ethUsdRate;
  return undefined;
}

/** Largest-value leg (by token amount) — avoids picking a fee / WETH-wrap dust leg. */
function largest(legs: RawTransfer[]): RawTransfer | undefined {
  let best: RawTransfer | undefined;
  for (const l of legs) if (!best || Number(l.value ?? 0) > Number(best.value ?? 0)) best = l;
  return best;
}

/**
 * Resolve the coin ticker. The app's source of truth is the post's ticker keyed by
 * coin contract address (same as feed/collect). Fall back to the on-chain symbol only
 * when it's a real (non-numeric) symbol, then to a short address — never a numeric id.
 */
function resolveTicker(coinLeg: RawTransfer, tickerByAddress: Map<string, string>): string | undefined {
  const addr = coinLeg.rawContract?.address?.toLowerCase();
  if (addr && tickerByAddress.has(addr)) return tickerByAddress.get(addr);
  if (!isNumericSymbol(coinLeg.asset)) return coinLeg.asset;
  return addr ? shortAddr(addr) : undefined;
}

/**
 * Group raw transfer legs into readable activity rows, newest-first.
 * @param transfers raw Alchemy transfers (already deduped by getTransactionHistory)
 * @param walletAddress the viewer's wallet (to read leg direction)
 * @param ethUsdRate live ETH→USD rate, or null
 * @param tickerByAddress coin_address(lowercase) → ticker, from the posts table
 */
export function groupActivity(
  transfers: RawTransfer[],
  walletAddress: string,
  ethUsdRate: number | null,
  tickerByAddress: Map<string, string> = new Map(),
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

    // The coin leg = a non-cash token transfer (the post's ERC-20/1155).
    const coinLeg = legs.find(
      (l) => l.asset && !isCash(l.asset) && (l.category === 'erc20' || l.category === 'erc1155'),
    );
    const cashLegs = legs.filter((l) => isCash(l.asset));

    if (coinLeg) {
      const coinIn = inn(coinLeg);
      const fragments = tokenUnitsToFragments(Number(coinLeg.value ?? 0));
      // BUY = coin in + cash out of wallet. SELL = coin out + cash in. No matching
      // cash leg on a coin-in tx = a mint/allocation (received with no spend).
      const walletOutCash = cashLegs.filter(out);
      const walletInCash = cashLegs.filter(inn);
      const kind: ActivityKind = coinIn ? (walletOutCash.length ? 'buy' : 'mint') : 'sell';
      // Pick the LARGEST wallet-side cash leg in the trade direction (fee/wrap legs are small).
      const cashLeg = kind === 'buy' ? largest(walletOutCash) : kind === 'sell' ? largest(walletInCash) : undefined;
      rows.push({
        hash,
        kind,
        ticker: resolveTicker(coinLeg, tickerByAddress),
        fragments,
        usd: cashLeg ? legUsd(cashLeg.asset, Number(cashLeg.value ?? 0), ethUsdRate) : undefined,
        cashAsset: cashLeg?.asset,
        cashAmount: cashLeg ? Number(cashLeg.value ?? 0) : undefined,
        date,
        blockNum: block,
      });
    } else {
      // No coin leg → a plain transfer. Pick the largest leg that touches the wallet.
      const leg = largest(legs.filter(out)) ?? largest(legs.filter(inn)) ?? legs[0];
      const sent = out(leg);
      const amount = Number(leg.value ?? 0);
      rows.push({
        hash,
        kind: sent ? 'send' : 'receive',
        counterparty: sent ? leg.to : leg.from,
        cashAsset: leg.asset ?? 'ETH',
        cashAmount: amount,
        usd: legUsd(leg.asset, amount, ethUsdRate),
        date,
        blockNum: block,
      });
    }
  }

  rows.sort((a, b) => b.blockNum - a.blockNum);
  return rows;
}
