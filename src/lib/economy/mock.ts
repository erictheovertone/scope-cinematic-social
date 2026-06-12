// ── Mocked economy boundary (Phase 1) ────────────────────────────────────────
//
// Realistic, deterministic typed data so surfaces look alive and stable across
// reads (same id → same numbers). Pure mock: no chain calls, no transactions.
// Later, every function here is swapped for Zora reads + indexer queries behind
// the SAME EconomyApi signatures — surfaces don't change.

import type {
  EconomyApi,
  PostMarket,
  FirstCuts,
  Earnings,
  Badges,
  Slot,
  CollectResult,
  BuyQuote,
  SellQuote,
  TradeCurrency,
} from './types';

export const PIECE_SUPPLY = 10_000;
// Minimum pieces that constitute a FIRST CUT founding position (anti-snipe,
// Scope_Economy.docx §4: ~0.1% of supply). 0.1% of 10,000 pieces = 10 pieces.
export const FOUNDING_AMOUNT = 10;
// Mock ETH/USD rate. ETH amounts are SECONDARY detail; dollars lead. Real
// boundary derives this from an oracle/quote — never the UI's problem.
const MOCK_ETH_USD = 3500;

// Deterministic string hash → stable seed per id.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Tiny seeded PRNG (mulberry32) so a seed yields a repeatable sequence.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HANDLES = [
  'lior', 'maya', 'devs', 'kproc', 'nori', 'vega', 'sol', 'rhea',
  'kit', 'ozu', 'wren', 'iko', 'pax', 'juno', 'echo', 'cira',
];

function avatarFor(seed: number): string {
  // Stable placeholder avatar; later replaced by real profile_image_url.
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`;
}

function buildSlots(postId: string): { slots: Slot[]; openCount: number } {
  const r = rng(hash('slots:' + postId));
  // 4..10 founding slots filled; the rest open.
  const filled = 4 + Math.floor(r() * 7);
  const slots: Slot[] = [];
  for (let i = 0; i < filled; i++) {
    const s = hash(`${postId}:${i}`);
    slots.push({
      position: i + 1,
      userId: `mock-user-${s % 100000}`,
      handle: HANDLES[s % HANDLES.length],
      avatarUrl: avatarFor(s),
      // ~75% still holding; the rest departed (dimmed in UI).
      holding: r() > 0.25,
    });
  }
  return { slots, openCount: 10 - filled };
}

function money(r: () => number, min: number, max: number): number {
  return Math.round((min + r() * (max - min)) * 100) / 100;
}

export const mockEconomy: EconomyApi = {
  async getPostMarket(postId: string): Promise<PostMarket> {
    const r = rng(hash('market:' + postId));
    const priceUsd = money(r, 0.4, 9.5);
    // ~35% of the time the viewer holds a founding position (≥ FOUNDING_AMOUNT
    // pieces); otherwise a small/zero casual holding.
    const viewerFounding = r() > 0.65;
    const collectedByViewer = viewerFounding
      ? FOUNDING_AMOUNT + Math.floor(r() * 30)
      : (r() > 0.6 ? 1 + Math.floor(r() * 6) : 0);
    return {
      priceUsd,
      mcUsd: Math.round(priceUsd * PIECE_SUPPLY),
      supply: PIECE_SUPPLY,
      holders: 8 + Math.floor(r() * 240),
      collectedByViewer,
      foundingAmount: FOUNDING_AMOUNT,
      viewerFounding,
      firstCut: buildSlots(postId),
    };
  },

  async quoteBuy(postId: string, usdAmount: number): Promise<BuyQuote> {
    const r = rng(hash('market:' + postId));
    const priceUsd = money(r, 0.4, 9.5);
    const safeUsd = Math.max(0, usdAmount);
    return {
      usdAmount: safeUsd,
      pieces: priceUsd > 0 ? Math.floor(safeUsd / priceUsd) : 0,
      ethAmount: safeUsd / MOCK_ETH_USD,
    };
  },

  async quoteSell(postId: string, pieces: number): Promise<SellQuote> {
    const r = rng(hash('market:' + postId));
    const priceUsd = money(r, 0.4, 9.5);
    const usdAmount = Math.max(0, pieces) * priceUsd;
    return { pieces: Math.max(0, pieces), usdAmount, ethAmount: usdAmount / MOCK_ETH_USD };
  },

  async getFirstCuts(userId: string): Promise<FirstCuts> {
    const r = rng(hash('firstcuts:' + userId));
    const count = 1 + Math.floor(r() * 6);
    let total = 0;
    const TITLES = ['NIGHT SHIFT', 'COLD OPEN', 'DUNE PASS', 'LAST LIGHT', 'STILL WATER', 'RED LINE', 'SALT FLAT', 'OFF SEASON', 'BLUE HOUR', 'DRY DOCK'];
    const positions = Array.from({ length: count }, (_, i) => {
      const earnedUsd = money(r, 2, 180);
      total += earnedUsd;
      const seed = hash(userId + ':' + i);
      return {
        postId: `mock-post-${seed % 100000}`,
        slot: 1 + Math.floor(r() * 10),
        holdingDays: 1 + Math.floor(r() * 320),
        earnedUsd,
        active: r() > 0.2,
        postTitle: TITLES[seed % TITLES.length],
        creatorHandle: HANDLES[(seed >> 3) % HANDLES.length],
        thumbUrl: `https://picsum.photos/seed/${seed % 1000}/120/120`,
      };
    });
    return { totalEarnedUsd: Math.round(total * 100) / 100, positions };
  },

  async getEarnings(userId: string): Promise<Earnings> {
    const r = rng(hash('earnings:' + userId));
    const creatorEarnedUsd = money(r, 0, 2400);
    const firstCutEarnedUsd = money(r, 0, 900);
    const poolsEarnedUsd = money(r, 0, 500);
    return {
      creatorEarnedUsd,
      firstCutEarnedUsd,
      poolsEarnedUsd,
      totalUsd:
        Math.round((creatorEarnedUsd + firstCutEarnedUsd + poolsEarnedUsd) * 100) /
        100,
    };
  },

  async getBadges(userId: string): Promise<Badges> {
    const r = rng(hash('badges:' + userId));
    const badges: Badges = {};
    if (r() > 0.6) badges.augmented = true;
    const fc = Math.floor(r() * 5);
    if (fc > 0) badges.firstCutCount = fc;
    if (r() > 0.5) badges.topKRank = 1 + Math.floor(r() * 1000);
    if (r() > 0.5) badges.pro = true;
    return badges;
  },

  async collect(postId: string, pieces = 1): Promise<CollectResult> {
    // Phase 1 stub — visibly mock. No real transaction is performed.
    await new Promise((res) => setTimeout(res, 600));
    return { ok: true, pieces, ref: `mock-collect-${hash(postId)}-${Date.now()}` };
  },

  async getFoundingPostIds(postIds: string[]): Promise<string[]> {
    // Deterministic ~1/3 of collected tiles read as founding positions.
    return postIds.filter((id) => hash('founding:' + id) % 3 === 0);
  },

  async buy(postId: string, usdAmount: number, currency: TradeCurrency): Promise<CollectResult> {
    await new Promise((res) => setTimeout(res, 600));
    const r = rng(hash('market:' + postId));
    const priceUsd = money(r, 0.4, 9.5);
    const pieces = priceUsd > 0 ? Math.floor(Math.max(0, usdAmount) / priceUsd) : 0;
    return { ok: true, pieces, ref: `mock-buy-${currency}-${hash(postId)}-${Date.now()}` };
  },

  async sell(postId: string, pieces: number): Promise<CollectResult> {
    await new Promise((res) => setTimeout(res, 600));
    return { ok: true, pieces: Math.max(0, pieces), ref: `mock-sell-${hash(postId)}-${Date.now()}` };
  },

  async getEthUsdRate(): Promise<number | null> {
    // NOT mocked: the rate is real infrastructure used by real (ungated)
    // dollar displays — wallet, legacy collect, MC. Delegates to the live
    // feed; null when unavailable (surfaces show "$—").
    const { getEthUsdRate } = await import('@/lib/coingecko');
    return getEthUsdRate();
  },
};
