// ── Trade pre-flight — "can this wallet afford it?" (ONE source of truth) ─────
//
// Answers BEFORE a trade is attempted, so an underfunded wallet gets a specific
// "you need ~$X.XX more USDC" + fund path instead of a doomed attempt ending in
// an opaque route-500. Used by: mint-flow backing (CreatePostFlow), CollectSheetV2
// buy and sell. It gates ATTEMPTS only — never coin creation (gating the mint on
// USDC-for-backing was the FUND WALLET mis-fire; see MintPromptSheet), and never
// the receipt-true confirmation logic behind it.
//
// FAIL-OPEN: if the balance read itself errors, the answer is ok — the trade
// attempt is the loud gate (same philosophy as the mint gas gate). A pre-flight
// must never block a funded wallet on a flaky RPC read.

import { getEthBalance, getUsdcBalance } from "@/lib/wallet";

/** The one gas floor, shared with the mint gate (MintPromptSheet imports this).
    createCoin/trades on Base ≈ a few M gas at sub-0.05 gwei → well under
    0.0002 ETH (cents). 0.0005 false-gated funded wallets — don't raise it. */
export const GAS_FLOOR_ETH = 0.0002;

export type Preflight =
  | { ok: true }
  | { ok: false; reason: "insufficient_usdc"; shortfallUsd: number }
  | { ok: false; reason: "insufficient_eth"; shortfallEth: number }
  | { ok: false; reason: "insufficient_gas" }
  | { ok: false; reason: "insufficient_coin"; havePieces: number };

export async function preflightTrade(args: {
  wallet: string;
  /** USDC the action spends (buy / backing quote). */
  requireUsdc?: number;
  /** ETH the action spends (ETH-paid buy), gas excluded. */
  requireEth?: number;
  /** SELL: required balance is the COIN, not USDC — checked from the pieces the
      caller already holds (V2's market read); no new RPC pattern. */
  coin?: { have: number; need: number };
}): Promise<Preflight> {
  const { wallet, requireUsdc, requireEth, coin } = args;

  // Coin sufficiency needs no chain read — answer it first.
  if (coin && coin.need > coin.have) {
    return { ok: false, reason: "insufficient_coin", havePieces: coin.have };
  }
  if (!wallet) return { ok: true }; // no wallet to read — the attempt is the gate

  try {
    const [ethStr, usdcStr] = await Promise.all([
      getEthBalance(wallet),
      requireUsdc != null ? getUsdcBalance(wallet) : Promise.resolve(null),
    ]);
    const eth = parseFloat(ethStr);

    if (requireUsdc != null && usdcStr != null) {
      const usdc = parseFloat(usdcStr);
      if (usdc < requireUsdc) {
        return { ok: false, reason: "insufficient_usdc", shortfallUsd: requireUsdc - usdc };
      }
    }
    if (requireEth != null && eth < requireEth + GAS_FLOOR_ETH) {
      return { ok: false, reason: "insufficient_eth", shortfallEth: requireEth + GAS_FLOOR_ETH - eth };
    }
    if (eth < GAS_FLOOR_ETH) return { ok: false, reason: "insufficient_gas" };
    return { ok: true };
  } catch (e) {
    console.warn("[preflight] balance read failed (fail-open — the attempt is the gate):", e);
    return { ok: true };
  }
}

/** The one message source — always states the amount, never bare "insufficient
    funds". Inline copy for the sheets' existing red error slots. */
export function preflightMessage(
  r: Preflight,
  ctx?: { action?: "back" | "buy" | "sell"; ticker?: string | null },
): string | null {
  if (r.ok) return null;
  const doing = ctx?.action === "back" ? "to back this" : ctx?.action === "sell" ? "for this sale" : "for this buy";
  switch (r.reason) {
    case "insufficient_usdc":
      return `You need ~$${Math.max(0.01, r.shortfallUsd).toFixed(2)} more USDC ${doing} — fund your wallet.`;
    case "insufficient_eth":
      return `You need ~${r.shortfallEth.toFixed(5)} more ETH ${doing} — fund your wallet, or pay with USDC.`;
    case "insufficient_gas":
      return "You need a little ETH for the network fee — add ETH to your wallet.";
    case "insufficient_coin":
      return `You don't hold enough ${ctx?.ticker || "of this coin"} — you can sell up to ${r.havePieces.toLocaleString()}.`;
  }
}
