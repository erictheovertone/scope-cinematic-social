import { createCreatorClient } from "@zoralabs/protocol-sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const publicClient = createPublicClient({
  chain: base,
  transport: http(
    process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || "https://mainnet.base.org"
  ),
});

// ZoraTimedSaleStrategy mint fee is 0.000111 ETH per token
const ZORA_MINT_FEE_WEI = BigInt("111000000000000");

// ZoraTimedSaleStrategy — default minter on all chains including Base
const ZORA_MINTER_ADDRESS = "0x777777722D078c97c6ad07d9f36801e653E356Ae" as `0x${string}`;

const MINT_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "minter", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "minterArguments", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const TOTAL_SUPPLY_ABI = [
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const BURN_ABI = [
  {
    name: "burn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ── Mint new post ─────────────────────────────────────────────────────────────

export async function mintNewPost({
  walletClient,
  creatorAddress,
  postMetadata,
}: {
  walletClient: any;
  creatorAddress: string;
  postMetadata: { name: string; description: string; image: string };
}) {
  console.log("[zora] mintNewPost — creator:", creatorAddress);

  const creatorClient = createCreatorClient({
    chainId: base.id,
    publicClient: publicClient as any,
  });

  const metadataJson = JSON.stringify(postMetadata);
  const metadataUri = `data:application/json;base64,${btoa(metadataJson)}`;

  const { parameters, contractAddress } = await creatorClient.create1155({
    contract: {
      name: postMetadata.name,
      uri: metadataUri,
    },
    token: {
      tokenMetadataURI: metadataUri,
      salesConfig: {
        type: "fixedPrice",
        pricePerToken: 0n,
        saleStart: 0n,
        saleEnd: BigInt("18446744073709551615"),
        maxTokensPerAddress: 0n,
        fundsRecipient: creatorAddress as `0x${string}`,
      },
      mintToCreatorCount: 1,
    },
    account: creatorAddress as `0x${string}`,
  });

  console.log("[zora] mintNewPost — predicted address:", contractAddress);
  const hash = await walletClient.writeContract(parameters);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("[zora] mintNewPost — confirmed");

  return { contractAddress, hash };
}

// ── Collect (buy) — direct contract call, no SDK subgraph needed ──────────────

export async function collectPost({
  walletClient,
  collectorAddress,
  contractAddress,
  tokenId,
  quantity = 1,
}: {
  walletClient: any;
  collectorAddress: string;
  contractAddress: string;
  tokenId: bigint;
  quantity?: number;
}) {
  console.log("[zora] collectPost — contract:", contractAddress, "tokenId:", tokenId.toString(), "qty:", quantity);

  const { encodeAbiParameters, parseAbiParameters, encodeFunctionData } = await import("viem");

  // Zora 1155 mint function signature:
  // mint(address minter, uint256 tokenId, uint256 quantity, address[] calldata rewardsRecipients, bytes calldata minterArguments)
  const ZORA_1155_MINT_ABI = [
    {
      name: "mint",
      type: "function",
      stateMutability: "payable",
      inputs: [
        { name: "minter", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "quantity", type: "uint256" },
        { name: "rewardsRecipients", type: "address[]" },
        { name: "minterArguments", type: "bytes" },
      ],
      outputs: [],
    },
  ] as const;

  // ZoraTimedSaleStrategy minterArguments = abi encoded (address recipient, string comment)
  const minterArguments = encodeAbiParameters(
    parseAbiParameters("address, string"),
    [collectorAddress as `0x${string}`, "Collected on Scope"]
  );

  // rewardsRecipients = empty array (no referral)
  const rewardsRecipients: `0x${string}`[] = [];

  // value = platform fee × quantity
  const totalValue = ZORA_MINT_FEE_WEI * BigInt(quantity);

  console.log("[zora] collectPost — totalValue (wei):", totalValue.toString());
  console.log("[zora] collectPost — minterArguments:", minterArguments);

  // First simulate to catch revert reasons before sending
  try {
    await publicClient.simulateContract({
      address: contractAddress as `0x${string}`,
      abi: ZORA_1155_MINT_ABI,
      functionName: "mint",
      args: [
        ZORA_MINTER_ADDRESS,
        tokenId,
        BigInt(quantity),
        rewardsRecipients,
        minterArguments,
      ],
      value: totalValue,
      account: collectorAddress as `0x${string}`,
    });
    console.log("[zora] collectPost — simulation passed");
  } catch (simErr: any) {
    console.error("[zora] collectPost — simulation failed:", simErr?.message);
    throw simErr;
  }

  const hash = await walletClient.writeContract({
    address: contractAddress as `0x${string}`,
    abi: ZORA_1155_MINT_ABI,
    functionName: "mint",
    args: [
      ZORA_MINTER_ADDRESS,
      tokenId,
      BigInt(quantity),
      rewardsRecipients,
      minterArguments,
    ],
    value: totalValue,
    chain: base,
    account: collectorAddress as `0x${string}`,
  });

  console.log("[zora] collectPost — tx hash:", hash);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("[zora] collectPost — confirmed");

  return { hash };
}

// ── Get token price ───────────────────────────────────────────────────────────

export async function getTokenPrice({
  contractAddress,
  tokenId,
  quantity = 1,
}: {
  contractAddress: string;
  tokenId: bigint;
  quantity?: number;
}): Promise<bigint> {
  console.log("[zora] getTokenPrice — contract:", contractAddress, "qty:", quantity);
  // On Base all Zora 1155 tokens use the fixed platform fee only
  const total = ZORA_MINT_FEE_WEI * BigInt(quantity);
  console.log("[zora] getTokenPrice — total (wei):", total.toString());
  return total;
}

// ── Sell (burn) ───────────────────────────────────────────────────────────────

export async function sellPost({
  walletClient,
  holderAddress,
  contractAddress,
  tokenId,
  quantity = 1,
}: {
  walletClient: any;
  holderAddress: string;
  contractAddress: string;
  tokenId: bigint;
  quantity?: number;
}) {
  console.log("[zora] sellPost (burn) — contract:", contractAddress, "qty:", quantity);

  const hash = await walletClient.writeContract({
    address: contractAddress as `0x${string}`,
    abi: BURN_ABI,
    functionName: "burn",
    args: [holderAddress as `0x${string}`, tokenId, BigInt(quantity)],
    chain: base,
    account: holderAddress as `0x${string}`,
  });

  console.log("[zora] sellPost — tx hash:", hash);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("[zora] sellPost — confirmed (burned)");

  return { hash };
}

// ── Holder balance ────────────────────────────────────────────────────────────

export async function getHolderBalance({
  contractAddress,
  tokenId,
  holderAddress,
}: {
  contractAddress: string;
  tokenId: bigint;
  holderAddress: string;
}): Promise<bigint> {
  try {
    const balance = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: BALANCE_ABI,
      functionName: "balanceOf",
      args: [holderAddress as `0x${string}`, tokenId],
    });
    return balance as bigint;
  } catch {
    return BigInt(0);
  }
}

// ── Total supply ──────────────────────────────────────────────────────────────

export async function getTokenHolders({
  contractAddress,
  tokenId,
}: {
  contractAddress: string;
  tokenId: bigint;
}): Promise<bigint> {
  try {
    const supply = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: TOTAL_SUPPLY_ABI,
      functionName: "totalSupply",
      args: [tokenId],
    });
    console.log("[zora] getTokenHolders — supply:", (supply as bigint).toString());
    return supply as bigint;
  } catch {
    // Contract may not support totalSupply with tokenId arg — return 0 silently
    return BigInt(0);
  }
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

export async function diagnoseContract(contractAddress: string, tokenId: bigint) {
  console.log("[diag] checking contract:", contractAddress);

  const salesConfigAbi = [
    {
      name: "getPermissions",
      type: "function",
      stateMutability: "view",
      inputs: [
        { name: "tokenId", type: "uint256" },
        { name: "user", type: "address" },
      ],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      name: "contractVersion",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [{ name: "", type: "string" }],
    },
  ] as const;

  try {
    const version = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: salesConfigAbi,
      functionName: "contractVersion",
      args: [],
    });
    console.log("[diag] contract version:", version);
  } catch(e) {
    console.log("[diag] contractVersion failed:", e);
  }

  // Try reading bytecode to confirm contract exists
  const code = await publicClient.getBytecode({
    address: contractAddress as `0x${string}`,
  });
  console.log("[diag] bytecode length:", code?.length ?? 0);
}

export async function getSaleConfig(contractAddress: string, tokenId: bigint) {
  const FIXED_PRICE_MINTER = "0x04E2516A2c207E84a1839755675dfd8eF6302F0a";
  const saleAbi = [
    {
      name: "sale",
      type: "function",
      stateMutability: "view",
      inputs: [
        { name: "tokenContract", type: "address" },
        { name: "tokenId", type: "uint256" },
      ],
      outputs: [
        {
          type: "tuple",
          components: [
            { name: "pricePerToken", type: "uint96" },
            { name: "saleStart", type: "uint64" },
            { name: "saleEnd", type: "uint64" },
            { name: "maxTokensPerAddress", type: "uint32" },
            { name: "fundsRecipient", type: "address" },
          ],
        },
      ],
    },
  ] as const;

  try {
    const result = await publicClient.readContract({
      address: FIXED_PRICE_MINTER as `0x${string}`,
      abi: saleAbi,
      functionName: "sale",
      args: [contractAddress as `0x${string}`, tokenId],
    });
    console.log("[diag] sale config:", JSON.stringify(result, (_, v) =>
      typeof v === "bigint" ? v.toString() : v
    ));
    return result;
  } catch(e) {
    console.log("[diag] sale config read failed:", e);
    return null;
  }
}
