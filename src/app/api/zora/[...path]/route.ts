// ── /api/zora/[...path] — keyed pass-through to Zora's SDK API ───────────────
//
// Brief Z2 §1. The browser's coins-sdk points here via setApiBaseUrl (see
// src/lib/zoraApi.ts); this route attaches ZORA_API_KEY server-side and
// forwards. The key never enters the client bundle.
//
// WHY A PROXY AND NOT A PUBLIC KEY (Z1): createTradeCall calls postQuote
// without the SDK's api-key helper — in 0.6.0 and 0.8.0 alike — so setApiKey
// can NEVER key /quote, which is every buy, sell, backing and swap. Attaching
// the header at the transport layer is the only mechanism that reaches it.
// A NEXT_PUBLIC key would also ship our rate limit to every visitor.
//
// RELATIONSHIP TO /api/market: same problem (Zora 429s, whose responses lack
// CORS headers, hitting the browser directly), same remedy (one keyed
// server-side caller). The shapes deliberately DIVERGE past that point:
// /api/market is a semantic endpoint — it owns a batch of addresses, a ~45s
// cache, request dedup and 429 backoff, and returns a Scope-shaped CoinRead.
// This route is a dumb transport — it knows no Zora endpoint, parses no body,
// and returns upstream's bytes verbatim. It has to be: the SDK is the caller,
// and it expects Zora's own wire format for a dozen endpoints. /api/market
// keeps its own direct upstream call and stays exactly as it is.
//
// NO CACHING IN V1 (per the brief). Reads that deserve caching already have
// /api/market; mint and trade calls must never be served stale.

import { NextRequest, NextResponse } from "next/server";
import { ZORA_UPSTREAM, ZORA_KEYED_HEADER } from "@/lib/zoraApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Request headers worth forwarding. An allowlist, not a blocklist: the browser
// sends cookies, Privy tokens and its own origin/referer on a same-origin call,
// and NONE of that may reach a third party. Everything not listed is dropped.
const FORWARD_REQUEST_HEADERS = ["content-type", "accept"];

// Response headers worth returning. Upstream's hop-by-hop and encoding headers
// must NOT be copied — we hand back an already-decoded body, so a stale
// content-encoding/content-length would corrupt it.
const FORWARD_RESPONSE_HEADERS = ["content-type", "retry-after"];

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const key = process.env.ZORA_API_KEY;
  const suffix = (path ?? []).map(encodeURIComponent).join("/");
  const url = `${ZORA_UPSTREAM}/${suffix}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (key) headers.set("api-key", key);
  else console.warn(`[zora-proxy] ZORA_API_KEY is not set — forwarding ${suffix} UNKEYED (expect rate limits).`);

  // Body: forwarded as raw text, unparsed and unmodified. GET/HEAD carry none.
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: req.method, headers, body, cache: "no-store", redirect: "follow" });
  } catch (e: any) {
    // Network-class failure reaching Zora at all. 502 is the honest status —
    // it is genuinely upstream, and the client classifier reads it as such.
    console.error(`[zora-proxy] NETWORK failure reaching upstream ${req.method} /${suffix}:`, String(e?.message ?? e).slice(0, 200));
    return NextResponse.json(
      { error: "Could not reach Zora's API.", zoraProxy: "network" },
      { status: 502, headers: { [ZORA_KEYED_HEADER]: key ? "sent" : "absent" } },
    );
  }

  const text = await upstream.text();

  // Rate limits get their own log line — this is the signal Z1 was hunting, and
  // it must be distinguishable at a glance from a genuine Zora incident.
  if (upstream.status === 429) {
    console.warn(`[zora-proxy] 429 RATE LIMITED by upstream on ${req.method} /${suffix} (key ${key ? "sent" : "ABSENT"})${upstream.headers.get("retry-after") ? ` retry-after=${upstream.headers.get("retry-after")}` : ""} — ${text.slice(0, 200)}`);
  } else if (!upstream.ok) {
    console.warn(`[zora-proxy] upstream ${upstream.status} on ${req.method} /${suffix} (key ${key ? "sent" : "ABSENT"}) — ${text.slice(0, 300)}`);
  }

  // Status and body verbatim — the SDK and the client-side classifier both
  // depend on seeing exactly what Zora said.
  const out = new NextResponse(text, { status: upstream.status });
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out.headers.set(h, v);
  }
  // Lets the browser-side evidence tap report keying it cannot otherwise see.
  out.headers.set(ZORA_KEYED_HEADER, key ? "sent" : "absent");
  return out;
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
