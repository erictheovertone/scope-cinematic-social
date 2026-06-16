// ── Badge registry ───────────────────────────────────────────────────────────
//
// One source of truth for badge art + metadata, shared by the pfp BadgeStack,
// the bio-sheet BADGES section, and the First Cut page. Swapping a badge asset
// (e.g. the TEMPORARY First Cut art) is a ONE-LINE change here.
//
// Rarity order (Scope_Economy.docx §4a + Economy UI brief Part 1.1):
//   Augmented → First Cut → Top 1k → Pro  (absent badges skip)
// In-House and Free are retained below Pro so existing membership badges still
// render; Free is the baseline shown only when a user has earned nothing else.

export type BadgeKey =
  | 'augmented'
  | 'firstCut'
  | 'top1k'
  | 'pro'
  | 'inHouse'
  | 'free';

export interface BadgeMeta {
  key: BadgeKey;
  src: string;
  /** Title shown beneath the coin in the BADGES section. */
  title: string;
  /** Accent colour for glow/rim treatments. */
  color: string;
  /** Min-design icon for the header banner strip (Piece 1) — rendered ~16px.
      Distinct from `src` (the coin art). Badges without a strip icon (the Free
      baseline) are simply omitted from the strip. */
  bannerSrc?: string;
}

// TEMPORARY First Cut art = /first-cut-badge-green.png. Swap this one line when
// the final coin art lands; everything downstream reads through BADGES.firstCut.
// bannerSrc = the /badges min-design set (the header strip, Piece 1). composer +
// srh art also live in /badges and render generically once their earning logic
// + keys land (BannerBadgeStrip takes any {src} list — nothing hardcoded).
export const BADGES: Record<BadgeKey, BadgeMeta> = {
  augmented: { key: 'augmented', src: '/augmented-member-founding-500-aperture.png', title: 'AUGMENTED', color: '#ff0080',            bannerSrc: '/badges/augmented-badge-min-design-01.png' },
  firstCut:  { key: 'firstCut',  src: '/first-cut-badge-green.png',                  title: 'FIRST CUT', color: '#00E08A',            bannerSrc: '/badges/first-cut-badge-min-design-01.png' },
  top1k:     { key: 'top1k',     src: '/top-1k-collector-aperture-gold.png',         title: 'TOP 1K',    color: '#C9A84C',            bannerSrc: '/badges/collector-badge-min-design-01.png' },
  pro:       { key: 'pro',       src: '/scope-pro-icon-aperture.png',                title: 'SCOPE PRO', color: '#FF0000',            bannerSrc: '/badges/scope-pro-badge-min-design-01.png' },
  inHouse:   { key: 'inHouse',   src: '/in-house-creator-logo-grey.png',             title: 'IN-HOUSE',  color: 'rgba(255,255,255,0.6)', bannerSrc: '/badges/in-house-badge-min-design-01.png' },
  free:      { key: 'free',      src: '/free-tier-aperture-logo-red.png',            title: 'FREE TIER', color: '#FF0000' },
};

/** Rarity order for the stack/section. */
export const RARITY_ORDER: BadgeKey[] = ['augmented', 'firstCut', 'top1k', 'pro', 'inHouse'];

// ── Tap-blurb copy (BADGES section pop-up) ───────────────────────────────────
// RATIFIED by Eric 2026-06-11. From Scope_Economy.docx §4: one breath each,
// ≤2 sentences, 12-year-old-proof. NOTE: §3 Denomination Rule bans the phrase
// "share of platform fees" — collector rewards are stated as % of VOLUME.
export const BADGE_BLURBS: Record<BadgeKey, string> = {
  augmented: 'One of Scope’s first 500 members. They earn a slice of every trade on Scope, forever — the founding honor.',
  firstCut: 'Given for being one of the first 10 people to collect a post. As long as they keep every piece, they earn a cut each time that post is traded.',
  top1k: 'One of the 1,000 biggest collectors on Scope. Together they earn 1% of everything traded, split among them.',
  pro: 'A paid Scope membership — the full finishing suite, every look, every tool.',
  inHouse: 'Earned by creators who regularly use Scope’s built-in tools to make their work. It can’t be bought — only earned.',
  free: 'Every Scope account starts here: full posting and collecting, minted on Base from day one.',
};

export interface BadgeTierFlags {
  isFoundingMember?: boolean;   // Augmented
  isTopCollector?: boolean;     // Top 1k
  isPaidMember?: boolean;       // Pro
  isInHouseCreator?: boolean;   // In-House
  /** From the economy boundary (gated); >0 → user holds founding positions. */
  firstCutCount?: number;
}

/**
 * Resolve a user's earned badges into rarity-ordered BadgeMeta. Returns the
 * Free baseline when nothing else is earned (matches existing single-badge UI).
 * First Cut only appears when `firstCutCount > 0` — which is only populated
 * through the economy boundary, so it never implies earnings off-flag.
 */
export function resolveBadges(flags: BadgeTierFlags): BadgeMeta[] {
  const earned: Record<BadgeKey, boolean> = {
    augmented: !!flags.isFoundingMember,
    firstCut: (flags.firstCutCount ?? 0) > 0,
    top1k: !!flags.isTopCollector,
    pro: !!flags.isPaidMember,
    inHouse: !!flags.isInHouseCreator,
    free: false,
  };
  const list = RARITY_ORDER.filter((k) => earned[k]).map((k) => BADGES[k]);
  return list.length > 0 ? list : [BADGES.free];
}
