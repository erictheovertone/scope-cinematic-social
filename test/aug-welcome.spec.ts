// ── BRIEF CEL-2 — Augmented welcome animation ────────────────────────────────────────────────────
// TEST ACCOUNT ONLY (global-setup refuses Eric's session before anything runs).
//   1. Checkout success for an AUGMENTED price (confirm-stripe mocked → tier 'augmented'): the
//      <video> plays welcome-to-augmented.mp4 with its poster, and the overlay stays until the
//      film's `ended` event, holds the last frame ~1.2s, then closes.
//   2. The Price wins over the ?plan= hint (plan says Pro, the completed Price says Augmented).
//   3. Pro regression: a Pro price still plays welcome-to-pro and closes off `ended` too.
//   4. Pro → Augmented upgrade that landed outside the app (membership_tier flips): the film plays
//      on the next load. EBERT's membership row is reset afterwards.
//   BASE_URL=http://localhost:3000 AUTH_STATE=test/.auth/throwaway.json npx playwright test test/aug-welcome.spec.ts --workers=1
import { test, expect, type Page } from '@playwright/test';
import { db, me, resetMembership } from './mus-aug-harness';

test.describe.configure({ mode: 'serial' });
test.afterAll(async () => { await resetMembership(); });

const HOLD_MS = 1200;

async function mockConfirm(page: Page, tier: 'pro' | 'augmented') {
  await page.route('**/api/membership/confirm-stripe', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, tier }) }));
}

/** Tap to reveal, then assert the overlay outlives a timer and closes only after `ended` + hold. */
async function playThrough(page: Page, file: string, opts: { poster: boolean }) {
  const cel = page.getByTestId('video-celebration');
  await expect(cel).toHaveAttribute('data-mode', 'gate', { timeout: 20_000 });
  const video = cel.locator('video');
  expect(await video.getAttribute('src')).toMatch(new RegExp(`${file.replace('.', '\\.')}$`));
  if (opts.poster) expect(await video.getAttribute('poster')).toMatch(/welcome-to-augmented-poster\.png$/);

  // Stamp `ended` and the overlay's removal in page time (no Node-side polling skew).
  await page.evaluate(() => {
    const w = window as unknown as { __endedAt?: number; __goneAt?: number };
    document.querySelector('[data-testid="video-celebration"] video')!.addEventListener('ended', () => { w.__endedAt = performance.now(); });
    new MutationObserver(() => {
      if (!w.__goneAt && !document.querySelector('[data-testid="video-celebration"]')) w.__goneAt = performance.now();
    }).observe(document.body, { childList: true, subtree: true });
  });
  await cel.getByTestId('celebration-reveal').click();
  await expect(cel).toHaveAttribute('data-mode', 'playing');
  const duration = await video.evaluate(async (v: HTMLVideoElement) => {
    if (!Number.isFinite(v.duration) || !v.duration) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
    return v.duration;
  });

  // Still up just before the film ends — whatever its length (no fixed-duration dismissal).
  await page.waitForFunction((d) => {
    const v = document.querySelector('[data-testid="video-celebration"] video') as HTMLVideoElement | null;
    return !v || v.currentTime >= d - 0.5;
  }, duration, { timeout: 30_000 });
  await expect(cel).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __endedAt?: number }).__endedAt)).toBeUndefined();

  // `ended` → held on the last frame → closed after the hold.
  await page.waitForFunction(() => (window as unknown as { __endedAt?: number }).__endedAt !== undefined, null, { timeout: 15_000 });
  await expect(cel).toHaveAttribute('data-mode', 'held');
  await page.waitForFunction(() => (window as unknown as { __goneAt?: number }).__goneAt !== undefined, null, { timeout: 10_000 });
  const { endedAt, goneAt } = await page.evaluate(() => { const w = window as unknown as { __endedAt: number; __goneAt: number }; return { endedAt: w.__endedAt, goneAt: w.__goneAt }; });
  const hold = goneAt - endedAt;
  console.log(`[cel-2] ${file}: duration ${duration.toFixed(2)}s · held ${Math.round(hold)}ms after ended`);
  expect(hold).toBeGreaterThanOrEqual(HOLD_MS - 50);
  expect(hold).toBeLessThan(HOLD_MS + 1500);
  return duration;
}

test('CEL-2 · Augmented price → welcome-to-augmented.mp4 + poster, stays until ended', async ({ page }) => {
  await mockConfirm(page, 'augmented');
  await page.goto('/membership/success?session_id=cs_test_cel2&plan=augmented_annual');
  const d = await playThrough(page, 'welcome-to-augmented.mp4', { poster: true });
  expect(d).toBeGreaterThan(5.5); // the 6s film, not Pro's 5s
  await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
});

test('CEL-2 · the completed Price wins over the ?plan= hint', async ({ page }) => {
  await mockConfirm(page, 'augmented');
  await page.goto('/membership/success?session_id=cs_test_cel2b&plan=monthly_stripe');
  const cel = page.getByTestId('video-celebration');
  await expect(cel).toHaveAttribute('data-tier', 'augmented', { timeout: 20_000 });
  expect(await cel.locator('video').getAttribute('src')).toMatch(/welcome-to-augmented\.mp4$/);
});

test('CEL-2 · Pro price unchanged — welcome-to-pro, closes off ended', async ({ page }) => {
  await mockConfirm(page, 'pro');
  await page.goto('/membership/success?session_id=cs_test_cel2c&plan=monthly_stripe');
  await expect(page.getByTestId('video-celebration')).toHaveAttribute('data-tier', 'pro', { timeout: 20_000 });
  expect(await page.getByTestId('video-celebration').locator('video').getAttribute('poster')).toBeNull();
  await playThrough(page, 'welcome-to-pro-new-ani.mp4', { poster: false });
});

test('CEL-2 · Pro member upgraded to Augmented elsewhere → the film plays on next load', async ({ page }) => {
  const m = await me();
  const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
  // Last session saw Pro …
  await page.addInitScript(([k]) => { try { if (!sessionStorage.getItem('cel2-seeded')) { localStorage.setItem(k, 'pro'); sessionStorage.setItem('cel2-seeded', '1'); } } catch { /* noop */ } }, [`scope:seen-tier:${m.did}`]);
  // … and the webhook has since written Augmented.
  await db.from('profiles').update({ is_paid_member: true, paid_member_until: until, membership_tier: 'augmented' }).eq('user_id', m.userId);
  try {
    await page.goto('/library');
    const cel = page.getByTestId('video-celebration');
    await expect(cel).toHaveAttribute('data-tier', 'augmented', { timeout: 30_000 });
    expect(await cel.locator('video').getAttribute('src')).toMatch(/welcome-to-augmented\.mp4$/);
    // Seen now — a reload doesn't replay it.
    expect(await page.evaluate((k) => localStorage.getItem(k), `scope:seen-tier:${m.did}`)).toBe('augmented');
    await page.reload();
    await page.waitForTimeout(4000);
    await expect(page.getByTestId('video-celebration')).toHaveCount(0);
  } finally {
    await resetMembership();
  }
});
