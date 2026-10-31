import { test, expect, type Page } from '@playwright/test';
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

// ── Brief LT-1 — computed-contrast gate ───────────────────────────────────────
// The regression is theme-invariant black used as a surface: in light mode the ink flips to
// off-black but the background stays black → ~1:1 contrast (unreadable). We assert the REAL
// rendered colours, never a class name: composite each surface's background down the ancestor
// stack (honouring alpha), composite the text colour over it, and take the WCAG ratio. A broken
// black-on-black surface lands ~1.0; a correct one (ivory↔ink either way) lands high. Threshold 3.
const READABLE = 3;

/** Composited background luminance (0..1) at a viewport point — walks html→target summing alpha. */
const bgLumAt = (page: Page, x: number, y: number) => page.evaluate(({ x, y }) => {
  const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/i); if (!m) return null; const p = m[1].split(',').map((s) => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const el = document.elementFromPoint(x, y); if (!el) return null;
  const stack: Element[] = []; for (let c: Element | null = el; c; c = c.parentElement) stack.push(c);
  let out = { r: 255, g: 255, b: 255 };
  for (let i = stack.length - 1; i >= 0; i--) { const bg = parse(getComputedStyle(stack[i]).backgroundColor); if (bg && bg.a > 0) { const a = bg.a; out = { r: bg.r * a + out.r * (1 - a), g: bg.g * a + out.g * (1 - a), b: bg.b * a + out.b * (1 - a) }; } }
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(out.r) + 0.7152 * f(out.g) + 0.0722 * f(out.b);
}, { x, y });

/** WCAG contrast of a named on-screen text element against its composited background. null = not found. */
const contrastOf = (page: Page, re: RegExp) => page.evaluate(({ source, flags }) => {
  const rx = new RegExp(source, flags);
  const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/i); if (!m) return null; const p = m[1].split(',').map((s) => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const el = [...document.querySelectorAll('p,span,button,h1,h2,div')].find((e) => {
    if (!rx.test((e.textContent || '').replace(/\s+/g, ' ').trim())) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
  });
  if (!el) return null;
  const bgStack: Element[] = []; for (let c: Element | null = el.parentElement; c; c = c.parentElement) bgStack.push(c);
  let bg = { r: 255, g: 255, b: 255 };
  for (let i = bgStack.length - 1; i >= 0; i--) { const b = parse(getComputedStyle(bgStack[i]).backgroundColor); if (b && b.a > 0) { const a = b.a; bg = { r: b.r * a + bg.r * (1 - a), g: b.g * a + bg.g * (1 - a), b: b.b * a + bg.b * (1 - a) }; } }
  const fr = parse(getComputedStyle(el).color) || { r: 0, g: 0, b: 0, a: 1 }; const a = fr.a;
  const fg = { r: fr.r * a + bg.r * (1 - a), g: fr.g * a + bg.g * (1 - a), b: fr.b * a + bg.b * (1 - a) };
  const lum = (c: { r: number; g: number; b: number }) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const L1 = lum(fg), L2 = lum(bg); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}, { source: re.source, flags: re.flags });

for (const theme of THEMES) {
  test.describe(`LT-1 contrast — ${theme}`, () => {
    const expectFlip = (lum: number | null, where: string) => {
      if (lum == null) throw new Error(`${where}: no background sampled`);
      // The canvas must follow the theme: ivory ground in light (bright), near-black in dark.
      if (theme === 'light') expect(lum, `${where} bg must be the ivory canvas in light`).toBeGreaterThan(0.4);
      else expect(lum, `${where} bg must be the dark canvas in dark`).toBeLessThan(0.12);
    };
    const expectReadable = async (page: Page, re: RegExp, where: string) => {
      const c = await contrastOf(page, re);
      if (c == null) { console.warn(`[LT-1] ${where}: "${re}" not on screen — skipped text-contrast (bg-flip still asserted)`); return; }
      expect(c, `${where} text contrast`).toBeGreaterThan(READABLE);
    };
    test(`manage membership · profile · bio sheet · collect · lightbox — ${theme}`, async ({ page }, info) => {
      const shot = (n: string) => join(OUT, `lt1-${n}-${theme}-${info.project.name}.png`);

      // ── Manage Membership (the named black-background page) ──
      await boot(page, theme);
      await page.goto('/membership/manage', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      expectFlip(await bgLumAt(page, 20, 300), 'manage-membership');
      await expectReadable(page, /^MANAGE MEMBERSHIP$/, 'manage-membership title');
      // Title must not be clipped (truncation fix).
      const titleClipped = await page.evaluate(() => {
        const el = [...document.querySelectorAll('span')].find((e) => (e.textContent || '').trim() === 'MANAGE MEMBERSHIP') as HTMLElement | undefined;
        return el ? el.scrollWidth > el.clientWidth + 1 : null;
      });
      expect(titleClipped, 'MANAGE MEMBERSHIP title must not truncate').not.toBe(true);
      await page.screenshot({ path: shot('manage-membership') });

      // ── Own profile + bio sheet ──
      await page.goto('/profile', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      await pastRecap(page, shot);
      expectFlip(await bgLumAt(page, 20, 400), 'profile');
      await page.screenshot({ path: shot('profile') });
      const bio = page.getByRole('button', { name: 'View profile info' }).first();
      if (await bio.count()) {
        await bio.click();
        await page.waitForTimeout(1200);
        expectFlip(await bgLumAt(page, 200, 500), 'bio-sheet');
        await expectReadable(page, /\w{3,}/, 'bio-sheet body'); // any real word inside the sheet
        await page.screenshot({ path: shot('bio-sheet') });
      } else {
        console.warn('[LT-1] BIO trigger not present on this account — bio sheet skipped');
      }

      // ── Collect sheet + the post lightbox (PostModal), reached off a coined post ──
      if (info.project.name !== 'iphone-webkit') return; // mobile reaches the collect/lightbox path deterministically
      await page.goto(`/profile/${PROFILE}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4500);
      await pastRecap(page, shot);
      await openFirstTile(page);
      const collect = page.getByRole('button', { name: 'COLLECT', exact: true }).first();
      if (await collect.count()) {
        await collect.evaluate((e) => { e.scrollIntoView({ block: 'center' }); });
        await page.waitForTimeout(600);
        await collect.evaluate((e) => (e as HTMLElement).click());
        await page.waitForTimeout(1800);
        expectFlip(await bgLumAt(page, 200, 650), 'collect-sheet');
        await expectReadable(page, /collect|balance|holders|market|buy/i, 'collect-sheet label');
        await page.screenshot({ path: shot('collect') });
        // Tap the sheet's post media → openPostLightbox → the unified lightbox (PostModal).
        const media = await page.evaluate(() => {
          const im = [...document.querySelectorAll('img')].map((i) => ({ i, r: i.getBoundingClientRect() })).find(({ r }) => r.width > 120 && r.height > 80 && r.top > 40);
          if (!im) return null; const r = im.r; return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        if (media) {
          await page.mouse.click(media.x, media.y);
          await page.waitForTimeout(2200);
          expectFlip(await bgLumAt(page, 20, 120), 'lightbox');
          await page.screenshot({ path: shot('lightbox') });
        } else { console.warn('[LT-1] collect-sheet media not found — lightbox skipped'); }
      } else { console.warn('[LT-1] no COLLECT on first tile — collect/lightbox skipped'); }
    });
  });

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
