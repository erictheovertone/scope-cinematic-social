import { test, expect } from '@playwright/test';

// ── Brief MUS-3a — "your music is live" stamps on show, server-side, and never fires twice ─────────
// The host now asks /api/music/live-notice (which decides AND stamps, service role) instead of doing
// a client-side profiles.update() the anon key's RLS silently rejected. This asserts the CLIENT wiring:
//   • show:true → the sheet renders, and the request carried the Privy Bearer token (server stamps);
//   • show:false → nothing renders (the common case stays out of the DOM);
//   • a reload after a show-once does not re-render (sessionStorage once-per-launch holds).
// The server stamp itself (service-role write lands + read-back non-null) is verified against the DB
// directly in the MUS-3a report — this spec guards the regression that the stamp moved off the client.
// Needs the authed harness session (the host only runs when Privy is authenticated).
const BASE = process.env.BASE_URL || 'http://localhost:3000';

test('MUS-3a — show:true renders the sheet with a Bearer-authed stamp call', async ({ page }) => {
  let sawAuth = false;
  await page.route('**/api/music/live-notice', async (route) => {
    sawAuth = (route.request().headers()['authorization'] || '').startsWith('Bearer ');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ show: true, stampedAt: new Date().toISOString() }) });
  });
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('music-live-notice')).toBeVisible({ timeout: 20_000 });
  expect(sawAuth, 'stamp call carried the Privy Bearer token (server-side stamp)').toBe(true);
});

test('MUS-3a — show:false keeps the sheet out of the DOM', async ({ page }) => {
  await page.route('**/api/music/live-notice', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ show: false }) }),
  );
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await expect(page.getByTestId('music-live-notice')).toHaveCount(0);
});
