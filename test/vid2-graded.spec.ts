import { test, expect } from '@playwright/test';
// @ts-expect-error — pngjs ships no bundled type declarations
import { PNG } from 'pngjs';

// ── Brief VID-2 §5 — graded playback is real + never black ───────────────────────────────────────
// Runs against the /debug/graded smoke route with ?force=1 (a real HLS post through the production
// GradedVideo with a strong look, graded forced regardless of the per-viewer allowlist), so it needs
// NO auth and NO env var. Asserts:
//   • force graded → GradedVideo takes the GRADED path (gfx "graded", a GL <canvas> mounts);
//   • the graded canvas is NON-BLACK (the shaders drew a real frame — never a black player, §3);
//   • it stays non-black across ~6s (covers at least one ABR rendition switch on this stream, §a).
// The per-viewer allowlist gating (off/graded) is proven by test/vid2c-allowlist.{unit.ts,spec.ts}.
//   BASE_URL=http://localhost:3100 npx playwright test test/vid2-graded.spec.ts --project=iphone-webkit
const BASE = process.env.BASE_URL || 'http://localhost:3100';

test('VID-2 §5 — graded path renders a non-black WebGL canvas (never a black player)', async ({ page }) => {
  await page.goto(`${BASE}/debug/graded?debug=video&force=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /post [0-9a-f-]{8}/.test(document.body.innerText) || /no ready/.test(document.body.innerText), { timeout: 40_000 });

  // The GL canvas must mount and gfx must report "graded".
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('body')).toContainText(/gfx:\s*graded/, { timeout: 20_000 });

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
