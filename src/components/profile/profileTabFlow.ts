// ── profileTabFlow — the SHARED tab/grid positioning mechanism (Brief F6b §1) ──
//
// Both profile pages (own: profile/page.tsx, public: profile/[username]/page.tsx)
// derive the tab-row anchor + grid spacer from the MEASURED header height (2.2d), so
// the tab row can never overlap the first grid row — the layout is flow-derived, not
// magic-numbered. This lived DUPLICATED inline in both pages, and public had drifted:
// it dropped the safe-area term from its grid spacers → the tab row stacked over grid
// content on notched devices. Extracting the math AND the spacer builder here makes the
// two pages consume ONE mechanism — the fork (and its re-drift) is gone.

export const TAB_ROW_H = 42; // tab row REST padded height (paddingTop 10 + inner 20 + 12)

/** Flow-derived tab/grid geometry from the measured header height + live scroll. */
export function profileTabFlow(headerH: number, gridScrollY: number) {
  const tabAnchor = headerH + 8;                // tab-row rest top, just below the divider
  const tabCap = tabAnchor - 2;                 // pins when the tab reaches top:2
  // 2.2d: reserve the tab's FULL padded height (TAB_ROW_H) + a 6px gap so the first grid
  // row clears it (reserving only the inner height left the old 22px overlap).
  const gridSpacer = tabAnchor + TAB_ROW_H + 6;
  const tabRowOffset = Math.min(gridScrollY, tabCap);
  return { tabAnchor, tabCap, gridSpacer, tabRowOffset };
}

/** The grid's top spacer height — MUST include the safe-area inset (own-profile 2.2d).
 *  Public had bare gridSpacer → overlap by exactly the inset on notched devices. One
 *  canonical builder both pages use, so neither can silently drop the inset again. */
export function gridSpacerCss(gridSpacer: number): string {
  return `calc(${gridSpacer}px + env(safe-area-inset-top, 0px))`;
}
