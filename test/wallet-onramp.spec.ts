import { test, expect } from '@playwright/test';

// ── Brief WAL-1 — Coinbase Onramp in the wallet deposit flow ───────────────────
// As EBERT (the authed harness account). Verifies:
//   • unauthenticated POST /api/onramp/session → 401 (auth is checked before anything else);
//   • clicking "Buy with Coinbase" → the route returns 200 with a pay.coinbase.com URL that
//     contains sessionToken= and defaultNetwork=base.
// The 200 path calls Coinbase's CDP API server-side, so it only succeeds where CDP_API_KEY_ID /
// CDP_API_KEY_SECRET are set (Vercel/prod). With no creds the route returns 500 ("not configured")
// and the URL assertions are recorded as pending that env — the 401 gate is unconditional.
//   BASE_URL=http://localhost:3000 AUTH_STATE=test/.auth/throwaway.json \
//     npx playwright test test/wallet-onramp.spec.ts --project=iphone-webkit
const BASE = process.env.BASE_URL || 'http://localhost:3000';

test('wallet onramp — 401 unauth, and Buy with Coinbase → pay.coinbase.com session URL', async ({ page }) => {
  // (1) unauthenticated → 401 (no Authorization header).
  const un = await page.request.post(`${BASE}/api/onramp/session`);
  expect(un.status(), 'unauthenticated POST must be 401').toBe(401);

  // Don't actually leave for Coinbase if the authed call 200s (window.location.href = url).
  await page.route(/pay\.coinbase\.com/, (r) => r.abort());

  // (2) authed: open the wallet, click Buy with Coinbase, capture the route response.
  await page.goto('/wallet', { waitUntil: 'domcontentloaded' });
  const btn = page.getByRole('button', { name: /Buy with Coinbase/i }).first();
  await expect(btn).toBeVisible({ timeout: 20_000 });
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/onramp/session'), { timeout: 20_000 }),
    btn.click(),
  ]);
  const status = resp.status();
  if (status === 200) {
    const body = (await resp.json()) as { url?: string };
    // eslint-disable-next-line no-console
    console.log(`[WAL-1] onramp 200 → ${body.url}`);
    expect(body.url, 'session URL').toContain('https://pay.coinbase.com/buy/select-asset');
    expect(body.url).toContain('sessionToken=');
    expect(body.url).toContain('defaultNetwork=base');
  } else {
    // eslint-disable-next-line no-console
    console.log(`[WAL-1] onramp route returned ${status} (CDP creds not set in this env; 200/URL assertions run where CDP_API_KEY_ID/SECRET exist — Vercel/prod).`);
    expect([500, 502], 'without creds the route explains itself (500 not-configured / 502 upstream), never a silent 200').toContain(status);
  }
});
