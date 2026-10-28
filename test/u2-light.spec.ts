import { test, type Page } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Brief U2-3 — the light-mode sweep: every surface the brief names, captured in LIGHT (and dark
// for the before/after pair). Verify-then-fix: these shots ARE the evidence list.
//   npx playwright test test/u2-light.spec.ts --project=iphone-webkit
const OUT = join(process.cwd(), process.env.SWEEP_OUT || 'test/shots-u2/light');
mkdirSync(OUT, { recursive: true });

type Theme = 'dark' | 'light';
const THEMES: Theme[] = ['light', 'dark'];
const PROFILE = process.env.SWEEP_USER || 'overtone';
const FIX = (n: string) => join(process.cwd(), 'test/fixtures/create', n);

test.setTimeout(240_000);

async function boot(page: Page, theme: Theme) {
  await page.addInitScript((t) => { try { localStorage.setItem('scope.theme', t); } catch { /* */ } }, theme);
}

/** The return recap is a one-per-session takeover; shoot it if it's up, then ENTER past it. */
async function pastRecap(page: Page, shot: (n: string) => string) {
  const enter = page.getByRole('button', { name: 'ENTER', exact: true });
  if (await onScreen(page, /^ENTER$/)) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot('recap') });
    await enter.evaluate((e) => (e as HTMLElement).click());
    await page.waitForTimeout(700);
  }
}

/** Text actually inside the viewport (off-screen sheets stay mounted, so Playwright's
 *  "visible" isn't enough). */
const onScreen = (page: Page, re: RegExp) => page.evaluate((src) => {
  const rx = new RegExp(src.source, src.flags);
  return [...document.querySelectorAll('p,button,span')].some((el) => {
    if (!rx.test((el.textContent || '').trim())) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight;
  });
}, { source: re.source, flags: re.flags });

const visibleButton = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name }).filter({ visible: true }).first();

/** Tap the first grid tile below the profile header. */
async function openFirstTile(page: Page) {
  const pt = await page.evaluate(() => {
    const im = [...document.querySelectorAll('img')].find((i) => { const r = i.getBoundingClientRect(); return r.top > 250 && r.width > 150; });
    if (!im) return null;
    const r = im.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!pt) throw new Error('no grid tile');
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(2500);
}

for (const theme of THEMES) {
  test.describe(`U2-3 light sweep — ${theme}`, () => {
    test(`home · recap · toolbar · mirage — ${theme}`, async ({ page }, info) => {
      const shot = (n: string) => join(OUT, `${n}-${theme}-${info.project.name}.png`);
      await boot(page, theme);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      await pastRecap(page, shot);
      // The recap shows once per launch; open it on demand (RecapHost's manual trigger).
      await page.evaluate(() => window.dispatchEvent(new Event('scope:open-recap')));
      await page.waitForTimeout(2500);
      await pastRecap(page, shot);
      await page.screenshot({ path: shot('home') });
      if (info.project.name === 'iphone-webkit') {
        await page.mouse.click(337, 25); // the aperture (viewing modes)
        await page.waitForTimeout(1200);
        await page.screenshot({ path: shot('modes') });
        await visibleButton(page, /^Mirage/).click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: shot('mirage') });
        // Mirage focus view — tap a tile.
        await page.mouse.click(120, 300);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: shot('mirage-focus') });
      }
    });

    test(`profile post scroll · collect · not-collectible · theatre — ${theme}`, async ({ page }, info) => {
      const shot = (n: string) => join(OUT, `${n}-${theme}-${info.project.name}.png`);
      await boot(page, theme);
      await page.goto(`/profile/${PROFILE}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      await pastRecap(page, shot);
      await page.screenshot({ path: shot('profile') });
      await openFirstTile(page);
      await page.screenshot({ path: shot(info.project.name === 'iphone-webkit' ? 'post-scroll' : 'lightbox') });

      // Theatre first (before any sheet can sit over it).
      const theatre = visibleButton(page, 'Theatre');
      if (await theatre.count()) {
        await theatre.evaluate((e) => (e as HTMLElement).click());
        await page.waitForTimeout(2500);
        await page.screenshot({ path: shot('theatre') });
      }

      const tapCollect = async (i: number) => {
        await page.goto(`/profile/${PROFILE}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);
        await openFirstTile(page);
        const btn = page.getByRole('button', { name: 'COLLECT', exact: true }).nth(i);
        await btn.evaluate((e) => { e.scrollIntoView({ block: 'center' }); });
        await page.waitForTimeout(800);
        await btn.evaluate((e) => (e as HTMLElement).click());
        await page.waitForTimeout(1800);
      };
      // Post 1 is coined → the collect sheet (currency box + amount).
      await tapCollect(0);
      await page.screenshot({ path: shot('collect') });
      await visibleButton(page, '$5').click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: shot('collect-amount') });
      // Post 7 (pinned-first order) is UNCOINED → NOT YET COLLECTIBLE (mobile post scroll; the
      // desktop lightbox pages one post at a time, so its COLLECT index differs).
      if (info.project.name !== 'iphone-webkit') return;
      await tapCollect(Number(process.env.SWEEP_NC_INDEX ?? 6));
      if (await onScreen(page, /^not yet collectible$/i)) await page.screenshot({ path: shot('not-collectible') });
      else console.warn('[sweep] post did not open NOT YET COLLECTIBLE');
    });

    test(`create flow — ${theme}`, async ({ page }, info) => {
      const shot = (n: string) => join(OUT, `${n}-${theme}-${info.project.name}.png`);
      await boot(page, theme);
      await page.goto('/create', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      await page.screenshot({ path: shot('create') });
      // The edit step (caption / layout / deck boxes) via the image path — media → crop → done.
      const traces: string[] = [];
      page.on('console', (m) => { const t = m.text(); if (t.startsWith('[crop]') || t.startsWith('[finish]')) traces.push(t); });
      await page.goto('/create?debug=crop', { waitUntil: 'domcontentloaded' });
      await page.locator('input[type="file"]').first().setInputFiles(FIX('landscape-4000x3000-noexif.jpg'));
      await page.getByRole('button', { name: 'Next' }).first().click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: shot('create-crop') });
      await page.getByRole('button', { name: 'Confirm' }).first().click();
      // The finishing suite stays FORCE-DARK under either theme (brief U2-3).
      await page.locator('[data-force-dark]').first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: shot('finishing') });
      await page.getByRole('button', { name: /^done$/i }).first().click({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await page.evaluate(() => document.querySelectorAll('div').forEach((d) => {
        if (getComputedStyle(d).position === 'fixed' && (d.textContent || '').trimStart().startsWith('[crop]')) (d as HTMLElement).style.display = 'none';
      }));
      await page.screenshot({ path: shot('create-edit') });
    });
  });
}
