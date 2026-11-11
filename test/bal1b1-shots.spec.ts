// ── BAL-1b.1 review shots — anonymous, against a local production build ────────────────────────────
// Renders the REAL TopUpSheet + the pill/Slate (TopUpPendingHost) through the gated /debug/topup&shots
// harness. No auth is needed for the layout, so this never touches the shared Privy session. Saves into
// the MAIN checkout (untracked) for side-by-side review with the mock.
import { test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';

const OUT = '/Volumes/EB_PROJECT_RAID_Studio/scope/build/scope/docs/design/bal-1b-shots';
mkdirSync(OUT, { recursive: true });

const SIZES = [{ w: 375, h: 667 }, { w: 390, h: 844 }];
const THEMES = ['dark', 'light'] as const;
const URL = '/debug/topup?debug=topup&shots=1';

async function newCtx(browser: BrowserContext['browser'] extends never ? never : import('@playwright/test').Browser, w: number, h: number, theme: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('scope.theme', t as string); } catch { /* */ } try { document.documentElement?.setAttribute('data-theme', t as string); } catch { /* */ } }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[shots] pageerror ${w}x${h} ${theme}: ${e.message}`));
  return { ctx, page };
}

test('BAL-1b.1 shots', async ({ browser }) => {
  for (const { w, h } of SIZES) {
    for (const theme of THEMES) {
      const tag = `${w}x${h}-${theme}`;
      const { ctx, page } = await newCtx(browser, w, h, theme);
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-topup-shots]', { timeout: 20_000 });
      await page.waitForTimeout(400);

      // sheet · wallet (dollars only, no counts)
      await page.click('[data-shot="open-wallet"]');
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/sheet-wallet-${tag}.png` });
      await page.keyboard.press('Escape').catch(() => {});
      await page.click('body', { position: { x: 5, y: 5 } }).catch(() => {});
      await page.waitForTimeout(350);

      // sheet · collect (counts at $3/collect, $4 shortfall → $10 preselected, 3/8/16)
      await page.click('[data-shot="open-collect"]');
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/sheet-collect-${tag}.png` });
      await page.click('body', { position: { x: 5, y: 5 } }).catch(() => {});
      await page.waitForTimeout(350);

      // docked pill
      await page.click('[data-shot="pill"]');
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/pill-${tag}.png` });

      // B · Slate — five frames: bars shut, blades clap, mid count-up, timecode, bars open
      await page.click('[data-shot="slate"]');
      const frames: [string, number][] = [['1-bars', 90], ['2-blades', 150], ['3-count', 420], ['4-timecode', 400], ['5-open', 320]];
      for (const [name, dwell] of frames) {
        await page.waitForTimeout(dwell);
        await page.screenshot({ path: `${OUT}/slate-${name}-${tag}.png` });
      }
      await page.waitForTimeout(400);
      await ctx.close();
      console.log(`[shots] ${tag} done`);
    }
  }
});
