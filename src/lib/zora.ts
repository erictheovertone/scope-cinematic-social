import { createCollectorClient, createCreatorClient } from "@zoralabs/protocol-sdk";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(
    process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || "https://sepolia.base.org"
  ),
});

export async function mintNewPost({
  walletClient,
  creatorAddress,
  postMetadata,
}: {
  walletClient: any;
  creatorAddress: string;
  postMetadata: {
    name: string;
    description: string;
    image: string;
  };
}) {
  console.log("[zora] mintNewPost — creator:", creatorAddress);

  const creatorClient = createCreatorClient({
    chainId: baseSepolia.id,
    publicClient: publicClient as any,
  });

  const metadataJson = JSON.stringify({
    name: postMetadata.name,
    description: postMetadata.description,
    image: postMetadata.image,
  });
  const metadataUri = `data:application/json;base64,${btoa(metadataJson)}`;

  const { parameters, contractAddress } = await creatorClient.create1155({
    contract: {
      name: postMetadata.name,
      uri: metadataUri,
    },
    token: {
      tokenMetadataURI: metadataUri,
    },
    account: creatorAddress as `0x${string}`,
  });

  console.log("[zora] mintNewPost — writing contract, predicted address:", contractAddress);
  const hash = await walletClient.writeContract(parameters);
  console.log("[zora] mintNewPost — tx hash:", hash);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("[zora] mintNewPost — confirmed");

  return { contractAddress, hash };
}

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

  const collectorClient = createCollectorClient({
    chainId: baseSepolia.id,
    publicClient: publicClient as any,
  });

  const { parameters } = await collectorClient.mint({
    minterAccount: collectorAddress as `0x${string}`,
    mintType: "1155",
    tokenContract: contractAddress as `0x${string}`,
    tokenId,
    quantityToMint: quantity,
    mintComment: "Collected on Scope",
  });

  const hash = await walletClient.writeContract(parameters);
  console.log("[zora] collectPost — tx hash:", hash);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("[zora] collectPost — confirmed");

  return { hash };
}

export async function getTokenPrice({
  contractAddress,
  tokenId,
  quantity = 1,
}: {
  contractAddress: string;
  tokenId: bigint;
  quantity?: number;
}) {
  console.log("[zora] getTokenPrice — contract:", contractAddress, "tokenId:", tokenId.toString());

  const collectorClient = createCollectorClient({
    chainId: baseSepolia.id,
    publicClient: publicClient as any,
  });

  const { parameters } = await collectorClient.mint({
    minterAccount: "0x0000000000000000000000000000000000000000",
    mintType: "1155",
    tokenContract: contractAddress as `0x${string}`,
    tokenId,
    quantityToMint: quantity,
    mintComment: "",
  });

  const price = (parameters as any).value || BigInt(0);
  console.log("[zora] getTokenPrice — price (wei):", price.toString());
  return price as bigint;
}

export async function getTokenHolders({
  contractAddress,
  tokenId,
}: {
  contractAddress: string;
  tokenId: bigint;
}) {
  console.log("[zora] getTokenHolders — contract:", contractAddress, "tokenId:", tokenId.toString());

  const supply = await publicClient.readContract({
    address: contractAddress as `0x${string}`,
    abi: [
      {
        name: "totalSupply",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "totalSupply",
    args: [tokenId],
  });

  console.log("[zora] getTokenHolders — supply:", supply.toString());
  return supply as bigint;
}
