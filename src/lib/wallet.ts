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

export async function getTransactionHistory(address: string) {
  // Alchemy ANDs fromAddress + toAddress when both are in ONE call — that returns only
  // self-transfers (≈always empty). Activity needs BOTH directions, so we make two calls
  // (outgoing + incoming) and merge. category includes erc1155 so Zora-coin movements show
  // alongside ETH (external) + the erc20 trade legs.
  const CATEGORY = ['external', 'erc20', 'erc1155']
  // order: 'desc' — Alchemy defaults to ASCENDING (oldest-first); without it each call's
  // maxCount window returns the EARLIEST transfers, so recent trades never get fetched and
  // activity stalls at the wallet's first transactions. desc = newest-first per call.
  // maxCount 0x32 (50) per direction → a useful recent window after merge.
  const call = (params: Record<string, unknown>) =>
    fetch(`${process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getAssetTransfers',
        params: [{ category: CATEGORY, withMetadata: true, order: 'desc', maxCount: '0x32', ...params }],
      }),
    })
      .then((r) => r.json())
      .then((d) => (d.result?.transfers as any[]) || [])
      .catch(() => [] as any[])

  try {
    const [outgoing, incoming] = await Promise.all([
      call({ fromAddress: address }), // sends + buy ETH-out legs
      call({ toAddress: address }),   // receives + coin-in legs
    ])

    // Dedupe: a transfer is either from OR to the wallet, but guard for self-transfers
    // (would land in both) by hash + uniqueId/logIndex.
    const seen = new Set<string>()
    const merged = [...outgoing, ...incoming].filter((tx) => {
      const key = `${tx.hash ?? ''}:${tx.uniqueId ?? tx.logIndex ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Sort newest-first by block number (hex → int), then cap. Both calls already return
    // desc, so this just interleaves the two directions correctly.
    merged.sort((a, b) => parseInt(b.blockNum ?? '0x0', 16) - parseInt(a.blockNum ?? '0x0', 16))
    return merged.slice(0, 50)
  } catch {
    return []
  }
}
