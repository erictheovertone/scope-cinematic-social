import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// ── Brief V1 §3 — EDIT & POST video trace (seam-driven, LOCAL-ONLY) ───────────
// Drives the create flow to the EDIT & POST step on 1080×1920 fixtures at 20s /
// 45s / 90s and records, per step: wall time from pick, JS heap (chromium only),
// and the live resource snapshot (via the ?debug=video dump hook). It does NOT
// publish (upload/Stream need a real account + network — that leg is Eric's on
// the device/preview). The point is the duration-scaling evidence for the steps
// that run entirely client-side: metadata/decode, finishing mount, and the EDIT &
// POST mount (which stands up TWO simultaneous video decodes — the main preview
// and the SnippetSelector audition).
//
//   1) generate fixtures:  test/fixtures/create/make-video-fixtures.sh   (ffmpeg, H.264)
//                     or:  node test/fixtures/create/gen-fixtures-browser.mjs   (no ffmpeg)
//   2) NEXT_PUBLIC_TEST_SEAM=1 npm run build && NEXT_PUBLIC_TEST_SEAM=1 npm run start
//   3) BASE_URL=http://localhost:3000 AUTH_STATE=test/.auth/throwaway.json \
//        npx playwright test test/create-video.spec.ts --project=iphone-webkit

const PUB = join(process.cwd(), 'public/test-fixtures');
const OUT = join(process.cwd(), 'test/shots-v1');
mkdirSync(OUT, { recursive: true });

function fixtureUrl(d: number): string | null {
  for (const ext of ['mp4', 'webm']) {
    if (existsSync(join(PUB, `v-${d}s.${ext}`))) return `/test-fixtures/v-${d}s.${ext}`;
  }
  return null;
}

// usedJSHeapSize is Chromium-only; null elsewhere (webkit).
async function heapMB(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  });
}

for (const d of [20, 45, 90]) {
  test(`EDIT&POST video ${d}s — per-step trace`, async ({ page }, testInfo) => {
    const url = fixtureUrl(d);
    test.skip(!url, `no fixture for ${d}s — run make-video-fixtures.sh or gen-fixtures-browser.mjs`);

    await page.goto('/create?debug=video');
    const enter = page.getByRole('button', { name: /^ENTER$/ });
    if (await enter.count()) await enter.first().click({ timeout: 3000 }).catch(() => {});
    await expect
      .poll(() => page.evaluate(() => typeof (window as unknown as { __scopeInjectMedia?: unknown }).__scopeInjectMedia === 'function'), { timeout: 15_000 })
      .toBeTruthy();

    const t0 = Date.now();
    const at = () => Number(((Date.now() - t0) / 1000).toFixed(2)); // seconds from pick

    await page.evaluate((u) => (window as unknown as { __scopeInjectMedia: (t: string, u: string) => Promise<void> }).__scopeInjectMedia('video', u as string), url);

    await page.getByRole('button', { name: 'Next' }).first().click();
    // CROP tool mounts (its Confirm + AR chips appear once finishCtx resolves).
    await expect(page.getByRole('button', { name: /^Confirm$/i }).first()).toBeVisible({ timeout: 45_000 });
    const tCrop = at(), hCrop = await heapMB(page);

    await page.getByRole('button', { name: /^Confirm$/i }).first().click();
    // FINISHING suite mounts (its fixed-inset container carries the testid).
    await expect(page.locator('[data-testid="finishing-step"]')).toBeVisible({ timeout: 45_000 });
    const tFinish = at(), hFinish = await heapMB(page);

    // FINISHING → DONE, but the suite can fall to its decode-error fallback on a
    // bigger clip (the <video> never reaches onloadeddata → 6s watchdog → retry →
    // "Something went wrong loading your photo"). Record which happened rather than
    // dying with no trace — that outcome IS the duration-scaling evidence.
    const doneBtn = page.getByRole('button', { name: /^done$/i }).first();
    const errFallback = page.getByText(/something went wrong loading/i).first();
    const outcome = await Promise.race([
      doneBtn.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'done').catch(() => 'pending'),
      errFallback.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'finishing-decode-error').catch(() => 'pending'),
    ]);
    let reachedEdit = false;
    if (outcome === 'done') {
      await doneBtn.click();
      reachedEdit = await page.getByText(/edit & post/i).first()
        .waitFor({ state: 'visible', timeout: 25_000 }).then(() => true).catch(() => false);
    }
    const tEdit = at(), hEdit = await heapMB(page);

    // Let the EDIT & POST preview + the SnippetSelector audition (the 2nd WebGL
    // context + 2nd <video> decode) fully stand up — the peak-pressure moment on
    // device (two simultaneous full-res decodes).
    await page.waitForTimeout(3000);
    const hSettle = await heapMB(page);

    type Dump = {
      crumbs: { step: string; elapsed: number; detail?: string }[];
      file: Record<string, string | number>;
      errors: string[];
      res: Record<string, number>;
    };
    const dump = await page.evaluate(() => {
      const f = (window as unknown as { __scopeVdbgDump?: () => unknown }).__scopeVdbgDump;
      return (f ? f() : null) as Dump | null;
    });

    const heaps = [hCrop, hFinish, hEdit, hSettle].filter((x): x is number => x != null);
    const report = {
      duration: d,
      fixture: url,
      outcome,                    // 'done' (reached EDIT & POST) | 'finishing-decode-error' | 'pending'
      reachedEdit,
      file: dump?.file ?? null,
      wallFromPickS: { toCropOpen: tCrop, toFinishing: tFinish, toEditOrFallback: tEdit },
      heapMB: { crop: hCrop, finishing: hFinish, editOrFallback: hEdit, afterSettle: hSettle, peak: heaps.length ? Math.max(...heaps) : null },
      resources: dump?.res ?? null,
      crumbs: dump?.crumbs?.map((c) => `${c.step}+${c.elapsed.toFixed(2)}${c.detail ? `(${c.detail})` : ''}`) ?? [],
      errors: dump?.errors ?? [],
    };
    await testInfo.attach(`v1-trace-${d}s`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    // One grep-friendly line per duration for the §3 table.
    console.log(`[V1§3] ${JSON.stringify(report)}`);

    // Diagnostic brief: the deliverable is the trace, not a pass/fail. We only
    // require the flow genuinely reached the FINISHING suite (so the numbers above
    // describe the real pipeline, not an early bail). Whether DONE / EDIT & POST
    // was reachable is RECORDED in `outcome`, not asserted.
    expect(tFinish, 'never reached the finishing suite').toBeGreaterThan(0);
  });
}
