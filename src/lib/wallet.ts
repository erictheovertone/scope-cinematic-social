import { createPublicClient, http, formatEther, formatUnits } from 'viem'
import { baseSepolia } from 'viem/chains'

const client = createPublicClient({
  chain: baseSepolia,
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

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

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
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getAssetTransfers',
          params: [
            {
              fromAddress: address,
              toAddress: address,
              category: ['external', 'erc20'],
              withMetadata: true,
              maxCount: '0x14',
            },
          ],
        }),
      },
    )
    const data = await response.json()
    return data.result?.transfers || []
  } catch {
    return []
  }
}
