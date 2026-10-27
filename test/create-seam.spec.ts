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

// ── CEL-1 — Coin Created sheet (variant A "Stamp"). The __scopeFakeCoinCreated seam fakes a
//    CONFIRMED receipt (no ETH, no crop, no auth) so the app-root <CoinCreatedSheet/> opens. Rows
//    cel-photo + cel-video, captured at the motion stamps (0.3 / 1.2 / 2.0 / 3.0s) in dark+light.
//    The project supplies the viewport (iphone-webkit = mobile 375, desktop-chromium = 1440), so
//    running both projects yields the mobile+desktop halves of the 16-frame contact sheet.
const CEL_OUT = join(OUT, 'cel');
mkdirSync(CEL_OUT, { recursive: true });
const CEL_VARIANTS = ['cel-photo', 'cel-video'] as const;
const CEL_STAMPS = [300, 1200, 2000, 3000];

async function openSeamHost(page: Page) {
  await page.goto('/create'); // app-root <CoinCreatedSheet/> mounts here and installs the seam
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { __scopeFakeCoinCreated?: unknown }).__scopeFakeCoinCreated === 'function'), { timeout: 15_000 })
    .toBeTruthy();
}

for (const variant of CEL_VARIANTS) {
  for (const scheme of ['dark', 'light'] as const) {
    test(`${variant} @${scheme}`, async ({ page }, testInfo) => {
      // The app flips theme via data-theme (localStorage 'scope.theme'), NOT prefers-color-scheme,
      // so set BOTH — the initScript lands before the NO_FOUC pre-paint stamp in layout.tsx.
      await page.addInitScript((t) => { try { localStorage.setItem('scope.theme', t); } catch { /* noop */ } }, scheme);
      await page.emulateMedia({ colorScheme: scheme });
      await openSeamHost(page);

      const t0 = Date.now();
      await page.evaluate((v) => (window as unknown as { __scopeFakeCoinCreated: (v: string) => void }).__scopeFakeCoinCreated(v), variant);
      const sheet = page.locator('[role="dialog"][aria-label="Coin created"]');
      await expect(sheet).toBeVisible({ timeout: 5_000 });

      // Evidence frames at the motion stamps (wall-clock from fire — approximate but sufficient).
      for (const ms of CEL_STAMPS) {
        const wait = ms - (Date.now() - t0);
        if (wait > 0) await page.waitForTimeout(wait);
        const p = join(CEL_OUT, `${variant}-${scheme}-${testInfo.project.name}-${ms}ms.png`);
        await page.screenshot({ path: p });
        await testInfo.attach(`${variant}-${scheme}-${ms}ms`, { path: p, contentType: 'image/png' });
      }

      // Settled-state content assertions (theme-tokenised → correct in both schemes).
      await expect(sheet.getByText(/^coin created$/i).first()).toBeVisible();
      await expect(sheet.getByText(/base · confirmed/i)).toBeVisible();
      await expect(sheet.getByText(/^\$[A-Z0-9]{3,6}$/)).toBeVisible();        // $SYMBOL
      await expect(sheet.getByText(/receipt/i)).toBeVisible();                  // ledger
      await expect(sheet.getByRole('button', { name: /view post/i })).toBeVisible();
      await expect(sheet.getByRole('button', { name: /^done$/i })).toBeVisible();
      // The actual minted media is present (img for photo, video el for video).
      await expect(sheet.locator(variant === 'cel-video' ? 'video' : 'img').first()).toBeVisible({ timeout: 5_000 });
    });
  }
}

// Gate b — reduced-motion: the sheet lands in its FINAL state (single .2s fade), no staged motion.
test('cel reduced-motion final state', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await openSeamHost(page);
  await page.evaluate(() => (window as unknown as { __scopeFakeCoinCreated: (v: string) => void }).__scopeFakeCoinCreated('cel-photo'));
  const sheet = page.locator('[role="dialog"][aria-label="Coin created"]');
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(400);
  // Everything is at full opacity immediately (no 2.7s CTA wait): CTAs already visible.
  await expect(sheet.getByRole('button', { name: /view post/i })).toBeVisible();
  const p = join(CEL_OUT, `reduced-motion-${testInfo.project.name}.png`);
  await page.screenshot({ path: p });
  await testInfo.attach('cel-reduced-motion', { path: p, contentType: 'image/png' });
});

// Gate c — the 3s motion is compositor-only (transform/opacity/stroke-dashoffset). Assert NO main-
// thread long task > 50ms during the sequence. PerformanceObserver 'longtask' is Chromium-only.
test('cel motion — no long task > 50ms over the 3s sequence', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'longtask observer is Chromium-only');
  // Measure the SHEET in isolation on a light, settled route — NOT /create, whose heavy
  // CreatePostFlow mount creates its own startup long tasks that would confound the celebration.
  await page.goto('/welcome');
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { __scopeFakeCoinCreated?: unknown }).__scopeFakeCoinCreated === 'function'), { timeout: 15_000 })
    .toBeTruthy();
  await page.waitForTimeout(1500); // let the route settle so only the sheet's work is in-window
  await page.evaluate(() => {
    (window as unknown as { __lt: number[] }).__lt = [];
    const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) (window as unknown as { __lt: number[] }).__lt.push(e.duration); });
    po.observe({ entryTypes: ['longtask'] });
  });
  await page.evaluate(() => (window as unknown as { __scopeFakeCoinCreated: (v: string) => void }).__scopeFakeCoinCreated('cel-video'));
  await page.waitForTimeout(3100);
  const over = await page.evaluate(() => ((window as unknown as { __lt: number[] }).__lt || []).filter((d) => d > 50).map((d) => Math.round(d)));
  expect(over, `long tasks > 50ms during the 3s celebration: [${over.join(', ')}]`).toHaveLength(0);
});

// CEL-1b §2 — REAL sequence (store set → rAF teardown → nav), fired from INSIDE the flow via
// __scopeFlowReceipt on /create. The scrim must be up within ~one frame of the receipt and STAY
// up while the route changes beneath it to '/' (handleClose). No bare frame of the route.
test('cel real sequence — scrim covers receipt → teardown → nav @375', async ({ page }, testInfo) => {
  await page.goto('/create');
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { __scopeFlowReceipt?: unknown }).__scopeFlowReceipt === 'function'), { timeout: 15_000 })
    .toBeTruthy();
  await page.evaluate(() => (window as unknown as { __scopeFlowReceipt: (v: string) => void }).__scopeFlowReceipt('cel-photo'));
  const sheet = page.locator('[role="dialog"][aria-label="Coin created"]');
  await expect(sheet).toBeVisible({ timeout: 300 }); // scrim up ~within a frame of the receipt

  const stamps = [0, 100, 300];
  let prev = 0;
  for (const ms of stamps) {
    if (ms - prev > 0) await page.waitForTimeout(ms - prev);
    prev = ms;
    await expect(sheet, `scrim must stay up at ${ms}ms (no bare route frame)`).toBeVisible();
    const p = join(CEL_OUT, `realseq-${ms}ms-${testInfo.project.name}.png`);
    await page.screenshot({ path: p });
    await testInfo.attach(`realseq-${ms}ms`, { path: p, contentType: 'image/png' });
  }
  // the teardown nav ran beneath the sheet (handleClose → '/', which the logged-out seam session
  // may redirect onward): the route left /create while the scrim stayed up the whole time.
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 2_000 }).not.toBe('/create');
  await expect(sheet).toBeVisible();
});

// CEL-1b §1 — "View post" deep-links to the POST: router.push('/profile?post=<id>'). (The authed
// LANDING screenshot showing that post needs the §3 login — the post must exist in the profile.)
test('cel View post deep-links to the post id', async ({ page }) => {
  await openSeamHost(page);
  await page.evaluate(() => (window as unknown as { __scopeFakeCoinCreated: (v: string) => void }).__scopeFakeCoinCreated('cel-photo'));
  const sheet = page.locator('[role="dialog"][aria-label="Coin created"]');
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await sheet.getByRole('button', { name: /view post/i }).click();
  await expect.poll(() => page.url(), { timeout: 5_000 }).toMatch(/\/profile\?post=seam-post/);
});

// CEL-1b §3 — gate c RE-MEASURED over the REAL sequence (receipt → teardown → nav → rise → 3s).
// Logs long tasks with attribution. The SHEET's own work is proven < 50ms by the isolated
// /welcome gate above; here teardown/home-mount cost is EXPECTED and reported (P4, not a blocker).
test('cel real-sequence perf — long tasks attributed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'longtask observer is Chromium-only');
  await page.goto('/create');
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { __scopeFlowReceipt?: unknown }).__scopeFlowReceipt === 'function'), { timeout: 15_000 })
    .toBeTruthy();
  await page.waitForTimeout(1500); // settle /create so pre-receipt startup isn't in-window
  await page.evaluate(() => {
    (window as unknown as { __lt: { d: number; t: number }[]; __t0: number }).__lt = [];
    (window as unknown as { __t0: number }).__t0 = performance.now();
    const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) (window as unknown as { __lt: { d: number; t: number }[]; __t0: number }).__lt.push({ d: Math.round(e.duration), t: Math.round(e.startTime - (window as unknown as { __t0: number }).__t0) }); });
    po.observe({ entryTypes: ['longtask'] });
  });
  await page.evaluate(() => (window as unknown as { __scopeFlowReceipt: (v: string) => void }).__scopeFlowReceipt('cel-photo'));
  await page.waitForTimeout(3200);
  const lt = await page.evaluate(() => (window as unknown as { __lt: { d: number; t: number }[] }).__lt || []);
  // eslint-disable-next-line no-console
  console.log(`REAL-SEQUENCE long tasks (ms@offset): ${lt.map((x) => `${x.d}@${x.t}`).join(', ') || 'none'}`);
  // Sanity only — teardown/home-mount cost is allowed and reported; nothing pathological.
  const huge = lt.filter((x) => x.d > 500).map((x) => x.d);
  expect(huge, `pathological long task(s) > 500ms: [${huge.join(', ')}]`).toHaveLength(0);
});

// Gate d — BOTH mint paths funnel through the single onCoinConfirmed store (anti-fork). The seam
// proves the store→sheet contract both producers rely on; the producers are unit-covered by the
// call-site rewrite (create-post flow handleDoMint + existing-post CreateCoinSheet.run).

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
