import { test, expect } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Brief C3 §0 — reachable-set screenshots. Mirrors create-matrix's proven path
// (?debug=crop + [crop] open / [finish] console traces) to drive the authed create
// photo path media → crop → finishing → EDIT & POST, then shoots the edit step at 375
// in BOTH themes — capturing the C3-1 off-token black band + the edit-step chrome.
// C3-5/6/7 (autoplay switch, MIRAGE/THUMBNAIL preview, autoplay-on ADD MUSIC) are
// isVideoPost-only and do not render for an image fixture → device walk / video fixture.
//   BASE_URL=https://scopeapp.world npx playwright test test/create-shots.spec.ts --project=iphone-webkit

const FIX = (n: string) => join(process.cwd(), 'test/fixtures/create', n);
const OUT = join(process.cwd(), 'test/shots');
mkdirSync(OUT, { recursive: true });

async function reachEdit(page: import('@playwright/test').Page) {
  const traces: string[] = [];
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[crop]') || t.startsWith('[finish]')) traces.push(t); });
  await page.goto('/create?debug=crop');
  const enter = page.getByRole('button', { name: /^ENTER$/ });
  if (await enter.count()) await enter.first().click({ timeout: 3000 }).catch(() => {});
  await page.locator('input[type="file"]').first().setInputFiles(FIX('landscape-4000x3000-noexif.jpg'));
  await page.getByRole('button', { name: 'Next' }).first().click();                 // media → crop
  await expect.poll(() => traces.find((t) => t.startsWith('[crop] open')), { timeout: 20_000 }).toBeTruthy();
  await page.getByRole('button', { name: 'Confirm' }).first().click();              // crop → finishing
  await expect.poll(() => traces.find((t) => t.startsWith('[finish]')), { timeout: 20_000 }).toBeTruthy();
  await page.getByRole('button', { name: /^done$/i }).first().click({ timeout: 20_000 }); // finishing → edit
  await page.waitForTimeout(1000);
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
