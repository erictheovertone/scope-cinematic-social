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

// ── U2-2 · Welcome — the wordmark is not cut off (375 + 430) ───────────────────────────────
test.describe('U2-2 welcome', () => {
  for (const w of [375, 430]) {
    for (const theme of THEMES) {
      test(`U2-2 welcome wordmark — ${w} ${theme}`, async ({ browser }, info) => {
        const ctx = await browser.newContext({ ...info.project.use, viewport: { width: w, height: w === 430 ? 932 : 812 } });
        await pinTheme(ctx, theme);
        const page = await ctx.newPage();
        await page.goto('/welcome');
        const mark = page.getByText('scope', { exact: true }).first();
        await expect(mark).toHaveCSS('opacity', '1', { timeout: 15_000 });
        await page.waitForTimeout(400);
        // Every ancestor that clips (overflow ≠ visible) must contain the glyphs' ink box.
        const clip = await mark.evaluate((el) => {
          const r = document.createRange(); r.selectNodeContents(el);
          const ink = r.getBoundingClientRect();
          const bad: string[] = [];
          for (let n = el as HTMLElement | null; n; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
              const b = n.getBoundingClientRect();
              if (ink.left < b.left || ink.right > b.right || ink.top < b.top || ink.bottom > b.bottom) bad.push(`${n.tagName}.${n.className} ${JSON.stringify(b)}`);
            }
          }
          return { ink: { l: ink.left, r: ink.right, t: ink.top, b: ink.bottom }, vw: innerWidth, bad };
        });
        // eslint-disable-next-line no-console
        console.log(`[welcome ${w} ${theme}]`, JSON.stringify(clip));
        await page.screenshot({ path: join(OUT, `u2-2-welcome-${w}-${theme}.png`) });
        expect(clip.bad).toEqual([]);
        expect(clip.ink.r).toBeLessThanOrEqual(clip.vw);

        // The real-device cut-off: on its own layer (the fade; iOS keeps it) WebKit crops the
        // wordmark to its box. Shoot the lockup inline, then force the layer — they must match.
        const area = { x: Math.max(0, clip.ink.l - 40), y: clip.ink.t - 40, width: clip.ink.r - clip.ink.l + 80, height: clip.ink.b - clip.ink.t + 70 };
        const inline = await page.screenshot({ clip: area });
        await mark.evaluate((el) => { (el as HTMLElement).style.willChange = 'opacity'; (el as HTMLElement).style.opacity = '0.999'; });
        await page.waitForTimeout(300);
        const layered = await page.screenshot({ clip: area });
        await page.screenshot({ path: join(OUT, `u2-2-welcome-${w}-${theme}-layered.png`), clip: area });
        const sharp = (await import('sharp')).default;
        const [a, b] = await Promise.all([inline, layered].map((buf) => sharp(buf).raw().toBuffer()));
        let diff = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) diff++;
        // eslint-disable-next-line no-console
        console.log(`[welcome ${w} ${theme}] layered-vs-inline differing px: ${diff}`);
        expect(diff, 'wordmark cut off when composited').toBeLessThan(50);
        await ctx.close();
      });
    }
  }
});

// ── U2-5 · ARR-1 — Arrival (public profile behind PUBLIC_PROFILES_ENABLED) ───────────────────
// ARR_FLAG=on|off tells the spec which server it's pointed at. ARR_USER = a real username.
const ARR_USER = process.env.ARR_USER || 'overtone';
const FORBIDDEN = /contact_email|stripe|wallet|privy|paid_member|payment|user_id|"id"|email|founding_member_number|last_seen/i;

test.describe('U2-5 arrival', () => {
  test.skip(!process.env.ARR_FLAG, 'set ARR_FLAG=on|off');

  test('U2-5 flag-off — route + API behave exactly as today (404)', async ({ page, request }, info) => {
    test.skip(process.env.ARR_FLAG !== 'off');
    const api = await request.get(`/api/public-profile/${ARR_USER}`);
    expect(api.status()).toBe(404);
    const res = await page.goto(`/${ARR_USER}`);
    expect(res?.status()).toBe(404);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `u2-5-flag-off-${info.project.name}.png`) });
  });

  test('U2-5 anon-smoke — the API returns ONLY the allowlist', async ({ request }) => {
    test.skip(process.env.ARR_FLAG !== 'on');
    const res = await request.get(`/api/public-profile/${ARR_USER}`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(Object.keys(body).sort()).toEqual(['avatarUrl', 'badges', 'bio', 'decksCount', 'desktopCols', 'displayName', 'frames', 'framesCount', 'layoutId', 'mobileCols', 'username'].sort());
    for (const f of body.frames) expect(Object.keys(f).sort()).toEqual(['aspect', 'image', 'video']);
    for (const b of body.badges) expect(Object.keys(b).sort()).toEqual(['key', 'name']);
    // No forbidden field NAME anywhere in the payload (values are URLs/text; keys are checked).
    const keys: string[] = [];
    JSON.parse(text, (k, v) => { if (k) keys.push(k); return v; });
    expect(keys.filter((k) => FORBIDDEN.test(k))).toEqual([]);
    expect(text).not.toMatch(/0x[a-fA-F0-9]{40}/); // no wallet address
    expect(text).not.toMatch(/did:privy:/);       // no privy id
    expect(text).not.toMatch(/cus_|sub_[A-Za-z0-9]{8}/); // no stripe ids
    // eslint-disable-next-line no-console
    console.log(`[anon-smoke] keys ok · ${body.frames.length} frames · badges=${body.badges.map((b: { name: string }) => b.name).join(',')}`);
  });

  test('U2-5 arrival → closed → theatre', async ({ page }, info) => {
    test.skip(process.env.ARR_FLAG !== 'on');
    const tag = info.project.name;
    const res = await page.goto(`/${ARR_USER}?ref=email`);
    expect(res?.status()).toBe(200);
    // Server-rendered: the header is in the initial HTML.
    expect(await res!.text()).toContain(`${ARR_USER.toLowerCase()}</h1>`);
    await page.locator('img').nth(2).waitFor();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, `u2-5-arrival-${tag}.png`) });
    // Card hidden at rest.
    const card = page.getByText(/is on Scope/i);
    expect(Number(await card.evaluate((el) => getComputedStyle(el.parentElement!).opacity))).toBeLessThan(0.05);
    // Mid-close and closed, driven by real scroll.
    const sc = page.locator('[data-scroll]').first();
    await sc.evaluate((el) => { el.scrollTop = 24 + 130; });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `u2-5-mid-${tag}.png`) });
    await sc.evaluate((el) => { el.scrollTop = 24 + 400; });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `u2-5-closed-${tag}.png`) });
    expect(Number(await card.evaluate((el) => getComputedStyle(el.parentElement!).opacity))).toBeGreaterThan(0.95);
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with email' })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    // Scroll back → opens again.
    await sc.evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(400);
    expect(Number(await card.evaluate((el) => getComputedStyle(el.parentElement!).opacity))).toBeLessThan(0.05);
    // Tap a frame → theatre.
    await page.getByRole('button', { name: 'Open frame 1', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Frame' })).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `u2-5-theatre-${tag}.png`) });
  });
});
