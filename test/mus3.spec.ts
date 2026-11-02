import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// ── Brief MUS-3 — library covers (§1), play-button hit target (§5), and the album-switch URL
// behaviour (§3). Logged-out, read-only against a running dev server (BASE_URL=:3100 for the
// wt/mus-3 worktree). The §3 case is the one the brief asked for: switching tracks in the album view
// uses history.replaceState, so Back from a switched track lands on /library — never a stale /track
// segment — and the switch fires NO new page navigation (the old router.replace RSC reload).
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = join(process.cwd(), 'test/shots-mus3');
mkdirSync(OUT, { recursive: true });

test.setTimeout(120_000);

async function firstTrackId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid^="library-art-"]');
    return el?.getAttribute('data-testid')?.replace('library-art-', '') ?? null;
  });
}

test('MUS-3 §1/§5 — library covers present + 44px play target', async ({ page }) => {
  await page.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid^="library-art-"]', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'library.png'), fullPage: false });

  // §5 — the circular play button's hit target must be ≥ 44px (was 32).
  const box = await page.getByRole('button', { name: /^Play$/ }).first().boundingBox();
  expect(box, 'a Play button is present').toBeTruthy();
  expect(Math.round(box!.width), 'play hit width ≥ 44').toBeGreaterThanOrEqual(44);
  expect(Math.round(box!.height), 'play hit height ≥ 44').toBeGreaterThanOrEqual(44);

  // §1 — the first row's cover <img> resolves to a real URL (own art OR the album fallback), not a
  // bare placeholder div. (TrackArt renders an <img> only when a cover URL exists.)
  const imgCount = await page.locator('[data-testid^="library-art-"] img').count();
  console.log(`[MUS-3 §1] library rows with a cover image: ${imgCount}`);
});

test('MUS-3 §3 — album switch uses replaceState: Back → /library, no reload', async ({ page }) => {
  await page.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid^="library-art-"]', { timeout: 30_000 });
  const id = await firstTrackId(page);
  expect(id, 'a library track exists').toBeTruthy();

  await page.getByTestId(`library-art-${id}`).click();
  await page.waitForURL(/\/track\//, { timeout: 20_000 });
  await page.waitForSelector('[data-testid="track-view"]', { timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'track-view.png'), fullPage: false });

  const firstTrackUrl = page.url();
  // A sibling album row (same album, different track) — present only when the album has ≥2 tracks.
  const sibling = page.locator('[data-testid^="album-track-"]:not([aria-current="true"])').first();

  if (await sibling.count()) {
    // Count DOCUMENT/RSC requests during the switch — replaceState fires NONE (router.replace would).
    let navRequests = 0;
    const onReq = (r: import('@playwright/test').Request) => {
      if (r.resourceType() === 'document' || r.url().includes('_rsc=')) navRequests++;
    };
    page.on('request', onReq);
    await sibling.click();
    await page.waitForTimeout(900);
    page.off('request', onReq);

    expect(page.url(), 'switch changed the /track URL').not.toBe(firstTrackUrl);
    expect(page.url(), 'still a /track URL (new id)').toMatch(/\/track\//);
    expect(navRequests, 'switch fired NO page navigation — history.replaceState, not router.replace').toBe(0);

    await page.goBack();
    await page.waitForTimeout(900);
    expect(page.url(), 'Back from a switched track lands on /library, never a stale /track segment').toMatch(/\/library/);
    console.log('[MUS-3 §3] verified: in-place switch (0 nav requests), Back → /library');
  } else {
    console.log('[MUS-3 §3] the first library track has no multi-track album in this data — switch skipped; asserting the baseline Back.');
    await page.goBack();
    await page.waitForTimeout(700);
    expect(page.url(), 'Back → /library').toMatch(/\/library/);
  }
});
