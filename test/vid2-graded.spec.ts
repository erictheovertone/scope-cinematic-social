import { test, expect } from '@playwright/test';
// @ts-expect-error — pngjs ships no bundled type declarations
import { PNG } from 'pngjs';

// ── Brief VID-2 §5 — graded playback is real + never black ───────────────────────────────────────
// Runs against the /debug/graded smoke route (a real HLS post through the production GradedVideo with
// a strong look), so it needs NO auth — but it DOES need NEXT_PUBLIC_GRADED_PLAYBACK=1 in the env
// under test (Preview, or a local dev with the flag). The route reports its gfx mode; this asserts:
//   • the flag on → GradedVideo takes the GRADED path (gfx "graded", a GL <canvas> mounts);
//   • the graded canvas is NON-BLACK (the shaders drew a real frame — never a black player, §3);
//   • it stays non-black across ~6s (covers at least one ABR rendition switch on this stream, §a).
// The authed graded-vs-poster-vs-raw pixel comparison (graded canvas ≈ the baked poster, ≠ the raw
// video) runs in the feed/lightbox under the harness session — this is the un-authed regression guard.
//   BASE_URL=http://localhost:3100 npx playwright test test/vid2-graded.spec.ts --project=iphone-webkit
const BASE = process.env.BASE_URL || 'http://localhost:3100';

test('VID-2 §5 — graded path renders a non-black WebGL canvas (never a black player)', async ({ page }) => {
  await page.goto(`${BASE}/debug/graded?debug=video`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /post [0-9a-f-]{8}/.test(document.body.innerText) || /no ready/.test(document.body.innerText), { timeout: 40_000 });

  const flagOn = await page.evaluate(() => /GRADED_PLAYBACK:\s*true/.test(document.body.innerText));
  if (!flagOn) {
    test.skip(true, 'NEXT_PUBLIC_GRADED_PLAYBACK is off in this env — graded path not exercised (set it in Preview).');
    return;
  }

  // The GL canvas must mount and gfx must report "graded".
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('body')).toContainText(/gfx:\s*\d+ graded/, { timeout: 20_000 });

  // Non-black across ~6s (≥ one ABR switch on this stream). Screenshot the canvas, decode, sample a
  // grid of pixels; a graded frame is never uniformly black.
  const nonBlackAt = async (): Promise<number> => {
    const buf = await canvas.screenshot();
    const png = PNG.sync.read(buf);
    let lit = 0, n = 0;
    for (let y = 2; y < png.height; y += Math.max(1, Math.floor(png.height / 8))) {
      for (let x = 2; x < png.width; x += Math.max(1, Math.floor(png.width / 8))) {
        const i = (png.width * y + x) << 2;
        if (png.data[i] + png.data[i + 1] + png.data[i + 2] > 24) lit++;
        n++;
      }
    }
    return lit / Math.max(1, n);
  };

  const first = await nonBlackAt();
  expect(first, 'graded canvas is non-black on first draw').toBeGreaterThan(0.3);
  await page.waitForTimeout(6000); // let ABR switch at least once
  const later = await nonBlackAt();
  expect(later, 'graded canvas stays non-black across a rendition switch').toBeGreaterThan(0.3);
});
