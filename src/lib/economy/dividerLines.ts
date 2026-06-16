// ── Dividing lines — PIECE 2 of the badge redesign ───────────────────────────
//
// The 0.5px vertical divider between the badge backdrop and the PFP (Piece 1)
// becomes a tiered, user-chosen gradient — the visible reward for climbing.
// One source of truth for the line art + tier gating, read by the Edit Profile
// picker AND by both profile headers (which feed it to BannerBadgeStrip's
// dividerColor hook).
//
// The dividing-line gradients are a DELIBERATE exception to the no-gradients
// rule. Stops are EXACT from Eric's reference ("2. banner-dividing-line-
// reference"), top→bottom. Default = solid black (#000000) = invisible against
// the black header (the no-customization default).

import type { BadgeTierFlags } from './badges';

export type DividerLineKey = 'default' | 'slate' | 'splice' | 'drip' | 'golden' | 'sunset' | 'burn';

export interface DividerLine {
  key: DividerLineKey;
  name: string;
  /** CSS background — drives the actual 0.5px divider AND the picker swatch. */
  gradient: string;
  /** Minimum tier that unlocks this line (tiers stack — a tier sees all below).
      0 = free/default · 1 = Pro + any badged · 2 = SRH/Collector/Augmented · 3 = Augmented. */
  tier: 0 | 1 | 2 | 3;
}

export const DIVIDER_LINES: Record<DividerLineKey, DividerLine> = {
  default: { key: 'default', name: 'DEFAULT', gradient: '#000000', tier: 0 },
  slate:   { key: 'slate',   name: 'SLATE',   gradient: 'linear-gradient(180deg, #483D3D 0%, #919191 100%)', tier: 1 },
  splice:  { key: 'splice',  name: 'SPLICE',  gradient: 'linear-gradient(180deg, #959595 0%, #CC0000 50%, #8A8A8A 100%)', tier: 1 },
  drip:    { key: 'drip',    name: 'DRIP',    gradient: 'linear-gradient(180deg, #FF0000 0%, #A42424 32%, #212121 100%)', tier: 2 },
  // GOLDEN 0% — reference starts light/grey before the 695B53→FFBB00 ramp;
  // using ~#959595 as the grey start (confirm against Figma fills).
  golden:  { key: 'golden',  name: 'GOLDEN',  gradient: 'linear-gradient(180deg, #959595 0%, #695B53 34%, #FFBB00 100%)', tier: 2 },
  sunset:  { key: 'sunset',  name: 'SUNSET',  gradient: 'linear-gradient(180deg, #D77BFF 0%, #E15CBF 33%, #E74C9D 50%, #EB3E80 66%, #F51F40 88%, #FF0000 100%)', tier: 3 },
  burn:    { key: 'burn',    name: 'BURN',    gradient: 'linear-gradient(180deg, #FFF3EC 0%, #FFBB00 39%, #FF0000 100%)', tier: 3 },
};

export const DIVIDER_ORDER: DividerLineKey[] = ['default', 'slate', 'splice', 'drip', 'golden', 'sunset', 'burn'];

/** Label shown on a LOCKED swatch (the tier needed to unlock it). */
export const TIER_UNLOCK_LABEL: Record<1 | 2 | 3, string> = {
  1: 'PRO+',
  2: 'COLLECTOR+',
  3: 'AUGMENTED',
};

export interface DividerTierFlags extends BadgeTierFlags {
  composer?: boolean;
  srh?: boolean;
}

/**
 * Highest unlocked tier from the user's ACTUAL held badges. Tiers stack.
 *   Augmented                         → 3 (SUNSET + BURN + all below)
 *   SRH / Collector                   → 2 (DRIP + GOLDEN + tier 1)
 *   Pro / First Cut / In-House /
 *   Composer / (SRH / Collector)      → 1 (SLATE + SPLICE)
 *   nothing                           → 0 (default black only)
 */
export function dividerTier(f: DividerTierFlags): 0 | 1 | 2 | 3 {
  if (f.isFoundingMember) return 3;
  if (f.isTopCollector || f.srh) return 2;
  const anyBadged =
    !!f.isPaidMember || (f.firstCutCount ?? 0) > 0 || !!f.isInHouseCreator || !!f.composer;
  return anyBadged ? 1 : 0;
}

export function isDividerUnlocked(key: DividerLineKey, tier: 0 | 1 | 2 | 3): boolean {
  return DIVIDER_LINES[key].tier <= tier;
}

/** The CSS background for a persisted line key — '#000000' (invisible) by default. */
export function dividerBackground(key: string | null | undefined): string {
  const line = key ? DIVIDER_LINES[key as DividerLineKey] : undefined;
  return line?.gradient ?? '#000000';
}
