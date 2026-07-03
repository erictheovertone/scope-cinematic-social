// ── Imported ERC-20 assets (wallet BALANCES list) ─────────────────────────────
//
// Address-paste imports only (no discovery). Persistence: the `user_assets`
// table (SQL provided for manual migration) with a localStorage FALLBACK so the
// feature works before the migration lands — reads merge both, writes try DB
// first and degrade to local. Balance reads reuse the existing publicClient
// readContract pattern; USD pricing is intentionally out of scope (balance-only
// rows when no price source exists).

import { supabase } from "@/lib/supabase/client";
import { publicClient } from "@/lib/zoraCoins";
import { getAddress } from "viem";

export interface UserAsset {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
}

const ERC20_META = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const lsKey = (uuid: string) => `scope_assets_${uuid}`;
const readLocal = (uuid: string): UserAsset[] => {
  try { return JSON.parse(localStorage.getItem(lsKey(uuid)) ?? "[]"); } catch { return []; }
};

/** Validate + resolve a pasted address as a live ERC-20 on Base: format check,
    then symbol()+decimals() must both answer (= contract exists and is a token). */
export async function resolveErc20(addressRaw: string): Promise<UserAsset | { error: string }> {
  const trimmed = addressRaw.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return { error: "That's not a valid contract address." };
  let address: `0x${string}`;
  try { address = getAddress(trimmed); } catch { return { error: "That's not a valid contract address." }; }
  try {
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({ address, abi: ERC20_META, functionName: "symbol" }),
      publicClient.readContract({ address, abi: ERC20_META, functionName: "decimals" }),
    ]);
    if (typeof symbol !== "string" || !symbol) return { error: "No token found at that address on Base." };
    return { address, symbol: symbol.slice(0, 12), decimals: Number(decimals) };
  } catch {
    return { error: "No token found at that address on Base." };
  }
}

export async function getUserAssets(uuid: string): Promise<UserAsset[]> {
  let db: UserAsset[] = [];
  try {
    const { data } = await supabase
      .from("user_assets").select("contract_address, symbol, decimals").eq("user_id", uuid);
    db = (data ?? []).map((r) => ({ address: r.contract_address as `0x${string}`, symbol: r.symbol, decimals: r.decimals }));
  } catch { /* table may not exist yet — local carries it */ }
  const merged = new Map<string, UserAsset>();
  [...db, ...readLocal(uuid)].forEach((a) => merged.set(a.address.toLowerCase(), a));
  return [...merged.values()];
}

/** Returns where it persisted ('db' | 'local'), or 'duplicate'. */
export async function addUserAsset(uuid: string, asset: UserAsset): Promise<"db" | "local" | "duplicate"> {
  const existing = await getUserAssets(uuid);
  if (existing.some((a) => a.address.toLowerCase() === asset.address.toLowerCase())) return "duplicate";
  try {
    const { error } = await supabase.from("user_assets").insert({
      user_id: uuid, contract_address: asset.address, symbol: asset.symbol, decimals: asset.decimals,
    });
    if (!error) return "db";
  } catch { /* fall through to local */ }
  try {
    localStorage.setItem(lsKey(uuid), JSON.stringify([...readLocal(uuid), asset]));
  } catch { /* private mode — session-only */ }
  return "local";
}

export async function readAssetBalance(asset: UserAsset, wallet: `0x${string}`): Promise<string | null> {
  try {
    const b = (await publicClient.readContract({ address: asset.address, abi: ERC20_META, functionName: "balanceOf", args: [wallet] })) as bigint;
    const v = Number(b) / 10 ** asset.decimals;
    return v.toFixed(v > 0 && v < 0.01 ? 6 : v < 1000 ? 4 : 2);
  } catch { return null; }
}
