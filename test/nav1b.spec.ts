import { test, expect, type Page } from '@playwright/test';

// ── Brief NAV-1b — the Stem menu plays an explicit close (transitionend precedes removal) ──────────
// The menu used to unmount instantly on close. It now scales to .55 + fades over 160ms CLOSE_CURVE,
// the stem retracts, THEN it unmounts on the panel's transitionend. This asserts that ordering:
// a transform transitionend fires on [data-testid="stem-menu"] BEFORE the node leaves the DOM.
async function hideA2HS(page: Page) {
  await page.evaluate(() => { document.querySelectorAll('div').forEach((d) => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && cs.zIndex === '800') (d as HTMLElement).style.display = 'none'; }); });
}
async function scrollGrid(page: Page, y: number) {
  await page.evaluate((top) => {
    const sc = document.querySelector('[data-testid="grid-scroll"]') as HTMLElement | null;
    if (!sc) return;
    if (!sc.querySelector('[data-nav1b-spacer]')) { const sp = document.createElement('div'); sp.setAttribute('data-nav1b-spacer', '1'); sp.style.height = '4000px'; sc.appendChild(sp); }
    sc.scrollTop = top; sc.dispatchEvent(new Event('scroll'));
  }, y);
  await page.waitForTimeout(300);
}
async function dismissRecap(page: Page) {
  const enter = page.getByRole('button', { name: 'ENTER', exact: true });
  if (await enter.count() && await enter.isVisible().catch(() => false)) { await enter.click(); await page.waitForTimeout(700); }
}

test('NAV-1b — close plays an exit; transitionend precedes removal', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone-webkit', 'mobile nav');
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await dismissRecap(page);
  await hideA2HS(page);
  await scrollGrid(page, 800);

  // Open the Stem menu.
  await hideA2HS(page);
  await page.getByTestId('pinned-mark').getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByTestId('stem-menu');
  await expect(menu).toBeVisible({ timeout: 4000 });
  await expect(menu).toHaveAttribute('data-menu-state', 'open', { timeout: 2000 });

  // Instrument: record when transitionend fires on the panel, and when it is removed from the DOM.
  await page.evaluate(() => {
    const w = window as unknown as { __nav: { teAt: number | null; removedAt: number | null; closingSeen: boolean } };
    w.__nav = { teAt: null, removedAt: null, closingSeen: false };
    const panel = document.querySelector('[data-testid="stem-menu"]') as HTMLElement;
    const parent = panel.parentElement as HTMLElement;
    const isPanel = (n: Node) => n === panel || (n as HTMLElement).getAttribute?.('data-testid') === 'stem-menu';
    panel.addEventListener('transitionend', (e) => {
      if ((e as TransitionEvent).propertyName === 'transform' && panel.getAttribute('data-menu-state') === 'closing' && w.__nav.teAt == null) w.__nav.teAt = performance.now();
    });
    const mo = new MutationObserver((muts) => {
      if (panel.getAttribute('data-menu-state') === 'closing') w.__nav.closingSeen = true;
      for (const m of muts) for (const n of Array.from(m.removedNodes)) if (isPanel(n) && w.__nav.removedAt == null) w.__nav.removedAt = performance.now();
    });
    mo.observe(parent, { childList: true, attributes: true, subtree: true });
  });

  // Close it (Esc) and wait for it to leave the DOM.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0, { timeout: 4000 });

  const r = await page.evaluate(() => (window as unknown as { __nav: { teAt: number | null; removedAt: number | null; closingSeen: boolean } }).__nav);
  expect(r.closingSeen, 'panel entered the closing state before unmount').toBe(true);
  expect(r.teAt, 'a transform transitionend fired on the panel while closing').not.toBeNull();
  expect(r.removedAt, 'the panel was removed from the DOM').not.toBeNull();
  expect(r.teAt as number, 'transitionend precedes removal').toBeLessThanOrEqual(r.removedAt as number);
});
