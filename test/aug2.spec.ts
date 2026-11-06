import { test, expect, type Page } from '@playwright/test';

// ── Brief AUG-2 — Augmented checkout parity with Pro ──────────────────────────────────────────────
// Augmented now routes through the SAME hosted create-checkout as Pro: Apple Pay on checkout.stripe.com
// + success_url → /membership/success?plan=augmented_<tier> → CEL-2 → /profile?upgraded=true.
// Needs the authed harness (the Augmented sheet needs a signed-in user). No real payment is made;
// create-checkout + checkout.stripe.com + confirm-stripe are stubbed so the test never hits Stripe.
async function dismissRecap(page: Page) {
  const enter = page.getByRole('button', { name: 'ENTER', exact: true });
  if (await enter.count() && await enter.isVisible().catch(() => false)) { await enter.click(); await page.waitForTimeout(600); }
}

test('AUG-2 §5a — Augmented from /profile navigates to hosted checkout.stripe.com with an augmented plan', async ({ page }) => {
  let reqPlan: string | null = null;
  // Stub create-checkout (main's .env.local has no STRIPE_PRICE_*, so the real route would 500):
  // capture the plan the client sent, return a checkout.stripe.com url like the real hosted route.
  await page.route('**/api/stripe/create-checkout', async (route) => {
    try { reqPlan = JSON.parse(route.request().postData() || '{}').plan; } catch { /* */ }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_aug2_stub#fid' }) });
  });
  // Stub Stripe's hosted page so the navigation resolves without leaving for the real Stripe.
  await page.route('**checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub stripe checkout</body></html>' }));

  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await dismissRecap(page);

  // Open the Augmented sheet (programmatic opener wired in UpsellProvider), then Join.
  await page.evaluate(() => window.dispatchEvent(new Event('scope:open-augmented')));
  await expect(page.getByTestId('augmented-sheet')).toBeVisible({ timeout: 8000 });
  await page.getByTestId('augmented-join').click();

  // The browser lands on checkout.stripe.com, and the plan the client sent was an augmented_* plan
  // (create-checkout's success_url embeds that plan → the evidence script proves success_url carries it).
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 8000 });
  expect(reqPlan, 'client requested an augmented plan').toMatch(/^augmented_/);
});

test('AUG-2 §5b — /membership/success?plan=augmented_* mounts CEL-2 and lands on /profile?upgraded=true', async ({ page }) => {
  // confirm-stripe would need a real paid session; stub it to resolve the augmented tier.
  await page.route('**/api/membership/confirm-stripe', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tier: 'augmented' }) }),
  );
  await page.goto('/membership/success?plan=augmented_annual&session_id=cs_test_fake', { waitUntil: 'domcontentloaded' });

  // The brass Augmented welcome (CEL-2) mounts — the video celebration for the augmented tier, or its
  // static fallback. Driven by ?plan, so it mounts regardless of the confirm result.
  const cel = page.locator('[data-testid="video-celebration"][data-tier="augmented"], [data-testid="augmented-welcome-still"]');
  await expect(cel.first()).toBeVisible({ timeout: 10_000 });

  // When it finishes it routes to the profile with the badge moment.
  await page.waitForURL(/\/profile\?upgraded=true/, { timeout: 20_000 });
});
