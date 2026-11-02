import { test, expect } from '@playwright/test';

// ── Brief ARR-8 §6 — the stale-build update prompt ──────────────────────────────────────────────
// UpdatePrompt polls /api/version and offers a reload when the live SHA no longer matches the bundle.
// Mocked mismatch → the pill appears; matched → no pill. (Logged-out /welcome is enough: UpdatePrompt
// is mounted app-root in Providers.)
const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('ARR-8 §6 — update prompt', () => {
  test('mismatched /api/version → the "Update available · Reload" pill appears', async ({ page }) => {
    await page.route('**/api/version*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: 'arr8-mock-newer-build' }) }));
    await page.goto(`${BASE}/welcome`, { waitUntil: 'domcontentloaded' });
    const pill = page.getByTestId('update-pill');
    await expect(pill).toBeVisible({ timeout: 12_000 });
    await expect(pill).toHaveText(/Update available/i);
  });

  test('matched /api/version → no pill', async ({ page }) => {
    await page.goto(`${BASE}/welcome`, { waitUntil: 'domcontentloaded' });
    // Echo the EXACT SHA this bundle loaded (exposed on window once UpdatePrompt hydrates).
    await page.waitForFunction(() => !!(window as unknown as { __scopeBuildSha?: string }).__scopeBuildSha, { timeout: 10_000 });
    const loaded = await page.evaluate(() => (window as unknown as { __scopeBuildSha?: string }).__scopeBuildSha);
    expect(loaded, 'bundle SHA should be exposed').toBeTruthy();
    await page.route('**/api/version*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: loaded }) }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('update-pill')).toHaveCount(0);
  });
});
