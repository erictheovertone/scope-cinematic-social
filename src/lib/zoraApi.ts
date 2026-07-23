// ── Zora SDK transport — the ONE place the SDK's base URL + API key are set ───
//
// Brief Z2, implementing the Z1 diagnosis (docs/economy/Z1_Zora_SDK_Diagnosis.md).
//
// THE PROBLEM Z1 FOUND. coins-sdk keeps its API key in module-level state:
//   var apiKey; function getApiKeyMeta() { return apiKey ? {headers:{"api-key":apiKey}} : {} }
// The browser bundle is a separate JS context where setApiKey() never ran, so
// every mint (POST /create/content) and every quote went out UNAUTHENTICATED —
// presenting as the "Zora is having trouble" message.
//
// WORSE: createTradeCall calls postQuote WITHOUT spreading getApiKeyMeta() at
// all — verified in 0.6.0 AND 0.8.0. So /quote (every buy, sell, backing and
// wallet swap) can never be keyed by setApiKey, in ANY context, server included.
// The SDK does not export its raw `client`, so setApiBaseUrl is the only public
// lever that reaches the transport layer. Hence: attach the key BELOW the SDK.
//
// ── The two contexts, and why they differ ────────────────────────────────────
//
// BROWSER → our proxy route (/api/zora/[...path]). A relative base URL resolves
//   to our own origin; the route attaches ZORA_API_KEY server-side and forwards.
//   The key never enters the client bundle. This is the money path — mint,
//   trades, swaps, quotes — and the reason this brief exists.
//
// SERVER → straight to Zora, with the key injected by a narrow fetch wrapper.
//   NOT through the proxy, deliberately (a documented deviation from Z2 §1,
//   which asked for both). A server route calling our own deployment over HTTP
//   would add a hop to every cron batch and, on preview deployments, Vercel
//   Deployment Protection answers self-calls with a 401 HTML page — it would
//   break cron on every preview. Same guarantee (every call keyed, /quote
//   included), no self-call. The wrapper touches ONLY requests to Zora's host
//   and adds ONLY a header; everything else passes through untouched.
//
// Both paths converge on the same invariant: NO request to Zora's SDK API
// leaves Scope without an api-key. Verify with the [zora] evidence tap in
// zoraCoins.ts — it reads "api-key: sent" on both.

import { setApiBaseUrl, setApiKey } from "@zoralabs/coins-sdk";

/** Zora's SDK API. The SDK's own default; also the proxy's upstream. */
export const ZORA_UPSTREAM = "https://api-sdk.zora.engineering";

/** Our same-origin proxy. Relative on purpose — resolves against the current
    origin in every environment (local, preview, production) with no config. */
export const ZORA_PROXY_PATH = "/api/zora";

/** Response header the proxy sets so the browser-side evidence tap can report
    whether the key was attached upstream — the client can't see the header we
    add server-side, so the proxy reports it back. */
export const ZORA_KEYED_HEADER = "x-zora-keyed";

let configured = false;

/**
 * Point the coins-sdk at the right transport for THIS context. Idempotent —
 * safe to call from every entry point; the first call wins.
 *
 * Must run before any SDK call. Entry points (zoraCoins.ts, economy/real.ts,
 * the server routes) call it at module scope.
 */
export function ensureZoraApi(): void {
  if (configured) return;
  configured = true;

  if (typeof window !== "undefined") {
    // BROWSER — everything goes through the proxy, which holds the key.
    // Deliberately NOT calling setApiKey here: there is no key in the browser
    // and there must never be one.
    setApiBaseUrl(ZORA_PROXY_PATH);
    return;
  }

  // SERVER — direct to Zora, key injected below the SDK.
  const key = process.env.ZORA_API_KEY;
  if (!key) {
    // Honest degradation: unkeyed reads still work (rate-limited). Loud, once.
    console.warn("[zora] ZORA_API_KEY is not set — server-side Zora calls will go out UNKEYED and will be rate-limited.");
    return;
  }
  // Keeps the key on the wrappers that DO honour it (getCoins, getCoinSwaps, …)
  // even if the fetch wrapper is ever bypassed.
  setApiKey(key);
  installServerKeyInjection(key);
}

/**
 * Wrap globalThis.fetch so any request to Zora's SDK API carries the api-key.
 * This is what reaches /quote, which the SDK never keys itself.
 *
 * Narrow by construction: non-Zora requests are returned to the original fetch
 * untouched, and we only ever ADD a header — method, URL, body and the response
 * are never modified. Installed once per server process.
 */
function installServerKeyInjection(key: string): void {
  const orig = globalThis.fetch;
  if (typeof orig !== "function") return;
  if ((orig as any).__zoraKeyed) return; // never stack wrappers

  const wrapped = async function (input: any, init?: any) {
    let isZora = false;
    try {
      const url = typeof input === "string" ? input : (input?.url ?? String(input));
      isZora = url.startsWith(ZORA_UPSTREAM);
    } catch { /* unparseable input — treat as not-Zora, pass through */ }
    if (!isZora) return orig(input, init);

    // Merge onto whatever headers the SDK already set (Content-Type, etc.).
    const headers = new Headers(
      (init?.headers as HeadersInit | undefined) ??
      (input instanceof Request ? input.headers : undefined)
    );
    if (!headers.has("api-key")) headers.set("api-key", key);

    // A Request's headers are immutable once constructed, so a Request input
    // must be rebuilt rather than re-inited.
    if (input instanceof Request) {
      return orig(new Request(input, { headers }), init);
    }
    return orig(input, { ...init, headers });
  };
  (wrapped as any).__zoraKeyed = true;
  globalThis.fetch = wrapped as typeof fetch;
}

// Configure on import — entry points import this module for its side effect.
ensureZoraApi();
