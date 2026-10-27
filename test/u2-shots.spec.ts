import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Brief U2 — the visible day: one evidence spec, one test per item, shots in test/shots-u2.
//   npx playwright test test/u2-shots.spec.ts --project=iphone-webkit -g "U2-1"
const OUT = join(process.cwd(), 'test/shots-u2');
mkdirSync(OUT, { recursive: true });

type Theme = 'dark' | 'light';
const THEMES: Theme[] = ['dark', 'light'];

/** Pin the theme pre-paint (the layout's NO_FOUC stamp reads this key). */
async function pinTheme(ctx: BrowserContext | Page, theme: Theme) {
  await ctx.addInitScript((t) => { try { localStorage.setItem('scope.theme', t); } catch { /* */ } }, theme);
}

const bgOf = (page: Page) => page.evaluate(() => ({
  html: getComputedStyle(document.documentElement).backgroundColor,
  body: document.body ? getComputedStyle(document.body).backgroundColor : null,
  theme: document.documentElement.getAttribute('data-theme'),
  themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
}));

const CANVAS: Record<Theme, string> = { dark: 'rgb(5, 5, 5)', light: 'rgb(229, 225, 219)' };

// ── U2-1 · M21 — PWA cold launch: no white frame ────────────────────────────────────────────
test.describe('U2-1 launch', () => {
  for (const theme of THEMES) {
    test(`U2-1 cold launch sequence — ${theme}`, async ({ browser }, info) => {
      const vp = info.project.use.viewport!;
      const shot = (n: string) => join(OUT, `u2-1-launch-${theme}-${info.project.name}-${n}.png`);

      // Frame 0 — the stylesheet + JS never arrive: what paints is ONLY the server HTML's inline
      // ground. A white frame here is exactly the M21 bug.
      {
        const ctx = await browser.newContext({ ...info.project.use, viewport: vp });
        await pinTheme(ctx, theme);
        const page = await ctx.newPage();
        await page.route(/\.(css|js)(\?|$)/, (r) => r.abort());
        await page.goto('/welcome', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(300);
        const bg = await bgOf(page);
        await page.screenshot({ path: shot('0-no-stylesheet') });
        expect(bg.theme).toBe(theme);
        expect(bg.html, 'html ground before the stylesheet').toBe(CANVAS[theme]);
        expect(bg.body, 'body ground before the stylesheet').toBe(CANVAS[theme]);
        expect(bg.themeColor).toBe(theme === 'light' ? '#E5E1DB' : '#050505');
        await ctx.close();
      }

      // Frames 1… — a real cold STANDALONE launch (LaunchCue path), sampled from the first rAF on.
      const ctx = await browser.newContext({ ...info.project.use, viewport: vp });
      await pinTheme(ctx, theme);
      await ctx.addInitScript(() => {
        Object.defineProperty(window.navigator, 'standalone', { get: () => true });
        const w = window as unknown as { __frames: string[] };
        w.__frames = [];
        const probe = () => {
          const h = getComputedStyle(document.documentElement).backgroundColor;
          const b = document.body ? getComputedStyle(document.body).backgroundColor : '-';
          w.__frames.push(`${Math.round(performance.now())}ms html=${h} body=${b}`);
          if (w.__frames.length < 120) requestAnimationFrame(probe);
        };
        requestAnimationFrame(probe);
      });
      const page = await ctx.newPage();
      await page.goto('/', { waitUntil: 'commit' });
      await page.waitForLoadState('domcontentloaded');
      await page.screenshot({ path: shot('1-dcl') });
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot('2-500ms') });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: shot('3-2s') });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: shot('4-5s') });
      const frames = await page.evaluate(() => (window as unknown as { __frames: string[] }).__frames);
      // eslint-disable-next-line no-console
      console.log(`[launch ${theme}] first frames:\n  ${frames.slice(0, 4).join('\n  ')}`);
      const white = frames.filter((f) => /rgb\(255, 255, 255\)|rgba\(0, 0, 0, 0\)/.test(f.split('html=')[1]?.split(' body')[0] ?? ''));
      expect(white, 'no frame with a white/transparent html ground').toEqual([]);
      expect(frames[0]).toContain(`html=${CANVAS[theme]}`);
      await ctx.close();
    });
  }
});
