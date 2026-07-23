// ── /api/market — the ONE caller to Zora (server-side market reads) ──────────
//
// GET /api/market?addresses=0xA,0xB,0xC → { markets: { [addressLower]: {...} } }
//
// Why this exists (the 429 storm): every tile used to hit Zora's API from the
// browser independently — N browsers × N tiles collapsed into rate limits, and
// Zora's 429s lack CORS headers (the double console error). This route:
//   • BATCHES: one upstream getCoins call for many addresses,
//   • CACHES: in-memory, ~45s TTL, stale-while-revalidate,
//   • DEDUPES: concurrent requests for the same coins collapse to one call,
//   • BACKS OFF on 429 (exponential, serves stale — never an on-screen error
//     for a coin that has data; upstream 429s are logged),
//   • attaches the Zora API key SERVER-side: env var ZORA_API_KEY
//     (provision at Zora's developer portal — zora.co/settings/developer;
//     server-only, NOT NEXT_PUBLIC).
//
// Fresh-coin grace: a just-created coin missing from Zora's index returns
// { found: false } — the boundary renders the honest "market opening" state.

import { NextRequest, NextResponse } from "next/server";
import { getCoins } from "@zoralabs/coins-sdk";
import { ensureZoraApi } from "@/lib/zoraApi";

const CHAIN_ID = 8453; // Base
const MAX_ADDRESSES = 50;

interface CoinRead {
  found: boolean;
  priceInUsdc: string | null;
  /** Zora's authoritative market cap (USD). Populated from pool state even
      before a discovered swap price — so it's non-zero when priceInUsdc is
      null. The SAME field the Screening Room ranks by. */
  marketCap: string | null;
  uniqueHolders: number;
  symbol: string | null;
}

const TTL_MS_FOUND = 45_000; // a real read is fresh ~45s
const NEG_TTL_MS = 8_000;    // a genuine not-found is re-checked sooner (don't hammer, don't trust forever)
const MAX_RETRIES = 4;       // RETRY 429s in-request instead of serving an empty miss

const cache = new Map<string, { data: CoinRead; at: number }>();
// Per-ADDRESS in-flight tracking — a concurrent request never overwrites a
// shared promise before its addresses resolve (the old cold-fetch race that
// returned found:false for 9/10 coins on a feed-load burst).
const inflight = new Map<string, Promise<void>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EMPTY: CoinRead = { found: false, priceInUsdc: null, marketCap: null, uniqueHolders: 0, symbol: null };

ensureZoraApi(); // Brief Z2 — keyed transport; this route still calls Zora directly

// Fetch a batch, RETRYING 429s with backoff. Caches ONLY a SUCCESSFUL read —
// real data, or a genuine not-found (the call succeeded but Zora doesn't index
// the coin). A FAILED call (429/error after all retries) caches NOTHING, so the
// addresses stay uncached and the next request retries them — a transient rate
// limit is never frozen into an authoritative "missing".
async function fetchUpstream(addresses: string[]): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res: any = await getCoins({
        coins: addresses.map((collectionAddress) => ({ chainId: CHAIN_ID, collectionAddress })),
      });
      const tokens: any[] = res?.data?.zora20Tokens ?? [];
      const byAddr = new Map<string, any>(
        tokens.filter(Boolean).map((t: any) => [(t.address || "").toLowerCase(), t])
      );
      const now = Date.now();
      for (const a of addresses) {
        const t = byAddr.get(a);
        cache.set(a, {
          at: now,
          data: t
            ? {
                found: true,
                priceInUsdc: t.tokenPrice?.priceInUsdc ?? null,
                marketCap: t.marketCap ?? null,
                uniqueHolders: Number(t.uniqueHolders) || 0,
                symbol: t.symbol ?? null,
              }
            : { ...EMPTY }, // genuine not-found (call succeeded) — short-lived, re-checked
        });
      }
      return; // success
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const is429 = msg.includes("429") || e?.status === 429;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(Math.min(400 * Math.pow(2, attempt), 4_000)); // 0.4s, 0.8s, 1.6s
        continue;
      }
      // Exhausted — do NOT cache. Leave uncached so the next poll retries.
      console.error(`[api/market] upstream failed after ${MAX_RETRIES} tries${is429 ? " (429)" : ""} (key ${process.env.ZORA_API_KEY ? "present" : "MISSING"}):`, msg.slice(0, 160));
      return;
    }
  }
}

function startFetch(addresses: string[]): void {
  const p = fetchUpstream(addresses).finally(() => {
    for (const a of addresses) if (inflight.get(a) === p) inflight.delete(a);
  });
  for (const a of addresses) inflight.set(a, p);
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("addresses") ?? "";
  const addresses = [...new Set(
    raw.split(",").map((a) => a.trim().toLowerCase()).filter((a) => /^0x[0-9a-f]{40}$/.test(a))
  )].slice(0, MAX_ADDRESSES);
  if (addresses.length === 0) {
    return NextResponse.json({ markets: {} });
  }

  const now = Date.now();
  const isFresh = (a: string) => {
    const h = cache.get(a);
    if (!h) return false;
    const ttl = h.data.found ? TTL_MS_FOUND : NEG_TTL_MS; // not-found re-checked sooner
    return now - h.at <= ttl;
  };

  // Everything not fresh needs a fetch; start one only for addresses not already
  // in flight, then AWAIT the per-address promises that cover what we need.
  const need = addresses.filter((a) => !isFresh(a));
  const toFetch = need.filter((a) => !inflight.has(a));
  if (toFetch.length > 0) startFetch(toFetch);
  await Promise.all(need.map((a) => inflight.get(a)).filter(Boolean));

  const markets: Record<string, CoinRead> = {};
  for (const a of addresses) {
    markets[a] = cache.get(a)?.data ?? { ...EMPTY };
  }
  return NextResponse.json({ markets });
}

// ── POST /api/market — bust cache for traded coins ───────────────────────────
//
// Called on a confirmed trade so the post-trade read serves FRESH data instead
// of the ≤45s-old pre-trade price (the wrong-value-until-TTL symptom). Per-coin,
// not whole-cache. Deletes the entries; the next GET re-reads through the SAME
// hardened path (retry/dedup/never-cache-failed) — protections are reused, never
// bypassed.
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 }); }
  const list: string[] = Array.isArray(body?.bust) ? body.bust : [];
  let busted = 0;
  for (const raw of list) {
    const a = String(raw).trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(a) && cache.delete(a)) busted++;
  }
  return NextResponse.json({ ok: true, busted });
}
