// ── getEmbeddedAddress — the ONE derivation of "the wallet Scope uses" (W10/W10a) ─
//
// Scope transacts with the EMBEDDED Privy wallet (walletClientType 'privy') — every
// collect/trade path uses it. Privy's `user.wallet.address` is the PRIMARY wallet, which is
// a LINKED EXTERNAL wallet when the user has one. Reading/storing the primary shows/persists
// the wrong wallet (W10 = display leak; W10a = the stored users.wallet_address). This is the
// single source of truth — display surfaces AND the signup write derive the address here.
//
// Structural types (no Privy type import): works for both usePrivy().user and useWallets().wallets.

type WalletLike = { walletClientType?: string; address?: string | null };
type UserLike = { wallet?: { address?: string | null } | null } | null | undefined;

/** The embedded wallet's address, falling back to the primary ONLY when there's no embedded
 *  wallet (a genuinely external-only user, or the embedded not yet created — Privy makes it
 *  async, so at signup this can transiently be the primary; the UserSyncProvider re-sync
 *  corrects the stored row once the embedded resolves). Returns null when neither exists. */
export function getEmbeddedAddress(user: UserLike, wallets: readonly WalletLike[] | undefined): string | null {
  const embedded = (wallets ?? []).find((w) => w.walletClientType === 'privy')?.address;
  return embedded ?? user?.wallet?.address ?? null;
}
