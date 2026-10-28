import { test, expect } from '@playwright/test';

// ── Brief ARR-4 — anonymous Arrival ───────────────────────────────────────────
// The logged-out public profile. A short profile never scrolls far enough to surface the
// sign-up card on its own, so ANY tap on the first screen (a frame, the Follow button, the
// header, the counts) must reveal it — via the same aperture animation — and a frame tap must
// NOT open a theatre (the first screen is the only unobstructed view for an anonymous visitor).
//
// Anonymous (no Privy session). Needs the flag + allowlist on the server under test:
//   PUBLIC_PROFILES_ENABLED=1 PUBLIC_PROFILES_ALLOWLIST=overtone \
//     BASE_URL=http://localhost:3000 \
//     npx playwright test test/arrival.spec.ts --project=iphone-webkit
const USER = process.env.ARR_USER || 'overtone';

test.use({ storageState: { cookies: [], origins: [] } }); // anonymous — override the project's auth state

test('arrival — anon frame tap reveals the sign-up card within 1.2s, no theatre', async ({ page }) => {
  await page.goto(`/${USER}`, { waitUntil: 'domcontentloaded' });

  // (a) anonymous render: the topbar shows "Log in" and we stayed on the public URL (a live
  // session would have redirected to /profile/<user>). The viewer sees no session of their own.
  await expect(page.getByRole('button', { name: /log in/i }).first()).toBeVisible();
  expect(new URL(page.url()).pathname.toLowerCase()).toBe(`/${USER}`.toLowerCase());

  // A frame is present (the owner's grid is real).
  const frame = page.getByRole('button', { name: /Join Scope to view/i }).first();
  await expect(frame).toBeVisible();

  // (b) tap a frame → the sign-up card becomes visible within 1.2s via the aperture.
  const t0 = Date.now();
  await frame.click();
  await expect
    .poll(
      () => page.evaluate(() => {
        const el = document.querySelector('[data-arrival-card]') as HTMLElement | null;
        return el ? parseFloat(getComputedStyle(el).opacity) : 0;
      }),
      { timeout: 1200, intervals: [50, 100, 100, 150, 150] },
    )
    .toBeGreaterThan(0.9);
  console.log(`[ARR-4] sign-up card visible ${Date.now() - t0}ms after frame tap`);

  // (c) no theatre dialog opened on the frame tap.
  expect(await page.locator('[role="dialog"]').count()).toBe(0);
});
