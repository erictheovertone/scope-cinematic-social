// ── ETH/USD rate — the ONE source ────────────────────────────────────────────
//
// Feed: CoinGecko simple-price (https://api.coingecko.com/api/v3/simple/price)
// — free, no key, single round-trip. All dollar displays convert through this
// module, surfaced to UI via the EconomyProvider boundary (getEthUsdRate).
//
// Cache: 60s TTL, stale-while-revalidate — a stale rate returns immediately
// while a background refresh runs; callers never block on re-fetch and never
// fetch per-render.
//
// HONEST FAILURE: if the feed is unreachable and no rate was ever fetched,
// this returns NULL — surfaces show "$—" / hide the dollar figure. We never
// fall back to a hardcoded constant: a missing number beats a lying number.
// (The old fallback of 3000 inflated every dollar display ~2x.)

let cachedRate: number | null = null;
let cacheTime = 0;
let inflight: Promise<void> | null = null;
const CACHE_TTL_MS = 60_000;

async function fetchRate(): Promise<void> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    const price = data?.ethereum?.usd;
    if (typeof price === "number" && price > 0) {
      cachedRate = price;
      cacheTime = Date.now();
    } else {
      throw new Error("Invalid CoinGecko response shape");
    }
  } catch (e) {
    // Keep whatever rate we had (stale beats absent); never invent one.
    console.warn("[eth-usd] rate fetch failed:", e);
  }
}

/**
 * Current ETH/USD rate, or NULL when genuinely unavailable (feed down and
 * nothing cached). Fresh cache returns instantly; stale cache returns the
 * stale value and refreshes in the background.
 */
export async function getEthUsdRate(): Promise<number | null> {
  const now = Date.now();
  const fresh = cachedRate !== null && now - cacheTime < CACHE_TTL_MS;
  if (fresh) return cachedRate;

  if (!inflight) inflight = fetchRate().finally(() => { inflight = null; });

  if (cachedRate !== null) return cachedRate; // stale-while-revalidate
  await inflight; // first ever call — must wait
  return cachedRate; // null if the fetch failed
}
