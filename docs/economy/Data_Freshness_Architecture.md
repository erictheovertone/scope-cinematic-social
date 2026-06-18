# Data Freshness / "Snappiness" Architecture — SCOPING

**Status:** Proposal for review. NO implementation yet. Findings are from the real code
(commit context: post market-cap transport hardening, `2323e93`). Eric picks the path before any build.

**The ask:** the app should reflect economic actions (buy/sell/mint) **immediately and fast** —
no manual refresh, no navigate-away-and-back. Concrete symptom: after a real buy the wallet
showed wrong holdings **values + ordering**, correcting only after ~2 refreshes + a remount.

---

## TL;DR for Eric

- **The symptom is NOT "nothing refetches."** A post-trade invalidation bus already exists
  (`tradeEvents.ts` → `scope:market-moved`) and the wallet/feed/post surfaces already listen to it.
  The refetch fires — it just reads **stale data** when it does.
- **Root cause (confirmed): the server-side `/api/market` cache (45s TTL) is never invalidated on a
  trade.** The client clears its own cache and refetches, but `/api/market` serves its 45s-old
  (pre-trade) price. Holdings **value = price × pieces** and the wallet is **sorted by value**, so a
  stale price = wrong values + wrong order until the 45s TTL lapses. "Two refreshes + navigate" ≈ the
  ~45s + remount needed for that server cache to expire. **Pieces (count) are a direct chain read and
  are usually correct** — it's the price-derived value/order that lags, which matches the report.
- **Three more gaps compound it:** (2) no optimistic update — the UI waits for a refetch that reads
  stale; (3) listeners only fire **while mounted** — a buy from the feed never reaches the unmounted
  wallet; (4) no reconcile/retry — one stale read stays wrong until the next action.
- **react-query is NOT installed.** `wagmi ^3.6.8` is in `package.json` but unused, and its required
  peer `@tanstack/react-query` does not resolve — so wagmi is effectively dead weight today and
  react-query is a **new dependency**, not a free adoption. It also would **not** fix the server-cache
  root cause on its own.
- **Recommendation:** a **targeted fix on the existing bus + boundary**, not a react-query rip-replace.
  v1 = three small changes that make **buy → wallet instant**: (a) bust the `/api/market` server cache
  on trade, (b) optimistic holdings patch from the receipt-true pieces we already have, (c)
  reconcile-with-retry reusing the just-built `marketResolved` discipline. Defer the shared-store /
  react-query question to a later, surface-by-surface pass.

---

## STEP 1 — Current data-read architecture (the truth)

| Surface | Fetch path | When it fetches | Refetch on action? | Shared store? |
|---|---|---|---|---|
| **Wallet holdings** (`wallet/page.tsx`) | `economy.getHoldings()` → `balanceOf` per coin (direct chain, `publicClient`) + `marketFor` → `/api/market` for price | once on mount (guard `holdings!==null`) | **Yes**, via `onTradeSettled(() => setHoldings(null) …)` — **only while the wallet is mounted** | No — its own `useState` |
| **Feed post LIST** (`page.tsx`) | `getAllPosts()` (Supabase) | **once on mount** | **No** — the list never refetches; a new mint won't appear without a remount | No |
| **Feed MC chips** (`PostItem`) | `economy.getPostMarket` → `/api/market` | mount + `marketRefreshKey++` on `scope:market-moved` | **Yes (MC only)** | No |
| **Post/lightbox** (`PostModal`) | `economy.getPostMarket` | mount + `scope:market-moved` | **Yes (MC only)** | No |
| **Profile grid** (`profile/page.tsx`) | rows + `getHoldings`/`getCollected` | mount + `scope:market-moved` | Yes | No |
| **Price / MC / pieces** | `/api/market` (server, **45s TTL**, hardened retry/dedup) + client `marketCache` (30s) | per read, batched in a 40ms window | client `marketCache` **cleared** on trade (`real.ts:79`); **server cache NOT** | the client `marketCache` is shared across surfaces but is **not reactive** (no subscribe) |

**What already exists (and is good):**
- **An invalidation bus** — `src/lib/economy/tradeEvents.ts`. `notifyTradeSettled(postId)` dispatches
  `scope:market-moved`; surfaces subscribe via `onTradeSettled`. Every trade entry point already calls
  it (`CollectSheetV2` buy/sell `ceremonyResolve`, `CreatePostFlow` backing/mint).
- **The single typed boundary** — `EconomyProvider` / `useEconomy()` (13 consumers). Every economic
  read already goes through one interface, so the cache/refetch strategy can be swapped **behind the
  boundary without touching the 13 call sites** — a major de-risking fact.
- **The hardened `/api/market`** — retry-on-429, per-address in-flight dedup, never-cache-a-failed-read,
  plus the client `marketResolved` retry. **The freshness work must build ON this, not around it.**

**What forces a correct read today:** only the 45s server TTL lapsing **and** a refetch (remount or
another `scope:market-moved`). That is why navigation "fixed" it — a remount after the TTL expired.

**Can surfaces disagree?** Yes. Each fetches independently; mid-flight the wallet, a feed tile, and the
post page can show different prices for the same coin (different cache ages / fetch times). There is no
single reactive source of truth — the client `marketCache` is shared storage but nothing re-renders when
it changes.

---

## STEP 2 — Actions that should refresh data

| Action | Goes stale → must update |
|---|---|
| **Buy / collect** | the coin's **price/MC** (client **and server** cache), buyer's **holdings** (pieces + value), **wallet ordering + total**, the post's `collectedByViewer` / `holders`, (First Cut check already runs separately) |
| **Sell** | same as buy, **plus** proceeds → **AVAILABLE** balance (ETH/USDC) |
| **Mint** (`createCoin`) | **feed post LIST** (the new post should appear), the registry, the new coin's market presence, the creator's profile grid; backing buy → holdings |
| **Send** (wallet) | AVAILABLE balance (ETH/USDC) |
| **Fund wallet** (onramp) | AVAILABLE balance |

The buy/sell row is the priority — it is the reported symptom and the highest-frequency action.

---

## STEP 3 — Proposed architecture

Three capabilities are wanted: **(1) a shared cache, (2) invalidate-on-action, (3) optimistic updates.**
The lightest design that delivers them on Scope's actual stack (Next.js App Router, Privy-direct,
the hardened `/api/market`, Supabase, viem direct reads):

### The four fixes (library-agnostic — these are the actual win)

1. **Bust the `/api/market` server cache on trade (THE root-cause fix).** Today the bus clears the
   *client* `marketCache` but `/api/market`'s 45s in-memory cache keeps serving the pre-trade price.
   Fix: a force-fresh path — e.g. the post-trade read passes `?fresh=<addr>` (or a tiny authenticated
   `POST /api/market/bust`) that drops those addresses from the server cache so the next GET re-reads
   from Zora. **Additive** to the hardened route — it must reuse the retry/dedup/never-cache-failed
   logic, never bypass it. *This single change is what makes the post-trade value/order correct.*

2. **Optimistic holdings patch.** The buy result already returns **receipt-true pieces** (`r.pieces`,
   chain's word). On confirm, immediately patch the wallet's holding for that coin (+pieces, recompute
   value with the last known price) **before** the refetch — instant feedback. Reconcile when the real
   read lands. Only ever applied on a **confirmed** receipt (never a pending/optimistic-only trade), so
   it can't show a phantom buy.

3. **Reconcile-with-retry.** A trade's effect on Zora's price/MC can lag the chain by seconds. Instead
   of one post-trade read, poll a few times (reuse the **`marketResolved` retry discipline** just built
   for the MC chips) until the price reflects the trade, then settle. Never let an optimistic value
   overwrite a *resolved* real value.

4. **Promote the boundary cache to a small reactive store.** Make the boundary's market/holdings cache
   **subscribable** (a tiny `useSyncExternalStore`-style store, or a React context with versioned keys)
   so all mounted surfaces read the **same** value and re-render together when it changes — killing
   cross-surface disagreement. For *unmounted* surfaces, the next-mount read is already fresh once the
   server cache is busted (#1). This is the "shared cache" capability; it can be added behind the
   existing boundary without touching the 13 consumers.

### react-query vs. a lighter custom store

| | Adopt `@tanstack/react-query` | Extend the existing bus + boundary (recommended) |
|---|---|---|
| **Availability** | **NOT installed** — a new dependency (needs Eric's OK per the no-new-deps rule). `wagmi` is in `package.json` but its react-query peer is absent, so wagmi is unusable/unused today. | Already here — `tradeEvents` + `useEconomy` are ~80% of the wiring. |
| **Gives natively** | cache, invalidation, optimistic, background + focus refetch, dedup | we hand-build invalidation (exists) + optimistic + focus/interval (small) |
| **Fixes the root cause?** | **No** — react-query caches the *client* read; the **server `/api/market` 45s cache** still serves stale prices. Fix #1 is needed either way. | Same — fix #1 is the core, independent of the client lib. |
| **Migration cost / blast radius** | re-wire 13 `useEconomy` consumers + the boundary into `useQuery`/`useMutation`; touches every economic surface at once | surgical: wallet + the `/api/market` bust first; other surfaces opt in behind the unchanged boundary |
| **Risk** | high blast radius, and it sits *next to* the hardened `/api/market` rather than reusing it — easy to accidentally double-cache or undo protections | low, contained, reuses the hardened path |

**Recommendation:** do **not** rip-and-replace with react-query. The reported symptom is fixed by #1–#3
with near-zero blast radius. react-query is a reasonable *later* choice **if** Scope wants app-wide query
management (background refetch, devtools, etc.) — but adopt it deliberately, surface by surface, behind
the boundary, and only after the server-cache fix (which it doesn't replace). Flag for Eric: it's a new
dep and would be the largest blast radius of any option here.

### Background refresh / staleness window

Yes — modest. Mounted economic surfaces should **refetch on window focus** and on a **30–60s interval**
so data is never very stale even absent an action. Cost is bounded by the existing batch + cache; keep
the interval conservative and only while a surface is visible. This is the "never very stale" backstop;
the action-driven path (#1–#3) is what makes it feel *instant*.

### Scope of v1 vs. later

- **v1 (makes buy → wallet instant — the reported symptom):** fixes **#1 (server-cache bust on trade)
  + #2 (optimistic holdings patch) + #3 (reconcile-retry)**, scoped to the **wallet/holdings** surface
  and the buy/sell flow. Small, contained, reuses the hardened read path. This alone kills the symptom.
- **Later:** #4 (reactive shared store for cross-surface consistency); feed **post-list** refetch on mint;
  focus/interval background refresh app-wide; optional react-query adoption if we want it everywhere.

---

## STEP 4 — Sequence + blast radius

**Roll out worst-offender first, surface by surface — never all at once.**

1. **Wallet / holdings (v1).** The reported symptom. Blast radius: `wallet/page.tsx` + the boundary's
   `getHoldings` + the `/api/market` bust. Self-contained.
2. **`/api/market` server-cache bust.** Shared by all surfaces (so feed/post benefit too), but a
   contained server change. **Risk:** must not weaken the hardened retry/dedup/never-cache-failed
   protections — implement as an additive force-fresh path, with the same burst test re-run after.
3. **Feed MC + post view reconcile.** Already partly refreshing on `scope:market-moved`; add the
   reconcile-retry so the MC settles to the post-trade value, not one stale read.
4. **Feed post LIST refetch on mint.** Separate, lower priority (new-post visibility, not the money bug).
5. **Reactive shared store / optional react-query.** Largest blast radius — last, behind the boundary,
   one surface at a time.

**What could regress, and how to roll out safely:**
- **Undoing the transport hardening.** The freshness work sits on top of `/api/market`; the bust path
  must be *additive*. Re-run the cold-burst + concurrent-burst tests after any `/api/market` change.
- **Optimistic showing a phantom.** Only patch on a **confirmed receipt** (pieces are already
  receipt-true); always reconcile to the real read; never let optimism overwrite a resolved value.
- **Refetch storms / new 429s.** Background interval + focus refetch add load — keep intervals modest,
  visible-surface-only, and rely on the existing batch + dedup. Watch for 429s after enabling.
- **Cross-surface store swap.** Because every read already goes through `useEconomy`, the reactive store
  can be introduced behind the boundary without touching the 13 consumers — but roll it out one surface
  at a time and verify each still reads correctly before the next.

---

## Open questions for Eric

1. **react-query — yes or no?** It's a new dep and the biggest blast radius, and it does **not** replace
   the server-cache fix. Recommendation is **no for v1**; revisit later if we want app-wide query mgmt.
   (Also: should the unused `wagmi`/`@wagmi/core` be removed while we're here?)
2. **Optimistic aggressiveness** — patch holdings only (safe), or also optimistically move price/MC?
   Price optimism is riskier (we'd be guessing the curve move); recommend holdings-only for v1.
3. **Background staleness window** — 30s? 60s? focus-only? Pick the interval.
4. **v1 cut confirmation** — agree v1 = wallet buy→holdings instant via #1–#3, nothing else?
