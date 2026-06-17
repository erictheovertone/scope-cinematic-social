# Indexer Scoping — Zora API vs. self-hosted indexer (verify before building)

**Status:** SCOPING / proposal. NO indexer or aggregation code until Eric picks the path.
**Date:** 2026-06-17 · Findings are from the LIVE Zora Coins API (real Scope coins, real `ZORA_API_KEY`).

## TL;DR
A from-scratch indexer (Ponder/viem) is **not needed for v1.** Zora's Coins SDK already
exposes per-coin trades, per-coin volume, and per-wallet balances for the coins we mint.
The right shape is a **lightweight aggregation + caching layer**: Vercel cron jobs read
Zora's API for Scope's coins/users, compute rankings, and cache them in new Supabase tables;
the app reads the cache. The **only** genuine candidate for event-level self-indexing is
**real-time notifications** — and even there, polling is fine for v1. **First Cut does NOT
require a full indexer.**

---

## STEP 1 — The Scope coin registry (the anchor) ✅ exists
Supabase `posts` already stores every coin minted through the app: **41 minted coins** today,
each with `coin_address`, `user_id` (→ creator), `coin_currency`, `coin_tx_hash`, `created_at`.
This is the per-coin aggregation anchor and it's complete enough to build on.

**Flags:**
- **Creator wallet** isn't stored on the post directly — it's `users.wallet_address` (join on
  `user_id`), and Zora also returns `getCoin.creatorAddress`. Recommend persisting
  `creator_address` on the post at mint so aggregation is self-sufficient (no join, no API hop).
- **Completeness edge:** a mint whose on-chain tx landed but whose post-mint DB write failed
  would be missing `coin_address`. `reconcileCoinFromTx(coin_tx_hash)` already exists to recover
  these — a periodic reconcile over rows with `coin_tx_hash` set but `coin_address` null closes
  the gap. Low risk at current scale; worth a guard before relying on the registry as ground truth.

---

## STEP 2 — Each need vs. the LIVE Zora API

### 1. FIRST CUT — first 10 external collectors per coin  → **API suffices (compute-once-store)**
`getCoinSwaps({ address, chain, first, after })` returns per-trade nodes:
`senderAddress`, `recipientAddress`, `blockTimestamp`, `activityType` (BUY/SELL),
`transactionHash`, `coinAmount`, `currencyAmountWithPrice`, `senderProfile`.
- **Ordering:** NEWEST-first, with `pageInfo.hasNextPage` + `endCursor` cursor pagination.
- **External collector** = a BUY where `senderAddress` ≠ `getCoin.creatorAddress` (creator's own
  backing buy is excluded). Both fields are available.
- **Inception reachability:** cursor pagination works; for every current Scope coin (all
  low-volume) inception is 1–few pages back (CONSOL had 1 swap total). **Caveat:** I could not
  stress-test deep pagination on a *high-volume* coin — none exist on Scope yet — so a hard
  pagination cap on a very old, very active coin is unproven.
- **Make-or-break verdict:** First Cut is **immutable**, so certainty matters. The safe design:
  **compute First Cut EARLY** — a job that, for each coin, captures the first 10 external BUYs
  while the coin is still young (few trades) and **stores them permanently**. Once stored, never
  recomputed. This never needs deep pagination. As a certainty **backstop**, viem
  `getLogs` over the coin's ERC-20 `Transfer` events from the mint block reconstructs the true
  first-10 from chain directly (chain = source of truth) if a swap result is ever doubted.
  → **No always-on indexer.** getCoinSwaps (early) + a viem getLogs backstop = certainty.

### 2. WALLET ACTIVITY HISTORY  → **API + existing Alchemy reads; no indexer**
`getProfileBalances({ identifier })` returns the wallet's coin holdings: `balance`,
`walletBalance`, `valuation`, `coin` (20 holdings for the test wallet). That covers **holdings +
valuations**. There is no single "activity feed" endpoint, but the app **already** reads
ETH/USDC tx history via Alchemy (`wallet.ts`), and per-coin trade history is `getCoinSwaps`
filtered to the wallet. → holdings (getProfileBalances) + existing Alchemy tx history covers v1;
a richer unified feed is aggregation, not indexing.

### 3. SCREENING ROOM — top 50 most-traded SCOPE coins  → **API + cache; cheap cron**
- Confirmed: **`getCoinsTopVolume24h` is GLOBAL** (returned MR BASE / USDT / "Base is for
  everyone" — all non-Scope). Not usable directly.
- Approach: **`getCoins({ coins: [...] })` is BATCHED** — one call returns `totalVolume`
  (cumulative — a longer window than 24h), `volume24h`, and `uniqueHolders` for many coins at
  once (verified for CONSOL/C12321/TESTTE). Read the whole 41-coin registry in 1–few batched
  calls, sort by `totalVolume`, take top 50.
- **Cost:** ~1 batched call per refresh today; scales to a handful of batched calls at thousands
  of coins. Trivial as a 6-hr cron. SRH is then awarded to **holders of those top-50 coins**
  (holder check via §4's per-user balances).

### 4. COLLECTOR — top 1k collectors on Scope  → **API + cache (per-USER balances); nightly job**
- `getCoinHolders` **returned empty** in testing (param/field shape unconfirmed) — do **not**
  rely on per-coin holder iteration.
- **Better, confirmed path:** iterate **Scope users** (we have the `users` list + wallets) and
  call `getProfileBalances` per user, filter holdings to our coin registry, and rank. This
  flips the iteration from per-coin to per-user (N users × 1 call), and `getProfileBalances`
  **works** (holdings + `valuation`).
- **Cost:** dozens of calls today (one per Scope user) — a nightly job. At thousands of users,
  store incremental aggregates and refresh in batches. Feasible without an indexer.
- **FLAG for Eric:** define what "activity" ranks on — **holdings valuation** (easiest from
  `valuation`), number of distinct coins collected, or trade volume? Pick one before building.

### 5. ECONOMIC NOTIFICATIONS — "someone collected your post"  → **polling for v1; event listener only if real-time is required**
- Detect new collects by **polling `getCoinSwaps` per coin** on an interval and emitting a
  notification for new BUYs since the last cursor (or by diffing `uniqueHolders`/balance
  snapshots). Latency = the poll interval (minutes), cost = N coins × small calls per tick.
- True real-time needs **viem `watchEvent`** on an always-on process — the one genuine indexer
  candidate. **Recommendation:** polling is good enough for v1 (a "you got collected" notice a
  few minutes late is fine). Only stand up an event listener if real-time becomes a hard product
  requirement.

---

## STEP 3 — Recommended architecture (hypothesis CONFIRMED)
**Lightweight aggregation + caching layer, NOT a self-hosted indexer:**
- **Vercel cron jobs** read Zora's API for Scope's coins (batched `getCoins`) and users
  (`getProfileBalances`), compute rankings, and **cache them in new Supabase tables**
  (`screening_room`, `collector_rank`, `first_cut_holders`). The app reads the cache; badge
  *awarding* flips the existing flags / writes the cache the badge UIs already read.
- **First Cut** = computed once per coin from `getCoinSwaps` (early) and **stored permanently**
  (immutable), with a viem `getLogs` backstop for certainty.
- **Notifications** = polling to start.

**Which needs would genuinely require event-level self-indexing?** Only **real-time
notifications** (and only if "real-time" is mandatory — polling covers v1). First Cut does **not**
(early compute + chain backstop). Screening Room, Collector, and wallet history are all
read-and-cache.

**Strategic tradeoff (state it plainly):**
- **Zora API + cache** = fastest to ship, near-zero infra, but a **dependency** on Zora's uptime,
  rate limits, and product continuity. Their API is the same one our trades already depend on.
- **Self-hosting Ponder** = independence from Zora, but a **large always-on infra lift** (a
  synced node/RPC budget, a DB, an ops surface) for data we can already read.
- **When self-hosting becomes worth it (later insurance, not day-one):** if (a) Zora's API
  becomes unreliable or rate-limits us at scale, (b) real-time notifications become a hard
  requirement, or (c) we need historical analytics Zora doesn't expose. Until one of those is
  real, the cache layer wins.

---

## STEP 4 — Proposed v1 sequence (least effort first)
Display is already built (Pieces 1–6); this is the **awarding** layer.

1. **Screening Room → SRH badge.** Lightest: one cron, 1–few batched `getCoins` calls → cache
   top-50 by `totalVolume` → award SRH to holders of those coins. (6-hr refresh per spec.)
2. **Collector → Collector (Top 1k) badge.** Nightly job: per-Scope-user `getProfileBalances` →
   filter to registry → rank (metric TBD per the flag) → cache top 1k → set `is_top_collector`.
3. **First Cut → First Cut badge.** Per-coin: `getCoinSwaps` → first 10 external BUYs → store
   permanently (`first_cut_holders`); run on new coins + backfill the existing 41. (Immutable —
   write once.)
4. **Wallet activity history.** Mostly display: `getProfileBalances` (holdings/valuation) +
   existing Alchemy tx history. Minimal new work.
5. **Notifications ("you got collected").** Last: poll `getCoinSwaps` per coin → new-BUY notice
   into the existing notifications system.

**Badge → mechanism map:** SRH / Collector / First Cut = the three this scoping unlocks
(Composer, Augmented, Scope Pro, In-House are manual/membership/other flags, not API-derived).

## Open items before any build
1. Eric: define the **Collector ranking metric** (holdings valuation vs. coins collected vs. volume).
2. Confirm there's **no hard pagination cap** on `getCoinSwaps` for a future high-volume coin
   (or rely on early-compute + viem `getLogs` backstop, which sidesteps it).
3. Persist `creator_address` on the post at mint (self-sufficient registry).
4. Add a periodic **reconcile** for coins with `coin_tx_hash` but null `coin_address`.
