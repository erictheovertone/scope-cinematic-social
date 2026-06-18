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
import { getCoins, setApiKey } from "@zoralabs/coins-sdk";

const CHAIN_ID = 8453; // Base
const TTL_MS = 45_000;
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

const cache = new Map<string, { data: CoinRead; at: number }>();
let inflight: Promise<void> | null = null;
let inflightAddrs = new Set<string>();
let backoffUntil = 0;
let backoffMs = 2_000;

if (process.env.ZORA_API_KEY) setApiKey(process.env.ZORA_API_KEY);

async function fetchUpstream(addresses: string[]): Promise<void> {
  if (Date.now() < backoffUntil) return; // in backoff — stale gets served
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
          : { found: false, priceInUsdc: null, marketCap: null, uniqueHolders: 0, symbol: null },
      });
    }
    backoffMs = 2_000; // healthy again
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("429") || e?.status === 429) {
      backoffUntil = Date.now() + backoffMs;
      console.warn(`[api/market] upstream 429 — backing off ${backoffMs}ms (key ${process.env.ZORA_API_KEY ? "present" : "MISSING"})`);
      backoffMs = Math.min(backoffMs * 2, 60_000);
    } else {
      console.error("[api/market] upstream error:", msg.slice(0, 200));
    }
  }
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
  const missing = addresses.filter((a) => !cache.has(a));
  const stale = addresses.filter((a) => cache.has(a) && now - cache.get(a)!.at > TTL_MS);

  if (missing.length > 0) {
    // Cold addresses must wait for data; dedupe concurrent identical fetches.
    const need = missing.filter((a) => !inflightAddrs.has(a));
    if (need.length > 0 || !inflight) {
      const batch = [...new Set([...missing, ...stale])];
      inflightAddrs = new Set(batch);
      inflight = fetchUpstream(batch).finally(() => { inflight = null; inflightAddrs = new Set(); });
    }
    await inflight;
  } else if (stale.length > 0 && !inflight) {
    // Stale-while-revalidate: serve immediately, refresh in background.
    const batch = [...stale];
    inflightAddrs = new Set(batch);
    inflight = fetchUpstream(batch).finally(() => { inflight = null; inflightAddrs = new Set(); });
  }

  const markets: Record<string, CoinRead> = {};
  for (const a of addresses) {
    markets[a] = cache.get(a)?.data ?? { found: false, priceInUsdc: null, marketCap: null, uniqueHolders: 0, symbol: null };
  }
  return NextResponse.json({ markets });
}
