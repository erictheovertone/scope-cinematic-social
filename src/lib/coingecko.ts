let cachedPrice: number | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60_000;

export async function getLiveEthPrice(): Promise<number> {
  const now = Date.now();
  if (cachedPrice !== null && now - cacheTime < CACHE_TTL_MS) {
    return cachedPrice;
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    const price = data?.ethereum?.usd;
    if (typeof price === "number" && price > 0) {
      cachedPrice = price;
      cacheTime = now;
      return price;
    }
    throw new Error("Invalid CoinGecko response");
  } catch (e) {
    console.warn("[coingecko] price fetch failed, using fallback 3000:", e);
    return cachedPrice ?? 3000;
  }
}
