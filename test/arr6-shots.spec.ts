// ── Brief ARR-6 — Arrival card order: closed-state screenshots + geometry gate ───────────────────
// Anonymous. Closed state at 375×667 · 375×812 · 430×932 (iphone-webkit, touch) and 1440×900
// (desktop-chromium), dark + light, for a normal profile and an Augmented one. Asserts per shot:
//   avatar bottom ≤ mark (blades) top  ·  store badges bottom ≤ viewport H − safe-bottom − 24.
// The server under test needs PUBLIC_PROFILES_ENABLED=1 and both users on the allowlist:
//   PUBLIC_PROFILES_ENABLED=1 PUBLIC_PROFILES_ALLOWLIST=overtone,ebert npx next dev -p 3200
//   SKIP_AUTH_PREFLIGHT=1 BASE_URL=http://localhost:3200 npx playwright test test/arr6-shots.spec.ts --workers=1
// ARR6_USERS=overtone,ebert (default). The Augmented variant needs that profile set Augmented
// out-of-band for the run (and reset afterwards) — this spec never writes the DB.
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';

const OUT = 'test/shots-arr6';
mkdirSync(OUT, { recursive: true });
const USERS = (process.env.ARR6_USERS || 'overtone,ebert').split(',').map((s) => s.trim()).filter(Boolean);
const THEMES = ['dark', 'light'] as const;
const MOBILE = [{ width: 375, height: 667 }, { width: 375, height: 812 }, { width: 430, height: 932 }];
const DESKTOP = [{ width: 1440, height: 900 }];

test.use({ storageState: { cookies: [], origins: [] }, trace: 'off' });
test.describe.configure({ mode: 'serial' });

async function closedGeometry(page: Page) {
  return page.evaluate(() => {
    const r = (sel: string) => (document.querySelector(sel) as Element).getBoundingClientRect();
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:var(--safe-bottom, 0px);visibility:hidden';
    document.body.appendChild(probe);
    const safeBottom = probe.getBoundingClientRect().height;
    probe.remove();
    return {
      vh: window.innerHeight,
      safeBottom,
      avatarBottom: r('[data-arrival-avatar]').bottom,
      markTop: r('[data-arrival-mark]').top,
      markBottom: r('[data-arrival-mark]').bottom,
      markWidth: r('[data-arrival-mark]').width,
      cardBottom: r('[data-arrival-card]').bottom,
      badgesTop: r('[data-arrival-badges]').top,
      badgesBottom: r('[data-arrival-badges]').bottom,
      augmented: !!document.querySelector('[data-arrival-card] [data-testid="augmented-tag"]'),
    };
  });
}

for (const user of USERS) {
  for (const theme of THEMES) {
    test(`ARR-6 closed state · ${user} · ${theme}`, async ({ browser }, info) => {
      const desktop = info.project.name.startsWith('desktop');
      const sizes = desktop ? DESKTOP : MOBILE;
      for (const vp of sizes) {
        const ctx = await browser.newContext({
          viewport: vp, isMobile: !desktop, hasTouch: !desktop, deviceScaleFactor: desktop ? 1 : 3,
          baseURL: info.project.use.baseURL, storageState: { cookies: [], origins: [] },
        });
        await ctx.addInitScript((t) => { try { localStorage.setItem('scope.theme', t); } catch { /* */ } }, theme);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => console.log(`[ARR-6] pageerror ${vp.width}x${vp.height}: ${e.message}`));
        const frame = page.getByRole('button', { name: /Join Scope to view/i }).first();
        // dev-server compile can 500 once on a cold route — reload until the real page is up
        for (let i = 0; i < 3; i++) {
          await page.goto(`/${user}`, { waitUntil: 'load' });
          if (await frame.isVisible({ timeout: 15_000 }).catch(() => false)) break;
          await frame.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
          if (await frame.isVisible()) break;
        }
        await expect(frame).toBeVisible({ timeout: 30_000 });
        await page.evaluate(() => document.fonts.ready);
        const closed = () => page.evaluate(() => {
          const c = document.querySelector('[data-arrival-card]') as HTMLElement;
          const b = document.querySelector('[data-arrival-badges]')?.parentElement as HTMLElement;
          return Math.min(parseFloat(getComputedStyle(c).opacity), parseFloat(getComputedStyle(b).opacity));
        });
        // a tap before hydration does nothing — tap again until the aperture closes
        for (let i = 0; i < 3 && (await closed()) < 0.999; i++) {
          await frame.click();
          await page.waitForTimeout(1500);
        }
        // fallback: a manual scroll drives the same aperture (only if the taps never landed)
        if ((await closed()) < 0.999) {
          console.log(`[ARR-6] ${vp.width}x${vp.height} tap did not close — scrolling instead`);
          await page.screenshot({ path: `${OUT}/_debug-${vp.width}x${vp.height}-${user}-${theme}.png` });
          await page.evaluate(() => (document.querySelector('[data-scroll]') as HTMLElement).scrollTo({ top: 420 }));
        }
        await expect.poll(closed, { timeout: 8000 }).toBeGreaterThan(0.999); // closed = card + badges fully in
        await page.waitForTimeout(700);
        const g = await closedGeometry(page);
        const name = `${vp.width}x${vp.height}-${user}-${theme}`;
        await page.screenshot({ path: `${OUT}/${name}.png` });
        console.log(`[ARR-6] ${name} ${JSON.stringify(g)}`);
        expect(g.avatarBottom, `${name}: avatar overlaps the mark`).toBeLessThanOrEqual(g.markTop);
        expect(g.markBottom, `${name}: mark overlaps the card text`).toBeLessThanOrEqual(g.cardBottom);
        expect(g.badgesBottom, `${name}: badges too close to the safe-area bottom`).toBeLessThanOrEqual(g.vh - g.safeBottom - 24 + 0.5);
        expect(g.cardBottom, `${name}: card overlaps the badges`).toBeLessThanOrEqual(g.badgesTop);
        expect(Math.abs(g.markWidth - (desktop ? 260 : 200)), `${name}: mark width`).toBeLessThan(6);
        await ctx.close();
      }
    });
  }
}
