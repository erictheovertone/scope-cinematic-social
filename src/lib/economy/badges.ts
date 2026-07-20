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
  | 'srh'
  | 'composer'
  | 'pro'
  | 'inHouse'
  | 'free';

export interface BadgeMeta {
  /** Framed design-refresh card (public/badges/framed-badges) — bio sheet ~50px
      + banner 19×14. Absent (pro/free: no framed asset shipped) → bannerSrc. */
  framedSrc?: string;
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
// REBRAND Brief 1 · Stage 5 — ONE badge set used globally (the old standard-vs-
// backdropped split is dead). src = bannerSrc = framedSrc all point at the single
// new asset per key (served from the canonical asset folder). free has NO new art →
// keeps its old asset (FLAGGED). The count/label chrome + sizes are untouched.
const NEW = '/design-updates-071526/new-badges';
export const BADGES: Record<BadgeKey, BadgeMeta> = {
  augmented: { key: 'augmented', src: `${NEW}/augmented.png`,  title: 'AUGMENTED', color: '#ff0080',            bannerSrc: `${NEW}/augmented.png`,  framedSrc: `${NEW}/augmented.png` },
  firstCut:  { key: 'firstCut',  src: `${NEW}/first-cut.png`,  title: 'FIRST CUT', color: '#00E08A',            bannerSrc: `${NEW}/first-cut.png`,  framedSrc: `${NEW}/first-cut.png` },
  top1k:     { key: 'top1k',     src: `${NEW}/collector.png`,  title: 'TOP 1K',    color: '#C9A84C',            bannerSrc: `${NEW}/collector.png`,  framedSrc: `${NEW}/collector.png` },
  srh:       { key: 'srh',       src: `${NEW}/srh.png`,        title: 'SRH',       color: '#C9A84C',            bannerSrc: `${NEW}/srh.png`,        framedSrc: `${NEW}/srh.png` },
  composer:  { key: 'composer',  src: `${NEW}/composer.png`,   title: 'COMPOSER',  color: '#7FB2FF',            bannerSrc: `${NEW}/composer.png`,   framedSrc: `${NEW}/composer.png` },
  pro:       { key: 'pro',       src: `${NEW}/scope-pro.png`,  title: 'SCOPE PRO', color: '#E5E1DB',            bannerSrc: `${NEW}/scope-pro.png`,  framedSrc: `${NEW}/scope-pro.png` },
  inHouse:   { key: 'inHouse',   src: `${NEW}/in-house.png`,   title: 'IN-HOUSE',  color: 'rgba(229,225,219,0.6)', bannerSrc: `${NEW}/in-house.png`,   framedSrc: `${NEW}/in-house.png` },
  free:      { key: 'free',      src: '/free-tier-aperture-logo-red.png',            title: 'FREE TIER', color: '#E5E1DB' },
};

/** Rarity order for the stack/section. */
export const RARITY_ORDER: BadgeKey[] = ['augmented', 'firstCut', 'top1k', 'srh', 'composer', 'pro', 'inHouse'];

// ── Tap-blurb copy (BADGES section pop-up) ───────────────────────────────────
// RATIFIED by Eric 2026-06-11. From Scope_Economy.docx §4: one breath each,
// ≤2 sentences, 12-year-old-proof. NOTE: §3 Denomination Rule bans the phrase
// "share of platform fees" — collector rewards are stated as % of VOLUME.
export const BADGE_BLURBS: Record<BadgeKey, string> = {
  augmented: 'One of Scope’s first 500 members. They earn a slice of every trade on Scope, forever — the founding honor.',
  firstCut: 'Given for being one of the first 10 people to collect a post. As long as they keep every piece, they earn a cut each time that post is traded.',
  top1k: 'One of the 1,000 biggest collectors on Scope. Together they earn 1% of everything traded, split among them.',
  srh: 'Holds a post in the Screening Room — Scope’s top-50 most-traded showcase. A live signal, held only while the post stays in the room.',
  composer: 'Earned by musicians who contribute original tracks to the Scope Original Music Library. Held while at least one of your tracks is approved.',
  pro: 'A paid Scope membership — the full finishing suite, every look, every tool.',
  inHouse: 'Earned by creators who regularly use Scope’s built-in tools to make their work. It can’t be bought — only earned.',
  free: 'Every Scope account starts here: full posting and collecting, minted on Base from day one.',
};

// ── Short blurb (Piece 4 — bio-sheet BADGES pop) ─────────────────────────────
// 1–2 sentences for the tap-pop; full explainers live in Piece 6. Working copy
// from Eric's brief (he can refine). composer/srh copy is ready for when those
// keys + earning logic land.
export const BADGE_SHORT_BLURB: Record<BadgeKey, string> = {
  pro: 'The paid membership tier — unlocks Pro features and customization.',
  firstCut: 'Held by the first 10 external collectors of a post — a permanent founding position in that work.',
  augmented: 'One of the first 500 members of Scope. The earliest believers.',
  top1k: 'Among the top 1,000 collectors on Scope by collecting activity.',
  srh: 'Currently holds a post in the Screening Room — Scope’s top-50 most-traded showcase. Held in real time; lost if the post drops out.',
  composer: 'Contribute to the Scope Original Music Library.',
  inHouse: 'Content created using Scope’s in-app editing tools (the NLE).',
  free: 'Every Scope account starts here — full posting and collecting from day one.',
};

export interface BadgeTierFlags {
  isFoundingMember?: boolean;     // Augmented
  isTopCollector?: boolean;       // Top 1k
  isScreeningRoomHolder?: boolean; // SRH (profiles.is_screening_room_holder — awarded by the cron)
  isPaidMember?: boolean;         // Pro
  isInHouseCreator?: boolean;     // In-House
  /** From the economy boundary (gated); >0 → user holds founding positions. */
  firstCutCount?: number;
  /** >0 → user has ≥1 approved track in the Original Music Library (Composer). */
  composerTrackCount?: number;
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
    srh: !!flags.isScreeningRoomHolder,
    composer: (flags.composerTrackCount ?? 0) > 0,
    pro: !!flags.isPaidMember,
    inHouse: !!flags.isInHouseCreator,
    free: false,
  };
  const list = RARITY_ORDER.filter((k) => earned[k]).map((k) => BADGES[k]);
  return list.length > 0 ? list : [BADGES.free];
}
