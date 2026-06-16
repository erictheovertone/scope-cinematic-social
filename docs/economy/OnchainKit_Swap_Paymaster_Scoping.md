# Scoping: OnchainKit Swap + Base Paymaster (gasless) — investigate, don't build

**Status:** PROPOSAL / scoping. NO swap or paymaster code until Eric picks a path.
**Date:** 2026-06-16 · Extends `Paymaster_SmartWallet_Scoping.md` with OnchainKit specifics.

## Stack we actually run (the facts that drive this)
- `next ^16.2.4`, `react ^18.3.1`, `viem ^2.48.4`, `@privy-io/react-auth ^2.25.0`, `@zoralabs/coins-sdk ^0.6.0`.
- `wagmi ^3.6.8` is **installed but used NOWHERE** (no `WagmiProvider`, no `createConfig`, no `useAccount` in `src/`).
- `@tanstack/react-query`, `@privy-io/wagmi`, `@coinbase/onchainkit`, `permissionless` — **not installed**.
- Wallet wiring: we get a **viem walletClient** straight from Privy —
  `createWalletClient({ transport: custom(await embeddedWallet.getEthereumProvider()) })`
  (`CreatePostFlow.tsx:846`, `CollectSheet.tsx:125`, `CreateCoinSheet.tsx:65`). **No wagmi connector anywhere.**

## 1. OnchainKit `<Swap>` — fit + requirements
OnchainKit's `<Swap>` is **built on wagmi + viem + @tanstack/react-query**, and reads the active account from **wagmi** (`useAccount`, wagmi tx hooks), quoting via Coinbase Developer Platform (CDP).

To drop it in we'd need to ADD, none of which exist today:
- `@coinbase/onchainkit` + `@tanstack/react-query` (+ align `wagmi`/`viem` to OnchainKit's peer ranges — **verify OnchainKit supports our `wagmi ^3.x`; it has historically pinned wagmi v2**, so a major-version reconcile may be required).
- A provider stack wrapping the app/wallet page: `<WagmiProvider>` → `<QueryClientProvider>` → `<OnchainKitProvider apiKey={CDP_KEY} chain={base}>`.
- A **CDP API key** (new account + env var) for swap quotes.

**Privy compatibility — the critical answer:** OnchainKit's `<Swap>` does **not** see our Privy embedded wallet out of the box — it expects a **wagmi connector**, and we use Privy's viem client directly. To bridge: install **`@privy-io/wagmi`** (Privy's official wagmi connector), build a wagmi `createConfig` with the Privy connector, and wrap in `WagmiProvider + QueryClientProvider`. Then OnchainKit sees the embedded wallet as the active wagmi account. **Verdict: compatible, but NOT a drop-in** — it means standing up a wagmi+react-query+OnchainKit provider layer plus the Privy↔wagmi connector. Bundle cost: OnchainKit + (now-used) wagmi + react-query ≈ a few hundred KB.

## 2. Does the swap help a ZERO-ETH wallet? **No.**
A swap is itself a gas-costing transaction. A **zero-ETH wallet cannot pay gas**, so it can't run the swap to *get* ETH — the chicken-and-egg. **Confirmed: plain OnchainKit swap fails on the exact wallet that hits FUND WALLET.**
So a plain swap only helps wallets that **already hold some ETH** (a top-up). It solves the real (zero-ETH) case **only with gas sponsorship** — and sponsorship (a paymaster) sponsors **UserOperations from a smart account**, not plain-EOA txs. ⇒ sponsored swap **requires smart wallets** (§3). Frame everything around that.

## 3. Paymaster / gasless on Base (the real enabler)
- **Provider:** **Coinbase Paymaster (CDP)** integrates cleanest with an OnchainKit-leaning stack (same vendor; `<Transaction isSponsored>` + paymaster URL), generous Base tier. **Pimlico / Biconomy** are provider-agnostic alternatives (more wiring). For us: **CDP**.
- **Privy smart wallets (ERC-4337):** they **LAYER ON TOP** of the embedded wallet — the embedded EOA becomes the **signer/owner** of a **new smart-contract account** (Coinbase Smart Account / Kernel / Safe). They do **not** replace the embedded wallet, **but the smart account has a NEW ADDRESS**.
- **Scope to adopt:** add Privy smart-wallet config + a bundler + CDP paymaster; route **mint/trade/swap as UserOperations** through the smart account. Every tx-send site (`zoraCoins`: `executeQuotedTrade`, `createCoin`, `tradeCoin`; wallet SEND) must use the smart-wallet client.
- **Migration (existing users):** new SCA address per user. Existing EOAs hold current funds and are the **immutable** `creator`/`payoutRecipientOverride` on already-minted coins (earnings keep flowing to the EOA). Options: (a) **new users only** get SCAs; (b) **opt-in sweep** EOA→SCA; (c) **keep EOAs** + onramp. A mixed model is unavoidable for existing creators.
- **THE BIG PRIZE — gasless MINTING: YES.** A paymaster sponsors **any** UserOp, so sending `createCoin` through the smart account = **sponsored mint**. A USDC-only, **zero-ETH user could mint with NO ETH**. That **removes the "you need ETH" problem entirely** rather than bridging it — and makes the **swap largely unnecessary** (nothing to swap *for*). This reorders the whole effort: if mints are sponsored, the swap is no longer the point. *(Needs a testnet spike to confirm Zora's `createCoin`/`tradeCoin` send cleanly as UserOps + Permit2-in-UserOp.)*

## 4. Cost + control of sponsorship
- **Per-action cost on Base is tiny:** `createCoin` ≈ 1.5–3M gas at sub-0.05 gwei ≈ **fractions of a cent to ~1–2¢**; a swap/trade similar. Sponsoring these is cheap but not zero — Scope pays.
- **Control:** CDP/Pimlico/Biconomy support **gas policies** — allowlist specific contracts/methods (sponsor **only** `createCoin` + the trade router + the swap), **per-user / per-day caps**, and a **global budget cap**. Abuse vector (mint-spam to drain budget) is mitigated by **auth-gated sponsorship + per-user rate limits + caps**. So sponsorship can be tightly bounded.

## 5. Recommendation (decision + sequence)
| Path | Solves zero-ETH? | Change class | Blast radius |
|---|---|---|---|
| **A — Plain OnchainKit swap** | ❌ (needs gas) | Integration: wagmi+react-query+OnchainKit+Privy connector+CDP key | Medium; a new provider stack; doesn't fix the real case |
| **B — Onramp ETH directly** | ✅ today | Config (Privy `fundWallet` asset ETH) | **Zero — already shipped** |
| **C — Smart wallets + paymaster** | ✅✅ (gasless swap **and** gasless mint) | **New wallet type + infra** | Large: new address per user, UserOps everywhere, migration, sponsorship controls |

**Recommended sequence:**
1. **Keep B (shipped)** as the universal fallback for zero-ETH.
2. **Spike C on testnet (no prod change):** Privy smart wallet + CDP paymaster, send a **sponsored `createCoin`** (and a sponsored `tradeCoin`) as UserOps. Confirm the Zora SDK works through the smart-wallet client. **This validates the prize (gasless mint) and de-risks the new wallet type before any commitment.**
3. **If the spike passes → pursue C for NEW users** (sponsored mint + first trade, gas-policy-capped). Onboarding becomes "buy USDC → mint, never touch ETH." At that point **don't build A** — the swap is moot; fold it in only if users still need ETH for non-sponsored actions.
4. **Existing users:** keep EOAs + onramp (B); offer opt-in migration later if warranted.

**Bottom line:** Don't build the plain swap (A) — it doesn't solve the zero-ETH problem and adds a provider stack. The real decision is **C**, whose headline payoff is **gasless minting** (may delete the gas problem, not just bridge it). It's a **new wallet type** (the big blast radius), so validate with a **testnet spike** before committing. B already covers today.

## Open items before any build
1. Does OnchainKit support `wagmi ^3.x`, or must we reconcile to wagmi v2? (verify peer deps)
2. Testnet spike: does `@zoralabs/coins-sdk` `createCoin`/`tradeCoin` send cleanly as a UserOp via Privy's smart-wallet client + CDP paymaster (incl. Permit2)?
3. CDP paymaster gas-policy + monthly budget acceptable; abuse caps defined.
4. Two-address model for existing creators (EOA earnings vs new SCA) — product-acceptable, or migration needed?
