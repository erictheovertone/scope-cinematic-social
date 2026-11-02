import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// ── Brief NAV-1 — pinned logomark + Stem menu ───────────────────────────────────────────────────
const OUT = join(process.cwd(), 'test/shots-nav1');
mkdirSync(OUT, { recursive: true });
async function boot(page: Page, t: string) { await page.addInitScript((x) => { try { localStorage.setItem('scope.theme', x); } catch { /* */ } }, t); }

// The add-to-home-screen nudge (z-800) opens on /profile in the harness and covers the pinned mark.
// A real user dismisses it once; here we take it out of the way so we can exercise the mark.
async function hideA2HS(page: Page) {
  await page.evaluate(() => { document.querySelectorAll('div').forEach((d) => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && cs.zIndex === '800') (d as HTMLElement).style.display = 'none'; }); });
}
// Make the grid tall enough to scroll to 3000, then set scrollTop and fire React's onScroll.
async function scrollGrid(page: Page, y: number) {
  await page.evaluate((top) => {
    const sc = document.querySelector('[data-testid="grid-scroll"]') as HTMLElement | null;
    if (!sc) return;
    if (!sc.querySelector('[data-nav1-spacer]')) { const sp = document.createElement('div'); sp.setAttribute('data-nav1-spacer', '1'); sp.style.height = '4000px'; sc.appendChild(sp); }
    sc.scrollTop = top; sc.dispatchEvent(new Event('scroll'));
  }, y);
  await page.waitForTimeout(300);
}
const markOpacity = (page: Page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="pinned-mark"]') as HTMLElement | null;
  return el ? parseFloat(getComputedStyle(el).opacity) : null;
});
async function dismissRecap(page: Page) {
  const enter = page.getByRole('button', { name: 'ENTER', exact: true });
  if (await enter.count() && await enter.isVisible().catch(() => false)) { await enter.click(); await page.waitForTimeout(700); }
}

for (const theme of ['light', 'dark'] as const) {
  test(`NAV-1 — pinned mark visible through scroll + menu opens/closes — ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone-webkit', 'mobile nav');
    const shot = (n: string) => join(OUT, `${n}-${theme}.png`);
    await boot(page, theme);
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await dismissRecap(page);
    await hideA2HS(page);

    // scrollY = 0 → hidden; 600 and 3000 → visible (STAYS visible — the whole point).
    await scrollGrid(page, 0);
    expect(await markOpacity(page), 'hidden at top').toBeLessThan(0.1);
    await scrollGrid(page, 600);
    expect(await markOpacity(page), 'visible at 600').toBeGreaterThan(0.9);
    await page.screenshot({ path: shot('closed') });
    await scrollGrid(page, 3000);
    expect(await markOpacity(page), 'STILL visible at 3000').toBeGreaterThan(0.9);

    // Open the Stem menu; mid-glitch frame; assert rows.
    await hideA2HS(page);
    await page.getByTestId('pinned-mark').getByRole('button', { name: 'Menu' }).click();
    await page.screenshot({ path: shot('glitch') });
    await expect(page.getByTestId('stem-menu'), 'menu opens').toBeVisible({ timeout: 4000 });
    await expect(page.getByRole('menuitem', { name: /COLLECTED/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /DECKS/i })).toBeVisible();
    await page.waitForTimeout(350);
    await page.screenshot({ path: shot('open') });

    // Esc closes it.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('stem-menu'), 'menu closes').toBeHidden({ timeout: 4000 });
  });
}

test('NAV-1 — no chrome overlap at 375 and 320 (grid + post scroll)', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone-webkit', 'mobile nav');
  for (const w of [375, 320]) {
    await page.setViewportSize({ width: w, height: 760 });
    await boot(page, 'dark');
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await dismissRecap(page);
    await hideA2HS(page);
    await scrollGrid(page, 400);
    await page.screenshot({ path: join(OUT, `grid-${w}.png`) });
    const pt = await page.evaluate(() => { const im = [...document.querySelectorAll('img')].find((i) => { const r = i.getBoundingClientRect(); return r.top > 150 && r.width > 120; }); if (!im) return null; const r = im.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (pt) { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(2500); await page.screenshot({ path: join(OUT, `postscroll-${w}.png`) }); }
  }
});
