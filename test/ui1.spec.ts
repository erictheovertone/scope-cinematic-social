import { test, expect, Page } from '@playwright/test';
import { mkdirSync } from 'fs';

// UI-1 — feed-lightbox cleanup (#1 counter, #2 arrow shadows), hit-target sweep (#5), the
// first-tap-eater check, and the rotate-to-theatre [rotate] trace (#3). Runs against the
// authed feed (AUTH_STATE + BASE_URL from env; the harness session). Mobile project only —
// the lightbox + rotate path are mobile (desktop returns DesktopHome and gates the hook off).

const SHOTS = 'test/shots-ui1';
mkdirSync(SHOTS, { recursive: true });

// Everything is scoped to the PostModal root so background feed cards (same heart/comment
// SVGs) never shadow the lightbox's own controls.
const MODAL = '[data-testid="post-modal"]';
const LIKE = `${MODAL} button:has(path[d^="M20.84 4.61"])`;
const COMMENT = `${MODAL} button:has(path[d^="M21 15a2"])`;
const PREV = `${MODAL} [aria-label="Previous"]`;
const NEXT = `${MODAL} [aria-label="Next"]`;

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(150);
}

// Open the first feed post into the lightbox (PostModal) by clicking its media.
async function openFeedLightbox(page: Page) {
  await page.waitForSelector('.feed-card', { timeout: 30_000 });
  const imgs = await page.locator('.feed-card img').all();
  let clicked = false;
  for (const img of imgs) {
    const b = await img.boundingBox();
    if (b && b.width > 150) { await img.click({ force: true }); clicked = true; break; }
  }
  if (!clicked) {
    const card = page.locator('.feed-card').first();
    const b = await card.boundingBox();
    if (b) await page.mouse.click(b.x + b.width / 2, b.y + Math.min(b.height / 2, 180));
  }
  // PostModal is up once its LIKE control (always present + visible) renders.
  await page.waitForSelector(LIKE, { state: 'visible', timeout: 15_000 });
  // Land on a middle post so BOTH arrows are visible (the first post hides Previous).
  const next = page.locator(NEXT).first();
  if (await next.isVisible().catch(() => false)) { await next.click(); await page.waitForTimeout(300); }
  await page.waitForTimeout(200);
}

async function box(page: Page, sel: string) {
  const el = page.locator(sel).first();
  if (await el.count() === 0) return null;
  return el.boundingBox();
}

test.describe('UI-1 feed-lightbox', () => {
  test('#1/#2/#5 — counter gone, no arrow shadow, 44 targets + both-theme shots', async ({ page }) => {
    await page.goto('/');
    await openFeedLightbox(page);

    // ── #1 — the "{index} / {total}" counter is removed from the program-nav row. ──
    const navRowText = await page.locator(PREV).first().evaluate((btn) => (btn.parentElement?.textContent || '').trim());
    expect(navRowText, `nav row should carry no "N / M" counter (got: "${navRowText}")`).not.toMatch(/\d+\s*\/\s*\d+/);

    // ── #2 — the arrow glyphs carry no drop-shadow filter. ──
    for (const sel of [PREV, NEXT]) {
      if (await page.locator(sel).count() === 0) continue;
      const filter = await page.locator(`${sel} svg`).first().evaluate((s) => getComputedStyle(s).filter);
      expect(filter, `${sel} arrow should have filter:none (#2)`).toBe('none');
    }

    // ── #5 — hit-target sweep: the row that was ~19px tall. ──
    const measured: Record<string, { w: number; h: number } | null> = {};
    for (const [name, sel] of [['prev', PREV], ['next', NEXT], ['like', LIKE], ['comment', COMMENT]] as const) {
      const b = await box(page, sel);
      measured[name] = b ? { w: Math.round(b.width), h: Math.round(b.height) } : null;
      // eslint-disable-next-line no-console
      console.log(`[sweep] ${name.padEnd(8)} ${b ? `${Math.round(b.width)}×${Math.round(b.height)}` : 'absent'}`);
    }
    if (measured.prev) expect(measured.prev.h, 'prev arrow ≥44 tall').toBeGreaterThanOrEqual(44);
    if (measured.next) expect(measured.next.h, 'next arrow ≥44 tall').toBeGreaterThanOrEqual(44);
    if (measured.like) expect(measured.like.h, 'like ≥44 tall (#5)').toBeGreaterThanOrEqual(44);
    if (measured.comment) expect(measured.comment.h, 'comment ≥44 tall (#5)').toBeGreaterThanOrEqual(44);

    // ── both-theme lightbox shots (#1/#2 evidence) ──
    await setTheme(page, 'dark');
    await page.screenshot({ path: `${SHOTS}/lightbox-dark.png` });
    await setTheme(page, 'light');
    await page.screenshot({ path: `${SHOTS}/lightbox-light.png` });

    // Tight crop of the nav row (shadow + counter evidence), both themes.
    const pbox = await page.locator(PREV).first().evaluate((b) => {
      const r = (b.parentElement as HTMLElement).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      await page.screenshot({ path: `${SHOTS}/navrow-${theme}.png`, clip: { x: Math.max(0, pbox.x - 6), y: Math.max(0, pbox.y - 6), width: Math.min(375, pbox.width + 12), height: pbox.height + 12 } });
    }
  });

  test('first-tap-eater — the lightbox controls are the topmost element at their centre', async ({ page }) => {
    await page.goto('/');
    await openFeedLightbox(page);
    for (const [name, sel] of [['like', LIKE], ['comment', COMMENT], ['prev', PREV]] as const) {
      if (await page.locator(sel).count() === 0) continue;
      const b = (await box(page, sel))!;
      const info = await page.evaluate(({ cx, cy }) => {
        const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
        let n: HTMLElement | null = el; let btn: HTMLElement | null = null;
        while (n) { if (n.tagName === 'BUTTON') { btn = n; break; } n = n.parentElement; }
        return { top: (el?.tagName || '?') + (el?.getAttribute?.('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''), reachedButton: !!btn };
      }, { cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
      // eslint-disable-next-line no-console
      console.log(`[tap-eater] ${name.padEnd(8)} topEl=${info.top} reachesButton=${info.reachedButton}`);
      expect(info.reachedButton, `${name}: a button must be the topmost hit (no overlay eating the first tap)`).toBeTruthy();
    }
  });

  test('#3 rotate-to-theatre — live [rotate] trace (settle guard vs portal trap)', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (m) => { const t = m.text(); if (t.includes('[rotate]')) logs.push(t); });

    // ?debug=video gates the [rotate] + TheatreMode MOUNT/UNMOUNT instrumentation.
    await page.goto('/?debug=video');
    await openFeedLightbox(page);
    logs.length = 0; // discard mount-time lines; capture only the rotation sequence

    // Rotate to LANDSCAPE: resize the viewport AND fire the orientation signals the hook listens
    // for. screen.orientation.type is read FIRST by the hook; we do NOT force it — whatever the
    // engine reports is what the trace records (the point of the settle-guard diagnosis).
    await page.setViewportSize({ width: 812, height: 375 });
    await page.evaluate(() => {
      try { window.dispatchEvent(new Event('orientationchange')); } catch {}
      try { (window.matchMedia('(orientation: landscape)') as unknown as EventTarget).dispatchEvent?.(new Event('change')); } catch {}
    });
    await page.waitForTimeout(900); // let the rAF + the 280ms settle re-check run

    const entered = logs.some((l) => l.includes('ENTER fired')) || logs.some((l) => l.includes('TheatreMode MOUNT'));
    const orient = await page.evaluate(() => ({
      screenType: (screen as unknown as { orientation?: { type?: string } }).orientation?.type ?? null,
      mqLandscape: window.matchMedia('(orientation: landscape)').matches,
      innerWH: `${window.innerWidth}x${window.innerHeight}`,
    }));
    // eslint-disable-next-line no-console
    console.log('\n──────── [rotate] TRACE (feed lightbox → landscape) ────────');
    for (const l of logs) console.log('  ' + l);
    console.log(`──────── entered theatre: ${entered} · engine readout: ${JSON.stringify(orient)} ────────\n`);
    await page.screenshot({ path: `${SHOTS}/rotate-landscape.png` });

    expect(logs.length, 'the [rotate] trace must produce lines (instrumentation live)').toBeGreaterThan(0);
  });
});
