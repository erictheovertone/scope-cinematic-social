import { test, expect } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Brief C3 §0 — reachable-set screenshots. Drives the authed create photo path
// media → crop → finishing → EDIT & POST via the proven [crop] open/[finish] traces
// (?debug=crop), hides the debug overlay, and shoots the edit step at 375 in BOTH
// themes — the C3-1 off-token band + edit-step chrome. Requires a FRESH, prod-origin
// session (create:login:test); a stale/localhost session leaves finishCtx unresolved
// so the cropper never opens. C3-5/6/7 are isVideoPost-only → need a video fixture.
//   BASE_URL=https://scopeapp.world AUTH_STATE=test/.auth/throwaway.json \
//     npx playwright test test/create-shots.spec.ts --project=iphone-webkit

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
  await page.getByRole('button', { name: 'Next' }).first().click();
  await expect.poll(() => traces.find((t) => t.startsWith('[crop] open')), { timeout: 30_000 }).toBeTruthy();
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  await expect.poll(() => traces.find((t) => t.startsWith('[finish]')), { timeout: 30_000 }).toBeTruthy();
  await page.getByRole('button', { name: /^done$/i }).first().click({ timeout: 20_000 });
  await page.waitForTimeout(1500); // settle on the edit step
  // Hide the ?debug=crop overlay (fixed element whose text starts with "[crop]") for a clean shot.
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach((d) => {
      if (getComputedStyle(d).position === 'fixed' && (d.textContent || '').trimStart().startsWith('[crop]')) {
        (d as HTMLElement).style.display = 'none';
      }
    });
  });
  await page.waitForTimeout(400);
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
