# Indexer / Data Layer — DECISIONS (source of truth)

**Status:** LOCKED plan. Scoping complete + verified against the live Zora API
(`docs/economy/Indexer_Scoping.md`, commit `6cc6324`). This is the agreed architecture
for the implementation briefs that follow. **No build yet.**

## Verdict
No self-hosted indexer (Ponder/viem) for v1. **Lightweight aggregation + caching layer:**
- Vercel cron jobs read Zora's Coins API for Scope's coins/users on a schedule.
- They compute rankings and write to new Supabase **cache tables**.
- The app reads the cache (fast; no per-request API hammering).
- Anchored on the Scope coin registry (41 coins today: `coin_address`, creator, `created_at`, `coin_tx_hash`).

**Strategic note:** this is a dependency on Zora's API (uptime / rate limits / continuity).
Self-hosting Ponder is *later insurance* — adopt only if that dependency becomes a real risk at
scale, or Scope needs data Zora doesn't expose. Not day-one.

## Data source per need (confirmed live)
- **First Cut** (first 10 external buyers/coin): `getCoinSwaps` (`senderAddress` + `blockTimestamp`
  + `activityType`, newest-first cursor). **Compute-once-early + store permanently** (immutable),
  viem `getLogs` backstop for ground-truth certainty. NOT a full indexer.
- **Wallet history**: `getProfileBalances` (holdings/valuation) + existing Alchemy tx reads.
- **Screening Room** (top 50 traded among Scope's coins): Zora top-volume is GLOBAL → instead
  **batched `getCoins`** returns `totalVolume` per Scope coin in ~1 call → sort, take 50. ~6-hr cron.
  Also feeds the SRH badge.
- **Collector** (top 1k): per-Scope-user `getProfileBalances` → filter to registry → score & rank.
  Nightly job. (`getCoinHolders` returned empty/shape-unconfirmed — use the per-user path.)
- **Notifications** ("someone collected your post"): poll `getCoinSwaps` for v1 (minutes-late OK).
  Real-time `watchEvent` is the ONLY genuine event-listener candidate — build only if real-time
  becomes mandatory.

## Collector — weighted composite score (LOCKED)
Composite, not a single metric (trading counts — liquidity/price-discovery/creator-rewards are real
positives). Each signal **normalized 0–1 via percentile rank** (resists whale distortion) ×
weight, summed, ranked, top 1k. Weights in a **config** (tunable without rebuild). Computed in the
nightly Collector job from `getProfileBalances` + swap aggregation — **no new data source**.

| Signal | Weight |
|---|---|
| Distinct posts collected | **40%** |
| Distinct creators supported | **25%** |
| Holdings value ($) | **20%** |
| Trade activity (volume) | **15%** |

- Collecting-led (65% breadth) with conviction ($) + liquidity (trading) secondary.
- **Wash-trade guard:** modest trade weight limits gaming; the job can further count
  *distinct-counterparty* volume to harden if needed.

**Implementation note (CC):** the 15% trade-volume signal is the one that adds work to the nightly
job — `getProfileBalances` yields holdings/valuation but not per-wallet volume, so the job also
aggregates `getCoinSwaps` across the registry keyed by wallet. Same *source* (getCoinSwaps), but
it's per-coin iteration on top of the per-user balance pass — fine at current scale, the cost to
watch as the registry grows.

## v1 build sequence (least effort first)
1. **Screening Room ranking job** → cached top-50 by volume across Scope's coins → awards **SRH**
   (and later feeds the Screening Room UI feature).
2. **Collector job** → nightly weighted composite (above) → awards **Collector**.
3. **First Cut** → compute-once-early per coin + store immutably (+ getLogs backstop) → awards **First Cut**.
4. **Wallet history** → direct API reads (display).
5. **Notifications** → poll-based v1; real-time only if mandatory.

All three data-derived badges (SRH / Collector / First Cut) already have DISPLAY built in badge
Pieces 1–6. This is the AWARDING layer that lights them up.

## Registry hardening (fold into sequence step 1)
- Store `creator_address` on the post at mint (avoid the join at read time).
- Periodic reconcile for any coin with a `coin_tx_hash` but null `coin_address`.

## Open / later
- Real-time notifications (event listener) — deferred unless mandatory.
- Self-hosted Ponder — later insurance only.
- Screening Room UI feature (browsable showcase) — separate build; reads the same cached ranking
  from sequence step 1.
