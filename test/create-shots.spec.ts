import { test } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Brief C3 §0 — reachable-set screenshots. Drives the authed create flow (photo path)
// media → crop → finishing → EDIT & POST and shoots the edit step at 375 in BOTH themes,
// so the C3-1 off-token black band (and the general edit-step chrome) is captured before
// any fix. NOTE: C3-5/6/7 (autoplay switch, MIRAGE/THUMBNAIL preview, autoplay-on ADD MUSIC)
// are isVideoPost-only; with image fixtures they do not render — those need a video fixture
// (→ Cloudflare Stream) or the device walk. Run:
//   BASE_URL=https://scopeapp.world npx playwright test test/create-shots.spec.ts --project=iphone-webkit

const FIX = (n: string) => join(process.cwd(), 'test/fixtures/create', n);
const OUT = join(process.cwd(), 'test/shots');
mkdirSync(OUT, { recursive: true });

async function reachEdit(page: import('@playwright/test').Page) {
  await page.goto('/create');
  const enter = page.getByRole('button', { name: /^ENTER$/ });
  if (await enter.count()) await enter.first().click({ timeout: 3000 }).catch(() => {});
  await page.locator('input[type="file"]').first().setInputFiles(FIX('landscape-4000x3000-noexif.jpg'));
  await page.getByRole('button', { name: 'Next' }).first().click();
  await page.locator('[aria-label="Confirm"]').first().click({ timeout: 20_000 });  // crop → finishing
  await page.locator('[aria-label="Done"]').first().click({ timeout: 25_000 });      // finishing → edit
  await page.waitForTimeout(800);
}

for (const scheme of ['dark', 'light'] as const) {
  test(`edit-step @375 ${scheme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await reachEdit(page);
    const path = join(OUT, `edit-${scheme}.png`);
    await page.screenshot({ path });
    await testInfo.attach(`edit-${scheme}`, { path, contentType: 'image/png' });
  });
}
