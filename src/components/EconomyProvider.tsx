'use client';
// ── EconomyProvider — the single boundary every economy surface reads through ──
//
// THE ONE DISCIPLINE (Economy UI brief): all economy surfaces read market /
// earnings / badge / first-cut data from `useEconomy()` — never directly. Phase
// 1 is backed by the mock implementation; later the SAME `EconomyApi` is backed
// by Zora reads + the trade indexer, and no surface changes.
//
// This provider is cheap and side-effect-free, so it mounts always. Gating of
// the *visible* Part 2 surfaces is done by each surface via
// `economyPreviewEnabled()` — the boundary itself is not what's gated.

import { createContext, useContext, useMemo, useRef, ReactNode } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';
import type { EconomyApi } from '@/lib/economy/types';
import { mockEconomy } from '@/lib/economy/mock';
import { createRealEconomy } from '@/lib/economy/real';

const Ctx = createContext<EconomyApi>(mockEconomy);

/** Read economy data here and ONLY here. */
export const useEconomy = (): EconomyApi => useContext(Ctx);

// ── Legacy gate ───────────────────────────────────────────────────────────────
//
// A post has a MARKET (price/MC/curve/First Cut) iff it minted as a Zora COIN.
// Legacy 1155 posts (no coin_address) are collectibles WITHOUT markets and must
// show no market UI (Scope_Economy.docx §9). This predicate is the single gate;
// market surfaces compose it with the dev preview flag — see CollectSheetGate.
export function isCoinPost(
  post: { coin_address?: string | null; token_standard?: string | null } | null | undefined
): boolean {
  return !!post && !!post.coin_address && post.token_standard === 'coin';
}

export function EconomyProvider({
  children,
  api,
}: {
  children: ReactNode;
  /** Test override; by default the Stage-A hybrid (real coin reads, mock rest). */
  api?: EconomyApi;
}) {
  // Stage A: real pool reads for coin posts. Stage B: real trades — the
  // boundary gets a wallet-client factory (built at trade time from the Privy
  // embedded wallet), so trade calls stay behind the same EconomyApi.
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const viewerAddress = user?.wallet?.address ?? null;
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  const value = useMemo(() => {
    const getWalletClient = async () => {
      const embedded = walletsRef.current.find((w) => w.walletClientType === 'privy');
      if (!embedded) throw new Error('Wallet not ready — try again in a moment.');
      await embedded.switchChain(base.id);
      const provider = await embedded.getEthereumProvider();
      return createWalletClient({ account: embedded.address as `0x${string}`, chain: base, transport: custom(provider) });
    };
    return api ?? createRealEconomy(viewerAddress, getWalletClient);
  }, [api, viewerAddress]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
