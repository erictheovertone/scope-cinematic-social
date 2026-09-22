// ── themeAsset — Brief T1-3 ───────────────────────────────────────────────────
// The ONE map from a dark-theme (default) asset path to its hand-made light-theme variant
// (Eric's exports in design-updates-071526/dark-variations/). themeAsset(src, theme) returns
// the variant ONLY when the light theme is active AND a variant exists; otherwise the original
// (so dark theme is byte-identical — originals still served). Filenames differ from the
// originals per Eric's mapping. Every badge/token-icon/logomark/wordmark consumer routes
// through this (via <ThemedImg>), so there are no scattered conditionals.
//
// NOT here (deliberately):
//  · ScopeLoader + the D14 cue use the logomark PNG as a MASK with --ink as the fill — they
//    already theme via the token; the mask alpha is what matters, so they stay on the ivory
//    file and are NOT swapped.
//  · The free-tier aperture (old red) has no variant yet — keep as-is (inverts poorly in
//    light; Eric supplies later).

import type { Theme } from '@/lib/useTheme';

const DV = '/design-updates-071526/dark-variations';
const NB = '/design-updates-071526/new-badges';
const TI = '/design-updates-071526/token-icons';

export const LIGHT_VARIANT: Record<string, string> = {
  [`${NB}/augmented.png`]: `${DV}/augmented-dark.png`,
  [`${NB}/collector.png`]: `${DV}/collector-dark.png`,
  [`${NB}/composer.png`]: `${DV}/composer-dark.png`,
  [`${NB}/first-cut.png`]: `${DV}/first-cut-dark.png`,
  [`${NB}/in-house.png`]: `${DV}/in-house-dark.png`,
  [`${NB}/srh.png`]: `${DV}/srh-dark.png`,
  [`${NB}/scope-pro.png`]: `${DV}/scope-pro-dark.png`,
  [`${TI}/ethereum.png`]: `${DV}/ethereum-dark.png`,
  [`${TI}/usdc.png`]: `${DV}/usdc-dark.png`,
  [`${TI}/creator.png`]: `${DV}/creator-rewards-dark.png`,
  // Brief T1-3b §1 — the logomark → the charcoal APERTURE mark (not the cursive wordmark).
  // scope-logomark-charcoal.png (the wordmark) stays in the folder, unmapped: no script-wordmark
  // PNG renders on a themed surface, so nothing points at it.
  '/design-updates-071526/scope-logomark-offwhite.png': `${DV}/scope-logomark-aperture-charcoal.png`,
  '/logomark-plain-white.png': `${DV}/scope-logomark-aperture-charcoal.png`,
  '/fragments-wordmark-v3.png': `${DV}/fragments-dark.png`,
};

/** The theme-correct asset path: the light variant when the light theme is active and one
 *  exists, else the original (dark default). */
export function themeAsset(src: string | null | undefined, theme: Theme): string {
  if (!src) return src ?? '';
  return theme === 'light' && LIGHT_VARIANT[src] ? LIGHT_VARIANT[src] : src;
}
