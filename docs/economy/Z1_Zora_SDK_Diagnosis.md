# Brief Z1 — Zora SDK: diagnosis of the "outage" + migration assessment

**Status:** paper + §1 evidence path shipped. Nothing else on main.
**Date:** 2026-07-23

---

## 0. Headline

**The "Zora is having trouble" message is a misclassification, not an outage
report.** The mint path calls Zora's SDK API **without an API key**, the SDK
**destroys the HTTP response** on failure, and our regex then labels the
resulting generic string as an upstream incident. All three links are verified in
source below.

Two premises in the brief need correcting before the plan is read:

| Brief premise | Actual |
|---|---|
| "coins-sdk has a 2.x line (2.3.1)" | `@zoralabs/coins-sdk` **has no 2.x** — latest is **0.8.0**. `2.3.1` belongs to `@zoralabs/coins`, a **different package**: the Solidity contracts (deps: OpenZeppelin). Not a client SDK, no `setApiKey`, not something we import. |
| "newer versions use server-generated calldata + an API key" | **0.6.0 already does both.** `createCoin` has posted to `/create/content` since before our pin, and `setApiKey` has existed the whole time. There is no new model to migrate to. |
| "our keyless 0.6.0 is being rate-limited" | **Correct — and it is keyless for a reason we control, not because 0.6.0 can't take a key.** |
| "a generation-old SDK" | 0.6.0 published **2026-04-20**, three months ago. 0.8.0 published 2026-07-16. The 0.6→0.8 changelog is **purely additive** — no breaking changes. |

The net effect is that this is a **much smaller job than the brief assumed**. The
migration everyone was bracing for does not exist.

---

## 1. The failure chain (verified in source)

### Link 1 — the mint request carries no API key

`ZORA_API_KEY` **is already in `.env.local`**, and `setApiKey` is already wired in
**seven** places. Every one of them is server-side:

| Callsite | Context |
|---|---|
| `src/app/api/market/route.ts:50` | server route |
| `src/app/api/earnings/route.ts:34` | server route |
| `src/app/api/recap/route.ts:44` | server route |
| `src/app/api/cron/collector/route.ts:64` | cron |
| `src/app/api/cron/fc-payouts/route.ts:82` | cron |
| `src/lib/economy/firstCut.ts:62` | server lib |
| `src/lib/economy/screeningRoom.ts:43` | server lib |

`src/lib/zoraCoins.ts` — **the mint path — is not on that list.** It runs in the
**browser** (`CreatePostFlow.tsx` is `"use client"` and holds the wallet client).

In the SDK, the key is module-level state:

```js
// coins-sdk/dist/index.js:449
var apiKey;
function setApiKey(key) { apiKey = key; }
function getApiKeyMeta() {
  if (!apiKey) return {};                      // ← keyless request
  return { headers: { "api-key": apiKey } };
}
```

The browser bundle is a **separate JS context** with its own module instance. No
`setApiKey` ever runs there, so `getApiKeyMeta()` returns `{}` and
`POST https://api-sdk.zora.engineering/create/content` goes out **unauthenticated**
— from every creator's browser, every mint.

`ZORA_API_KEY` has no `NEXT_PUBLIC_` prefix, so it is `undefined` in the browser
by design. The key we already pay for has never once been attached to a mint.

### Link 2 — the SDK throws the evidence away

The generated fetch client does **not** throw on non-2xx. It returns a result
object (`@hey-api/client-fetch`, verified in dist):

```js
if (c.ok) { ... return { data: b, request, response } }
let g = await c.text(); try { g = JSON.parse(g) } catch {}
...
if (s.throwOnError) throw d;          // throwOnError is NOT set by the SDK
return { error: d, request, response }
```

So a 401 / 403 / 429 comes back as `{ data: undefined, error: <body>, response: <Response> }`.
The SDK then does this:

```js
// coins-sdk/dist/index.js:723 — createCoinCall
const createContentRequest = await postCreateContent2({ ... });
if (!createContentRequest.data?.calls) {
  throw new Error("Failed to create content calldata");   // ← error + response discarded
}
```

**The status code, the response body and the endpoint are destroyed inside the
SDK before our code ever sees them.** A rate-limit and a genuine 500 arrive at
our catch block as the same eleven-word string.

> This is still true in **0.8.0** — verified in the downloaded tarball at
> `index.js:860`. Upgrading does not restore the evidence.

### Link 3 — our regex then calls it an outage

`src/components/CreatePostFlow.tsx:1114`:

```ts
const upstreamOutage = /failed to create content calldata|create\/content|.../i.test(msg);
```

`"Failed to create content calldata"` is a **literal match on the first
alternative**. Because that string is the *only* thing the SDK ever throws here,
**every** create failure — auth, rate limit, bad metadata, genuine outage —
classifies as an outage and prints *"Minting is temporarily unavailable — Zora's
service is having trouble."*

That is why the message "persists past the outage window": it was never reading
an outage. It is a constant.

### Link 4 — the trade path is worse, and a version bump can't fix it

`createTradeCall` (every buy, sell, backing and wallet swap) calls `postQuote`
**without `getApiKeyMeta()` at all**:

```js
// 0.6.0 index.js:1032 — and IDENTICAL in 0.8.0
const quote = await postQuote({ body: { tokenIn, tokenOut, amountIn, ... } });
//                              ↑ no ...getApiKeyMeta()
```

Every other wrapper in the SDK spreads it; this one does not. So **`/quote` is
unconditionally keyless in 0.6.0 *and* 0.8.0, in every context — server-side
included.** Our `/api/earnings` and cron routes call `setApiKey` and then use
`createTradeCall`; that key is silently ignored.

This is the single most important finding for the plan: **upgrading the SDK does
not authenticate our trades.** Only redirecting the base URL does (§3).

One asymmetry in our favour: unlike `createCoinCall`, `createTradeCall` *does*
attach the upstream body to the error (`err.errorType`, `err.errorBody`). Our
`errInfo()` extractor was reading only `name`/`message`/`cause` and dropping
both — so every quote failure logged a bare `"Quote failed"`. Fixed in §2.

### Why the read path doesn't show this

`/api/market` already solved exactly this problem for reads — its header comment
describes the "429 storm" from per-tile browser calls and notes that *"Zora's
429s lack CORS headers (the double console error)"*. The fix was a server proxy
with the key attached.

**The read path was fixed months ago. The mint and quote paths never got the same
treatment** — they still call Zora directly from the browser, keyless. This
diagnosis is that oversight surfacing.

---

## 2. What shipped to main (§1 — logging only)

Two surgical changes in `src/lib/zoraCoins.ts`. No behaviour, no control flow, no
user-facing copy changed. `tsc` 16 errors (**baseline, unchanged — none in the
touched files**); `npm run build` passes.

**a. `errInfo()` now surfaces `errorType` / `errorBody`** (additive keys). Every
existing callsite — the backing hand-off, collect, swap, the `CreatePostFlow`
catch — gains the upstream body with no callsite change. This alone recovers the
verbatim reason for **all trade failures**.

**b. `withZoraApiEvidence(label, fn)`** — a scoped `globalThis.fetch` tap, active
only for the awaited call and always restored in `finally` (the existing
`withQuietConsoleError` discipline). It observes any request to
`api-sdk.zora.engineering` and, on a non-2xx, logs:

```
[zora] createCoin — SDK API FAILED
  endpoint : POST https://api-sdk.zora.engineering/create/content
  status   : 401 Unauthorized
  api-key  : ABSENT (keyless request)
  body     : {"error":"..."}
```

It reads `res.clone()`, never mutates request or response, and any throw inside
the tap is swallowed — diagnostics can never break a mint. It is wrapped around
the `createCoin` call in `createScopeCoin` only.

Logged via `console.warn`, **not** `console.error`, deliberately: `backOwnCoin`
runs under `withQuietConsoleError`, which mutes `console.error` and would
otherwise swallow this evidence.

**The `api-key` line is the decisive one.** On Eric's repro it will read `ABSENT`
— that is the hypothesis confirmed from the client side regardless of what status
Zora returns. The status then tells us which enforcement we hit:

| Status | Reading |
|---|---|
| **401 / 403** | Key now required on `/create/content`. Hypothesis confirmed. |
| **429** | Rate-limited as an anonymous caller. Hypothesis confirmed. |
| **5xx** | Genuine Zora-side incident — but note our regex would have said "outage" either way. |
| **404 / DNS** | Endpoint moved (would be new; `/create/content` is unchanged in 0.8.0). |

The friendly message is deliberately left alone, per the brief. **It should be
fixed once the evidence lands** — it currently cannot tell an outage from
anything else, which is what cost us this whole investigation. Flagged, not
touched.

---

## 3. The plan

### Correcting the framing

The brief offers "(a) API key as a short bridge vs (b) the 2.x migration, likely
required regardless." **There is no (b).** There is no 2.x. The 0.6→0.8 delta is
three additive releases:

| Version | Change | Breaking? |
|---|---|---|
| 0.7.0 | `createCoinSmartWallet` + 3 smart-wallet variants; `enableSmartWalletRouting` flag; exported validation helpers; `apiUrl` helper | No — all additive |
| 0.7.1 | **viem peer bump 2.22.12 → 2.53.1** | Peer-dep only. We are on viem **2.48.4** |
| 0.8.0 | `getCoinMergedComments` | No |

`CreateCoinArgs` is unchanged. `initialPurchase` and `DeployCurrency` were not
removed in this range — those are older-era concerns already handled by our
0.6.0 pin (our `backOwnCoin` self-buy design stays correct). `createCoin` still
posts to `/create/content` and still throws the same generic string.

So the real choice is not "bridge vs migration". It is **"where do we attach the
key"** — and that has one correct answer because of §1 Link 4.

### Recommended sequence

**Step 1 — Eric repros a mint. Read the `[zora]` block.** (shipped)
Everything below is written assuming `api-key: ABSENT` plus a 401/403/429. If the
status is a genuine 5xx with a key present, stop and re-plan.

**Step 2 — Proxy the SDK API through our own route.** *(~half a day, branch)*

`setApiBaseUrl(baseUrl)` **is exported from 0.6.0** (`dist/index.js:1060`,
confirmed in `index.d.ts`). In the browser we point the SDK at our own origin:

```ts
setApiBaseUrl("/api/zora-sdk");   // client-side, once
```

and add a thin pass-through route that injects `api-key: ZORA_API_KEY`
server-side and forwards to `api-sdk.zora.engineering`.

This is the recommended path over `NEXT_PUBLIC_ZORA_API_KEY` for three reasons:

1. **It is the only thing that fixes `/quote`.** `createTradeCall` ignores
   `setApiKey` entirely (§1 Link 4) — in 0.6.0 *and* 0.8.0. A proxy attaches the
   header at the transport layer, so buys, sells, backing and swaps get
   authenticated too. `setApiKey` alone cannot reach them at any version.
2. **The key stays secret.** `NEXT_PUBLIC_` ships it in the client bundle to
   every visitor, with our rate limit attached to it.
3. **It is the pattern this codebase already chose** — `/api/market` batches,
   caches, dedupes and backs off on 429 for exactly this reason. Reuse, don't
   re-invent.

Rate-limit handling (retry/backoff on 429) can be lifted from `/api/market`.

**Step 3 — bump `@zoralabs/coins-sdk` 0.6.0 → 0.8.0.** *(~an hour, same branch,
after Step 2 is verified)*

Low risk given the additive changelog, and worth doing to stop the drift. The one
real item: **0.7.1 raises the viem peer to 2.53.1 and we are on 2.48.4.** Decide
whether to bump viem alongside or accept the peer warning — viem touches every
trade path, so it deserves its own verification pass and should **not** ride
along silently. If it looks at all noisy, ship Step 2 alone; it delivers the fix
on its own.

Note the ordering: Step 2 is the fix, Step 3 is hygiene. Doing Step 3 first would
change nothing — the SDK version was never the problem.

**Step 4 — fix the misclassifying regex** (`CreatePostFlow.tsx:1114`) so
"outage" means outage, using the real status the tap now gives us.

`@zoralabs/protocol-sdk` **0.13.21 → latest 0.13.22.** Its only remaining
consumer is `src/lib/zora.ts` — the dormant legacy 1155 path, the documented
rollback lifeboat. It is **not** on the coin path and has no 2.x-era equivalent
(different protocol, not superseded by coins-sdk). **Leave it pinned and
dormant.** It also owns 4 of the 16 baseline `tsc` errors; touching it is
unrelated scope.

### Branch discipline

Steps 2–4 on a branch. Before any merge, verify against real money on Base
mainnet, to our existing confirmation standard (`status: "success"` + `balanceOf`
delta — the receipt-true gates already in `buyCoin`/`sellCoin`/`swapTokens`):

1. A real mint completes, and the `[zora]` line reads `api-key: sent`, `200`.
2. A real collect (buy) — pieces delivered on-chain to the buyer.
3. A real sell — proceeds receipt-true.
4. The in-flow creator backing lands **in-flow** (this is the leg that has been
   failing most; it rides `/quote`, so it is the sharpest test of Step 2).
5. Confirm the key is **not** in the client bundle: `grep` the built JS.

### The local-calldata fallback question

The brief asks whether the server-calldata model makes our scoped fallback
obsolete or more necessary. **More necessary — and the premise needs adjusting:
this is not something 2.x introduces. We have depended on Zora's server to build
our mint calldata since before the current pin.**

Every mint is already a hard dependency on a third-party HTTP endpoint. When it
is down, or throttles us, **no one on Scope can mint at all** — which is exactly
the incident this brief was opened for. Step 2 removes the *self-inflicted*
share of that risk (we stop being an anonymous caller). It does not remove the
dependency.

A local-calldata path — encoding the `ZoraFactory` deploy call ourselves against
`@zoralabs/protocol-deployments` (already a transitive dep, and where
`coinFactoryAddress` and `zoraFactoryImplABI` come from) — is the only thing that
does. Recommend scoping it **after** Step 2 lands and we can see the real error
rate with an authenticated caller. It is the right instinct; it is not the
urgent fix, and doing it first would mask whether Step 2 worked.

---

## 4. Sign-off asks

1. **Confirm the repro** and paste the `[zora]` block. Everything above is
   contingent on it.
2. **Approve Step 2** (proxy route + `setApiBaseUrl`) as the fix — over
   `NEXT_PUBLIC_ZORA_API_KEY`, for the `/quote` reason.
3. **Rule on viem** in Step 3: bump 2.48.4 → 2.53.1 with the SDK, or ship Step 2
   alone and defer.
4. **Confirm** the local-calldata fallback is scoped *after* Step 2, not with it.
