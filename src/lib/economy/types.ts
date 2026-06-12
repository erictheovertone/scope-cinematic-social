// ── Scope Economy — the single typed data boundary ───────────────────────────
//
// THE ONE DISCIPLINE: every economy UI surface reads through this boundary
// (the `useEconomy()` hook from EconomyProvider). No surface fetches market or
// earnings data directly. Phase 1 = mocked implementations (see ./mock.ts).
// Later the SAME signatures are backed by Zora reads + the trade indexer, with
// zero UI rework.
//
// ALL money fields are USD. The boundary owns ETH→USD conversion; surfaces
// never see wei or do math. Supply is presented as 10,000 "pieces" (a display
// denomination over Zora's fixed 1B underlying — see Phase 0 report Part B2).

/** A FIRST CUT founding slot: one of the first 10 external collectors of a post. */
export interface Slot {
  /** 1..10 — founding position, in order of acquisition. */
  position: number;
  /** Stable user id of the founder (Privy DID / Supabase user_id). */
  userId: string;
  handle: string;
  avatarUrl: string | null;
  /** True if the founder still holds their position; false if they've departed. */
  holding: boolean;
}

/** FIRST CUT provenance for a single post. */
export interface FirstCutMarket {
  /** The 10 founding slots (filled positions only; length ≤ 10). */
  slots: Slot[];
  /** How many of the 10 founding slots are still open (unclaimed). */
  openCount: number;
}

/** Market read for one post's coin. All prices in USD. Supply in pieces. */
export interface PostMarket {
  /** Price per PIECE in USD. NULL for a no-trades pool (price not yet
      discovered) — surfaces show "—", never a fabricated number. */
  priceUsd: number | null;
  mcUsd: number;
  /** True when these numbers come from the real pool/index (coin posts);
      false for mocked preview data. Drives the MOCK DATA banner. */
  live: boolean;
  /** Always 10000 — the piece denomination shown in the UI. */
  supply: number;
  holders: number;
  /** Pieces the viewing user currently holds of this post (0 if none/anon). */
  collectedByViewer: number;
  /** Minimum pieces that constitute a FIRST CUT founding position (anti-snipe). */
  foundingAmount: number;
  /** True if the viewer currently holds a founding position on this post. */
  viewerFounding: boolean;
  firstCut: FirstCutMarket;
}

/** Payment currency on the buy/sell side. USDC and ETH are both Zora-supported. */
export type TradeCurrency = 'USDC' | 'ETH';

/** A buy quote from the pool: dollars in → pieces out (+ secondary ETH detail). */
export interface BuyQuote {
  usdAmount: number;
  pieces: number;
  /** Secondary detail only — never the headline number. */
  ethAmount: number;
}

/** A sell quote: pieces in → dollars out (+ secondary ETH detail). */
export interface SellQuote {
  pieces: number;
  usdAmount: number;
  ethAmount: number;
}

/** One of a user's FIRST CUT founding positions across all posts. */
export interface FirstCutPosition {
  postId: string;
  /** 1..10 founding slot on that post. */
  slot: number;
  holdingDays: number;
  earnedUsd: number;
  /** False once the user has sold/departed the position. */
  active: boolean;
  // Display fields for the First Cut page rows. In the live boundary these are
  // joined from the post; the mock supplies them so the page stays a pure view.
  postTitle: string;
  creatorHandle: string;
  thumbUrl: string | null;
}

/** A user's FIRST CUT record — drives the public First Cut page. */
export interface FirstCuts {
  totalEarnedUsd: number;
  positions: FirstCutPosition[];
}

/** The plain-English money surface: where a user's dollars come from. */
export interface Earnings {
  creatorEarnedUsd: number;
  firstCutEarnedUsd: number;
  poolsEarnedUsd: number;
  totalUsd: number;
}

/** Badge state for a user. Absent fields = badge not earned (skip in stack). */
export interface Badges {
  /** Augmented status (top rarity). */
  augmented?: boolean;
  /** Number of FIRST CUT founding positions held. */
  firstCutCount?: number;
  /** Top-1k rank (1..1000) if ranked, else absent. */
  topKRank?: number;
  /** Scope Pro member. */
  pro?: boolean;
}

/** Result of the (mocked, Phase 1) collect action. */
export interface CollectResult {
  ok: boolean;
  /** Pieces acquired in this collect. */
  pieces: number;
  /** Mock tx reference — visibly fake in Phase 1. */
  ref: string;
}

/** The boundary contract. Mocked now; Zora-backed later. Signatures are fixed. */
export interface EconomyApi {
  getPostMarket(postId: string): Promise<PostMarket>;
  getFirstCuts(userId: string): Promise<FirstCuts>;
  getEarnings(userId: string): Promise<Earnings>;
  getBadges(userId: string): Promise<Badges>;
  /** Phase 1 stub — mocks success, performs NO real transaction. */
  collect(postId: string, pieces?: number): Promise<CollectResult>;
  /**
   * Given collected post ids, return the subset on which the viewer holds a
   * FIRST CUT founding position — drives the ] • [ insignia on COLLECTED tiles.
   */
  getFoundingPostIds(postIds: string[]): Promise<string[]>;
  /** Pool quote for a dollar-led BUY: USD in → pieces out. */
  quoteBuy(postId: string, usdAmount: number): Promise<BuyQuote>;
  /** Pool quote for a position-led SELL: pieces in → USD out. */
  quoteSell(postId: string, pieces: number): Promise<SellQuote>;
  /** BUY stub — mocks success, NO real transaction. `currency` = payment side. */
  buy(postId: string, usdAmount: number, currency: TradeCurrency): Promise<CollectResult>;
  /** SELL stub — mocks success, NO real transaction. */
  sell(postId: string, pieces: number): Promise<CollectResult>;
  /**
   * Live ETH/USD rate, or NULL when genuinely unavailable. The ONE conversion
   * source for every dollar display — surfaces never convert on their own and
   * never substitute a constant: show "$—" on null (missing beats lying).
   */
  getEthUsdRate(): Promise<number | null>;
}
