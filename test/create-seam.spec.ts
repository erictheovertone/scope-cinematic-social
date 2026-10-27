import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Brief C3 §3 (seam-driven, LOCAL-ONLY) — the parts of the create gate that can't run against
// prod: the C3-14 coin-created confirmation (a real on-chain mint can't run in automation) and
// the video path (the poster-extraction media-add gate stalls under Playwright). Both use the
// harness seams, which install ONLY under NEXT_PUBLIC_TEST_SEAM=1 — so this spec runs against
// the LOCAL seam build, never prod. No real publish and no real mint → no prod-data side effects.
//
//   (one-time) BASE_URL=http://localhost:3000 AUTH_STATE=test/.auth/throwaway.json npm run create:login:test
//   NEXT_PUBLIC_TEST_SEAM=1 npm run build && NEXT_PUBLIC_TEST_SEAM=1 npm run start   # :3000
//   BASE_URL=http://localhost:3000 AUTH_STATE=test/.auth/throwaway.json \
//     npx playwright test test/create-seam.spec.ts --project=iphone-webkit

const FIX = (n: string) => join(process.cwd(), 'test/fixtures/create', n);
const OUT = join(process.cwd(), 'test/shots');
mkdirSync(OUT, { recursive: true });

async function openCreate(page: Page) {
  await page.goto('/create?debug=crop');
  const enter = page.getByRole('button', { name: /^ENTER$/ });
  if (await enter.count()) await enter.first().click({ timeout: 3000 }).catch(() => {});
}

// ── C3-14 — the shared coin-created confirmation renders (receipt-driven in prod; here the seam
//    drives the exact success surface, since a real mint needs gas + a funded wallet) ──────────
for (const scheme of ['dark', 'light'] as const) {
  test(`C3-14 coin-created confirmation @375 ${scheme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openCreate(page);
    // The CreatePostFlow mounts on /create and installs the seam hook (gated NEXT_PUBLIC_TEST_SEAM).
    await expect
      .poll(() => page.evaluate(() => typeof (window as unknown as { __scopeShowCoinConfirm?: unknown }).__scopeShowCoinConfirm === 'function'), { timeout: 15_000 })
      .toBeTruthy();
    // 'SCOPE' — a valid 3–6 char ticker (normalizeTicker caps at 6, so a longer input is trimmed).
    await page.evaluate(() => (window as unknown as { __scopeShowCoinConfirm: (s: string) => void }).__scopeShowCoinConfirm('SCOPE'));

    const confirm = page.locator('[data-testid="coin-created-confirm"]');
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="coin-created-ticker"]')).toHaveText('SCOPE');
    await expect(confirm.getByText(/coin created/i)).toBeVisible();
    await expect(confirm.getByRole('button', { name: /view your post/i })).toBeVisible();

    // The headline/copy/buttons fade in on `revealed` (650ms) — wait so the self-verify
    // screenshot shows the settled surface, not the first animation frame. Hide the
    // ?debug=crop overlay for a clean shot.
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach((d) => {
        if (getComputedStyle(d).position === 'fixed' && (d.textContent || '').trimStart().startsWith('[crop]')) {
          (d as HTMLElement).style.display = 'none';
        }
      });
    });
    const path = join(OUT, `coin-confirm-${scheme}.png`);
    await page.screenshot({ path });
    await testInfo.attach(`coin-confirm-${scheme}`, { path, contentType: 'image/png' });
  });
}

// ── C3-13/5/6/7 — the VIDEO path, reachable via the media seam → crop → finishing → EDIT ───────
test('video path via seam reaches EDIT with controls intact', async ({ page }) => {
  const traces: string[] = [];
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[crop]') || t.startsWith('[finish]')) traces.push(t); });
  await openCreate(page);
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { __scopeInjectMedia?: unknown }).__scopeInjectMedia === 'function'), { timeout: 15_000 })
    .toBeTruthy();
  // Drop a web-playable video straight into selectedMedia (bypasses poster extraction).
  await page.evaluate(() => (window as unknown as { __scopeInjectMedia: (t: string, u: string) => Promise<void> }).__scopeInjectMedia('video', '/welcome-to-pro-new-ani.mp4'));

  await page.getByRole('button', { name: 'Next' }).first().click();
  await expect.poll(() => traces.find((t) => t.startsWith('[crop] open')), { timeout: 30_000 }).toBeTruthy();
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  await expect.poll(() => traces.find((t) => t.startsWith('[finish]')), { timeout: 30_000 }).toBeTruthy();
  await page.getByRole('button', { name: /^done$/i }).first().click({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  // C3-13 — the video actually renders a playing element in the edit preview.
  await expect(page.locator('video').first()).toBeVisible({ timeout: 10_000 });
  // C3-5 — the AUTOPLAY switch (role=switch) is present and not clipped.
  const sw = page.getByRole('switch').first();
  await expect(sw).toBeVisible({ timeout: 10_000 });
  const box = await sw.boundingBox();
  expect(box, 'autoplay switch has no box (clipped?)').toBeTruthy();
  if (box) expect(box.x + box.width, 'autoplay switch runs off the 375 viewport (C3-5 clip)').toBeLessThanOrEqual(375);
  // C3-6 — the renamed thumbnail control.
  await expect(page.getByText(/thumbnail preview/i).first()).toBeVisible({ timeout: 10_000 });
});

// ── C3-6/C3-7 — EDIT & POST on a VIDEO post: the tail (THUMBNAIL PREVIEW + ADD MUSIC) is
//    reachable (scroller bounds), and ADD MUSIC is visible whether autoplay is ON or OFF.
//    Screenshots 375 dark+light, autoplay ON and OFF. (Needs the localhost authed state for the
//    crop→finishing gate; run: AUTH_STATE=test/.auth/throwaway.json … --project=iphone-webkit)
async function driveVideoToEdit(page: Page) {
  const traces: string[] = [];
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[crop]') || t.startsWith('[finish]')) traces.push(t); });
  await openCreate(page);
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { __scopeInjectMedia?: unknown }).__scopeInjectMedia === 'function'), { timeout: 15_000 })
    .toBeTruthy();
  await page.evaluate(() => (window as unknown as { __scopeInjectMedia: (t: string, u: string) => Promise<void> }).__scopeInjectMedia('video', '/welcome-to-pro-new-ani.mp4'));
  await page.getByRole('button', { name: 'Next' }).first().click();
  await expect.poll(() => traces.find((t) => t.startsWith('[crop] open')), { timeout: 30_000 }).toBeTruthy();
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  await expect.poll(() => traces.find((t) => t.startsWith('[finish]')), { timeout: 30_000 }).toBeTruthy();
  await page.getByRole('button', { name: /^done$/i }).first().click({ timeout: 20_000 });
  await page.waitForTimeout(1500);
}

for (const scheme of ['dark', 'light'] as const) {
  test(`C3-6/C3-7 EDIT&POST video tail reachable @375 ${scheme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await driveVideoToEdit(page);

    const addMusic = page.getByRole('button', { name: /\+?\s*ADD MUSIC/i }).first();
    const autoplaySwitch = page.getByRole('switch').first();

    // Autoplay ON (default): THUMBNAIL PREVIEW present AND ADD MUSIC reachable (scroll to it).
    await expect(autoplaySwitch).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/thumbnail preview/i).first()).toBeVisible({ timeout: 10_000 });
    await addMusic.scrollIntoViewIfNeeded();
    await expect(addMusic, 'ADD MUSIC not reachable with autoplay ON (tail clipped?)').toBeVisible();
    const onBox = await addMusic.boundingBox();
    expect(onBox && onBox.y + onBox.height <= 812, 'ADD MUSIC past the fold after scroll (clip)').toBeTruthy();
    let p = join(OUT, `editpost-video-autoplay-on-${scheme}.png`);
    await page.screenshot({ path: p });
    await testInfo.attach(`editpost-video-autoplay-on-${scheme}`, { path: p, contentType: 'image/png' });

    // Autoplay OFF: THUMBNAIL PREVIEW hides (no autoplay → nowhere to play) but ADD MUSIC STILL
    // visible (Eric's rule — the toggle controls playback, not whether music can be attached).
    await autoplaySwitch.click();
    await expect(autoplaySwitch).toHaveAttribute('aria-checked', 'false');
    await page.waitForTimeout(300);
    await addMusic.scrollIntoViewIfNeeded();
    await expect(addMusic, 'ADD MUSIC vanished when autoplay OFF (it must not be gated)').toBeVisible();
    p = join(OUT, `editpost-video-autoplay-off-${scheme}.png`);
    await page.screenshot({ path: p });
    await testInfo.attach(`editpost-video-autoplay-off-${scheme}`, { path: p, contentType: 'image/png' });
  });
}
