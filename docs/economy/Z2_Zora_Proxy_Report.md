# Brief Z2 — Zora API proxy + 0.8.0 + honest errors

**Status:** built, live-verified against Zora. **See the branch-discipline problem
in §0 first — the work landed on `main`, not on the branch.**
**Date:** 2026-07-23

---

## 0. The work is on `main`, not on `z2-zora-proxy` — and it's pushed

I followed the brief: verified `git status` clean, created `z2-zora-proxy`, and
did all work there. But a **concurrent Stream/video session (Brief V3a) committed
and pushed the entire working tree to `main`** while I was mid-flight — sweeping
my uncommitted Z2 changes into its commit `5831a0f` and pushing it to
`origin/main`. `main` and `z2-zora-proxy` now both point at `5831a0f`.

This is the **second** time a V-brief session has done this — Z1's logging change
was swept into `5c6702d` the same way. The brief's "branch only, nothing merges
without Eric's walk" cannot be enforced by branching alone against a concurrent
session that commits the whole tree; the sweep happens after branch time, so a
clean `git status` at the start is no protection.

**What I did NOT do:** rewrite or force-push `main` to un-mingle the commits.
`5831a0f` is pushed; other clones may already have it, and unilaterally rewriting
pushed history is destructive. That's Eric's call.

**The Z2 code that landed is complete and correct** — verified below. The problem
is isolation/process, not the code. Your options:

1. **Accept it.** The money-path fix is on main, builds clean, is live-verified.
   The "walk before merge" simply happened as "walk after it's already on main."
   Do the §4 walk now against `main`; if anything's wrong, fix forward.
2. **Revert `5831a0f` and redo cleanly** — but that reverts V3a's video work too,
   so it needs coordinating with that session.

Recommend **(1)** — the code is sound and the walk is still doable — plus fixing
the process (commit branch work early; see the memory note) so a Z3 doesn't get
swept a third time.

---

## 1. The proxy (the fix) — `/api/zora/[...path]`

New files:
- `src/lib/zoraApi.ts` — the ONE place the SDK's base URL + key are decided.
- `src/app/api/zora/[...path]/route.ts` — keyed pass-through to Zora.

**Browser** → SDK points at `/api/zora` via `setApiBaseUrl` (exported in 0.6.0+,
confirmed). The route attaches `ZORA_API_KEY` server-side and forwards. The key
never enters the client bundle.

**Server** → a documented **deviation from the brief**: server routes go
**direct to Zora with the key injected by a narrow `fetch` wrapper**, NOT through
the proxy. Reason: a server route calling our own deployment over HTTP adds a hop
to every cron batch, and on Vercel **preview** deployments, Deployment Protection
answers self-calls with a 401 HTML page — it would break cron on every preview.
The wrapper gives the same guarantee (every call keyed, `/quote` included) with no
self-call. It touches only requests to Zora's host and adds only a header.

Both paths converge on one invariant: **no request to Zora's SDK API leaves Scope
without an api-key** — including `/quote`, which the SDK never keys itself (the
Z1 finding, verified still true in 0.8.0).

### Pass-through fidelity
Method, path, query, body and response status/body are forwarded **verbatim**;
the only mutation is the added `api-key` request header. Request headers are an
**allowlist** (`content-type`, `accept`) — the browser's cookies, Privy tokens
and origin/referer must never reach a third party. Response headers are
allowlisted too (upstream's `content-encoding`/`content-length` would corrupt the
already-decoded body if copied). No caching in v1, per the brief.

### How closely it aligns with `/api/market`
**Same problem, same remedy, deliberately different shape.**

| | `/api/market` | `/api/zora/[...path]` |
|---|---|---|
| Problem solved | browser 429-storm on Zora reads (no CORS on 429s) | browser mint/quote goes out keyless |
| Remedy | one keyed server-side caller | one keyed server-side caller |
| Knows the endpoint? | Yes — owns `getCoins`, returns Scope-shaped `CoinRead` | No — dumb transport, upstream bytes verbatim |
| Caching / dedup / backoff | yes (~45s TTL, in-flight dedup, 429 retry) | none (v1) |
| Caller | Scope UI (semantic) | the SDK itself (wire format) |

They **can't** share code past "attach the key server-side": `/api/market` is a
semantic endpoint, this is a transport. `/api/market` keeps its own direct
upstream call and is unchanged except swapping its `setApiKey` line for
`ensureZoraApi()`. **Rate-limit awareness:** the proxy logs upstream 429s on
their own distinct `[zora-proxy] 429 RATE LIMITED …` line (with `retry-after`),
separate from other non-2xx.

### Every SDK callsite now keyed
`ensureZoraApi()` replaces the seven scattered `setApiKey` calls and adds the
mint + quote paths that never had one: `zoraCoins.ts`, `economy/real.ts`,
`economy/fcRewards.ts`, `economy/firstCut.ts`, `economy/screeningRoom.ts`, and
routes `market`, `earnings`, `recap`, `cron/collector`, `cron/fc-payouts`.

---

## 2. 0.8.0 bump (hygiene)

`@zoralabs/coins-sdk` **0.6.0 → 0.8.0** (`package.json` now `^0.8.0`).

- **Lockfile resolves:** coins-sdk `0.8.0`, `@zoralabs/protocol-deployments`
  bumped `0.7.5 → 0.7.6` (its transitive dep). **viem stays `2.48.4`.**
- **viem peer:** 0.7.1 raised coins-sdk's viem peer to `2.53.1`; we resolve
  `2.48.4`, so `npm ls` prints `invalid: "2.53.1"` peer warnings. **Left
  unresolved deliberately** — viem is on every trade path (`buyCoin`, `sellCoin`,
  `swapTokens`, `executeQuotedTrade`), a 2.48→2.53 bump deserves its own
  verification pass, and the additive 0.6→0.8 API needs nothing from it. It is a
  warning, not an error; `tsc` and `build` are clean. **Recommend a separate
  viem-bump task**, not riding it in silently.
- **tsc:** unchanged at the **16-error baseline** — the bump introduces **zero**
  new type errors. `createCoin`/`createTradeCall`/`tradeCoin` signatures
  unchanged, as Z1 predicted.

`protocol-sdk 0.13.21` left pinned and dormant (the legacy 1155 lifeboat; owns 4
of the 16 baseline errors; not on the coin path).

---

## 3. Honest error classification (Z1 step 4)

New `src/lib/zoraErrors.ts`. The `withZoraApiEvidence` tap is **promoted from
diagnostics to source-of-truth**: on a failing Zora response it records
`{status, body, url, keyed}` into a short-lived slot (30s TTL, single-use) that
`classifyZoraFailure()` reads. So the HTTP status the SDK throws away is what
decides the user's message. The eleven-word constant regex in `CreatePostFlow` is
**deleted**.

### The new classification table (verified at runtime — see §4)

| Evidence | kind | Retryable | Message to user |
|---|---|---|---|
| **5xx** / can't reach Zora | `outage` | yes | "…temporarily unavailable — Zora's service is having trouble. Your post is safe; retry in a bit." |
| **429** | `rate-limit` | yes | "…being rate-limited by Zora right now… wait about a minute and retry." |
| **401 / 403** | `auth` | **no** | "…blocked — Zora rejected Scope's API credentials… on us to fix, not something a retry will clear." |
| **other 4xx** | `request` | no | "…refused by Zora: `<real reason from body>`" (e.g. "Metadata image is required and must be a string") |
| reverted / insufficient funds | `chain` | conditional | the real on-chain reason |
| **no evidence** | `unknown` | yes | the real error message if presentable, else "Something failed on the way to the chain. Your post is safe." |

**The invariant, runtime-verified:** `outage` is reserved for 5xx / network-class
evidence. It is **never a fallback** — a 429, a 401, or a no-evidence failure can
never render as "Zora is having trouble" again. That guess is the exact bug Z1
spent an investigation getting behind.

Applied at: `CreatePostFlow` mint catch (the main target) and the `backOwnCoin`
hand-off (was appending the SDK's meaningless "Quote failed"; now classifies). A
reentrancy guard (`tapActive`) stops `backOwnCoin → buyCoin` from stacking taps.

---

## 4. Branch verification — live results

Full build (the shipped commingled commit): **`tsc` 16 (baseline), `npm run
build` clean, `/api/zora/[...path]` registered.**

**Proxy, live against Zora (dev server):**

| Test | Result |
|---|---|
| `GET /api/zora/coin` through proxy | **200**, `x-zora-keyed: sent`, body verbatim |
| `POST /api/zora/quote` (the SDK-never-keys endpoint) | **200**, real calldata returned — **keyed `/quote` proven** |
| `/api/market` (server route, injected key) | **200** |
| Key in client bundle (`grep` the 73-char key across `.next/static`) | **0 files** — key never ships to browser |

**Classifier, runtime truth-table (10 cases):** every row lands in the right
bucket; the three invariant assertions (429≠outage, no-evidence≠outage,
401≠retryable) **all hold**.

### The live finding that pre-empts the human walk

`POST /create/content` — the mint calldata endpoint — **currently 500s, keyed AND
keyless alike**, consistently over a 20s window:

```
Status: 503  URL: https://base-proxy.lat.nodes.notnotzora.com
```

I confirmed `base-proxy.lat.nodes.notnotzora.com` (Zora's own Base RPC proxy,
which their calldata builder calls internally) **returns 503 directly**. So right
now there is a **genuine Zora-side outage** on the mint path — and it is exactly
the case the old code would have shown as "Zora is having trouble" *by accident*.
Now it shows the same message **by evidence** (5xx → `outage`), which is the
honest version of the same words.

**Implication for the §4 human walk:** a real mint will **fail with a genuine
5xx** until Zora's `base-proxy` recovers — that is upstream, not us. The
verification the walk must confirm is **`api-key: sent` on every `[zora]` line**
(proven above at the transport level) and an **honest error naming the real
obstacle** (proven: the 503 now surfaces as an outage classification, not a
guess). A green mint needs Zora's RPC proxy back up. **The trade path (`/quote`)
is already fully working keyed** — buy/sell can be walked now.

---

## 5. Sign-off asks

1. **Rule on §0** — accept the commingled `5831a0f` on main and walk it there
   (recommended), or coordinate a revert with the V3a session.
2. **Walk the trade path now** (`/quote` is live + keyed): a small buy + sell,
   confirm `api-key: sent` and the receipt-true gates hold.
3. **Walk the mint once Zora's `base-proxy` 503 clears** — expect success with
   `api-key: sent`, or the honest 5xx/rate-limit/auth message, never the guess.
4. **Approve a separate viem 2.48→2.53 task** (don't ride it in with this).
5. The `withZoraApiEvidence` tap **stays through the walk**, then downgrade
   (drop the `record`/classify wiring back to log-only) per the brief.

**Out of scope, as directed:** the local-calldata fallback — but note the live
503 is precisely the argument for it: when Zora's RPC proxy is down, *no one on
Scope can mint*, and only self-built calldata removes that dependency. Scope it
after this fix is walked, per Z1.
