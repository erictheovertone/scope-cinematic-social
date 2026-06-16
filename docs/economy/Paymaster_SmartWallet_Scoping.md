# Scoping: Privy Smart Wallets + Base Paymaster (gasless mints/trades/swap)

**Status:** PROPOSAL / blast-radius assessment — NOT approved, NOT a build.
**Date:** 2026-06-16
**Author:** CC (for Eric's review)

## Why this doc exists

Onboarding funds wallets with **USDC**, but every on-chain action (mint a coin,
trade, swap) costs **ETH gas**. A USDC-only wallet with zero ETH is stuck. We
already shipped the bridge — onramp ETH directly via Privy `useFundWallet`
(`asset: 'native-currency'`) — which works today with zero infra change.

The question Eric raised: a **paymaster** might remove the gas gap **entirely**
(not just bridge it). This doc scopes that: what changes, what it risks, the
migration story for existing wallets, and — crucially — **whether it makes
MINTING gasless too, not just the swap.**

## TL;DR

- **Yes — a paymaster makes minting, trading, AND the swap gasless.** It is not
  swap-specific. If actions route through a smart wallet with a sponsoring (or
  USDC-paying) paymaster, a **zero-ETH, USDC-only user can mint with no ETH**.
  That removes the gas gap rather than bridging it — the real onboarding win.
- **But the blast radius is large.** Smart wallets are a **new account type with
  a new address per user**, all tx-sending code moves to **UserOperations**, and
  there are migration + cost-control + abuse questions. This is infra, not a file.
- **Recommendation:** phased — new users get smart wallets + sponsored mint/first-
  trade gas (Coinbase Paymaster is free on Base); existing users keep their EOA
  (or opt-in migrate); **keep onramp-ETH as the universal fallback.** Decide
  based on how central "USDC-only, never touch ETH" onboarding is.

## What changes

Today: each user has a Privy **embedded EOA** (`walletClientType === 'privy'`).
Mints/trades are `walletClient.sendTransaction` from that EOA, paying ETH gas.

With smart wallets (ERC-4337):
1. **New account per user** — a smart-contract account (SCA) controlled by the
   embedded EOA as signer. **Different address** than the EOA.
2. **Tx-sending becomes UserOperations** — sent via a bundler, with a paymaster
   sponsoring gas (or charging gas in USDC). Every `sendTransaction` in the trade
   path (`zoraCoins.ts`: `executeQuotedTrade`, `createScopeCoin`/`createCoin`,
   `buyCoin`/`sellCoin`/`backOwnCoin` via the SDK) must route through the
   smart-wallet client.
3. **Paymaster + bundler infra** — a provider (Coinbase Developer Platform
   Paymaster — free on Base; or Pimlico/Biconomy), a gas-sponsorship **policy**
   (per-user/op limits to stop abuse), and optionally a **USDC paymaster** so the
   user pays gas in USDC instead of Scope sponsoring it.

## Does it make MINTING gasless too? (the key question)

**Yes.** A paymaster sponsors **any** UserOperation, not just a swap:
- `createCoin` (mint) → sponsored → **mint with zero ETH.**
- `tradeCoin` buy/sell + the creator backing → sponsored → **trade/back with zero ETH.**
- USDC→ETH "swap" → becomes **unnecessary for gas** (if mint/trade are sponsored,
  there's nothing to swap *for*). The swap only remains relevant if we want users
  to hold ETH for non-sponsored actions.

So if we adopt this, the **swap feature may be moot** — the paymaster removes the
reason for it. That's why this is the strategic fork: **don't build the swap;
decide on the paymaster.** Either we sponsor gas (no swap needed) or we onramp ETH
(shipped, no swap needed). The standalone USDC→ETH swap is the weakest of the three.

## Risks / blast radius

1. **New address per user.** All on-chain identity is currently tied to the EOA:
   minted coins' `creator` + `payoutRecipientOverride` (immutable), holdings,
   balances, the wallet page, notifications keyed on wallet. A smart wallet is a
   **different address** → fragmentation unless handled.
2. **Existing coins' payout — CORRECTION (verified 2026-06-16): MUTABLE.**
   `updatePayoutRecipient` is a first-class coins-sdk action (owner-signed). So
   `payoutRecipientOverride` on already-minted coins **defaults to the old EOA
   (won't break — earnings keep flowing to the EOA, which stays the smart-wallet
   signer, so funds remain accessible)** AND **can be repointed to the new SCA**.
   Migration is non-destructive and improvable — not the "immutable, stuck on EOA"
   blocker stated earlier.
3. **Every wallet-touching surface changes** — `wallet.ts` balance/tx-history
   reads, the wallet page, address display, all tx-sending in `zoraCoins.ts`,
   Permit2 signing in `tradeCoin`, the funding gate's balance read. Each must
   understand the SCA address and UserOp flow.
4. **SDK compatibility.** `@zoralabs/coins-sdk` `tradeCoin`/`createCoin` take a
   `walletClient`; sending as a UserOp through a smart-wallet client + paymaster
   needs validation (gas estimation, Permit2 inside a UserOp, bundler quirks).
5. **Sponsorship cost + abuse.** Sponsored gas = Scope pays. Base gas is sub-cent,
   but mint-spam could drain a sponsorship budget → need per-user/per-day limits,
   and probably gate sponsorship behind auth + rate limits. A USDC paymaster
   (user pays gas in USDC) sidesteps the cost but needs the user to hold USDC.
6. **Migration UX.** Existing users with funds in their EOA: do we (a) run SCAs
   only for new users, (b) prompt existing users to move funds EOA→SCA (costs a
   tx + consent), or (c) keep EOAs for everyone and only sponsor via a different
   mechanism? Each has UX + support cost.

## Migration options for existing embedded wallets

- **A — New users only:** SCAs for new signups; existing users stay on EOAs +
  onramp-ETH. Least disruptive; two wallet classes to support indefinitely.
- **B — Opt-in migration:** offer existing users a "switch to gasless" that
  provisions an SCA and sweeps funds. Cleaner long-term; needs a sweep flow,
  consent, and handling of immutable payout addresses on old coins.
- **C — No migration:** keep EOAs for all; do NOT adopt SCAs; rely on onramp-ETH
  (shipped). Zero blast radius; the gas gap is *bridged*, not removed.

## Recommendation

- If "buy USDC → mint immediately, never see ETH" is a **core onboarding goal**,
  pursue **smart wallets + Coinbase Base Paymaster**, phased: **A** (new users
  get SCAs + sponsored mint/first-trade gas with per-user limits), keep EOAs for
  existing users, keep onramp-ETH as the universal fallback. **Skip the standalone
  swap** — sponsorship removes its purpose.
- If onboarding friction is **tolerable**, do **nothing further**: onramp-ETH
  (shipped) bridges the gap with zero blast radius, and the race fix already
  stops the phantom FUND WALLET. Revisit the paymaster when scale justifies it.

## Open questions to resolve before any build

1. Coinbase Paymaster gas policy + monthly sponsorship budget acceptable?
2. Does `@zoralabs/coins-sdk` send cleanly as a UserOp through Privy's smart-wallet
   client (mint + Permit2 trades)? Needs a spike on testnet.
3. Two-address model for existing creators (old EOA earnings vs new SCA) — product
   acceptable, or do we need a sweep/migration?
4. Abuse controls for sponsored mints (rate limit, auth gate, per-user cap)?
