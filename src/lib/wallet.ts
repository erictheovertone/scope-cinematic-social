import { createPublicClient, http, formatEther, formatUnits } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL),
})

export async function getEthBalance(address: string): Promise<string> {
  const balance = await client.getBalance({
    address: address as `0x${string}`,
  })
  return formatEther(balance)
}

const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

export async function getUsdcBalance(address: string): Promise<string> {
  const balance = await client.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })
  return formatUnits(balance, 6)
}

// ZORA — the token every creator-fee stream pays out in (the coins' paired
// currency). Surfaced in the wallet as CREATOR EARNINGS.
const ZORA_ADDRESS = '0x1111111111166b7FE7bd91427724B487980aFc69'

export async function getZoraBalance(address: string): Promise<string> {
  const balance = await client.readContract({
    address: ZORA_ADDRESS,
    abi: USDC_ABI, // plain balanceOf — same minimal ABI
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })
  return formatUnits(balance, 18)
}

export async function getTransactionHistory(address: string) {
  // Alchemy ANDs fromAddress + toAddress when both are in ONE call — that returns only
  // self-transfers (≈always empty). Activity needs BOTH directions, so we make two calls
  // (outgoing + incoming) and merge. category includes erc1155 so Zora-coin movements show
  // alongside ETH (external) + the erc20 trade legs.
  // order: 'desc' — Alchemy defaults to ASCENDING (oldest-first); without it each call's
  // maxCount window returns the EARLIEST transfers, so recent trades never get fetched and
  // activity stalls at the wallet's first transactions. desc = newest-first per call.
  // maxCount 0x32 (50) per direction → a useful recent window after merge.
  //
  // HONEST FAILURE (the 429 fix): getAssetTransfers is Alchemy's CU-expensive
  // method and the FIRST to be shed under rate limits — a 429 body has no
  // `result`, and the old `?.transfers || []` mapped that to "no transactions",
  // indistinguishable from a genuinely empty history. Now: retry ×2 with
  // backoff, and a final failure THROWS so callers can render a retry state.
  const call = async (params: Record<string, unknown>, category: string[]): Promise<any[]> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const d = await fetch(`${process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getAssetTransfers',
            params: [{ category, withMetadata: true, order: 'desc', maxCount: '0x32', ...params }],
          }),
        }).then((r) => r.json())
        const transfers = d?.result?.transfers
        if (Array.isArray(transfers)) return transfers
        if (attempt >= 2) throw new Error(d?.error?.message || 'transfer read returned no result')
      } catch (e) {
        if (attempt >= 2) throw e instanceof Error ? e : new Error('transfer read failed')
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))) // 1.5s, 3s
    }
  }

  // 'internal' is fetched as its OWN incoming call: Zora pays SELL proceeds as an internal
  // ETH transfer (router→wallet, not a top-level tx), so without it the cash-in leg — the
  // "+$ made" — is missing.
  const BASE_CATS = ['external', 'erc20', 'erc1155']
  const [outgoing, incoming, incomingInternal] = await Promise.all([
    call({ fromAddress: address }, BASE_CATS), // sends + buy ETH-out legs
    call({ toAddress: address }, BASE_CATS),   // receives + coin-in legs
    call({ toAddress: address }, ['internal']), // sell proceeds (internal ETH back to wallet)
  ])

  // Dedupe: a transfer is either from OR to the wallet, but guard for self-transfers
  // (would land in both) by hash + uniqueId/logIndex.
  const seen = new Set<string>()
  const merged = [...outgoing, ...incoming, ...incomingInternal].filter((tx) => {
    const key = `${tx.hash ?? ''}:${tx.uniqueId ?? tx.logIndex ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort newest-first by block number (hex → int), then cap.
  merged.sort((a, b) => parseInt(b.blockNum ?? '0x0', 16) - parseInt(a.blockNum ?? '0x0', 16))
  return merged.slice(0, 50)
}

// ── Session cache (CU economics) ──────────────────────────────────────────────
// Transfers are the expensive call — fetch on wallet open, reuse for the
// session; the ACTIVITY tab refreshes only when its cache is stale (>2.5 min),
// on explicit retry, or after a send (invalidate). Failures are NEVER cached.
const TX_STALE_MS = 150_000
let txCache: { address: string; at: number; transfers: any[] } | null = null

export function invalidateTxHistory() { txCache = null }

export async function getTransactionHistoryCached(address: string, opts?: { force?: boolean }): Promise<any[]> {
  if (!opts?.force && txCache && txCache.address === address && Date.now() - txCache.at < TX_STALE_MS) {
    return txCache.transfers
  }
  const transfers = await getTransactionHistory(address) // throws on failure
  txCache = { address, at: Date.now(), transfers }
  return transfers
}
