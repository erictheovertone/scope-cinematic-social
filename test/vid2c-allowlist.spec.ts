import { test, expect } from '@playwright/test';
// @ts-expect-error — pngjs ships no bundled type declarations
import { PNG } from 'pngjs';

// ── VID-2c §5(b) — allowlist gating, end to end, as the signed-in viewer (harness = EBERT) ────────
// The SAME spec is run THREE times, once per server env, and told what to expect:
//   GRADED_PLAYBACK_ALLOWLIST unset  EXPECT=off     → crumb "off (allowlist)"
//   GRADED_PLAYBACK_ALLOWLIST=ebert  EXPECT=graded  → crumb "graded"  (+ first frame ≈ baked poster)
//   GRADED_PLAYBACK_ALLOWLIST=*      EXPECT=graded  → crumb "graded"
// Run (per state), with the harness auth state present (test/.auth/throwaway.json, user EBERT):
//   GRADED_PLAYBACK_ALLOWLIST=ebert EXPECT=graded BASE_URL=http://localhost:3100 \
//     npx playwright test test/vid2c-allowlist.spec.ts --project=iphone-webkit
// Uses /debug/graded WITHOUT ?force so the REAL per-viewer allowlist decides. Signed in as EBERT, the
// server resolves DID → users.privy_id → profiles.username and checks it against the env list.
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const EXPECT = (process.env.EXPECT || 'graded') as 'off' | 'graded';

function centerPixel(buf: Buffer): [number, number, number] {
  const png = PNG.sync.read(buf);
  const i = (png.width * (png.height >> 1) + (png.width >> 1)) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

test(`VID-2c — allowlist viewer gating (EXPECT=${EXPECT})`, async ({ page }) => {
  await page.goto(`${BASE}/debug/graded?debug=video`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /post [0-9a-f-]{8}/.test(document.body.innerText) || /no ready/.test(document.body.innerText), { timeout: 40_000 });
  await page.waitForTimeout(6000); // let the flag resolve + the player settle

  if (EXPECT === 'off') {
    await expect(page.locator('body')).toContainText('gfx: off (allowlist)', { timeout: 20_000 });
    expect(await page.locator('canvas').count(), 'no graded GL canvas when not allowlisted').toBe(0);
    return;
  }

  // graded: the crumb reads graded, a GL canvas mounts, and its first painted frame ≈ the baked
  // poster (same shaders bake the poster → the live grade must match it within tolerance).
  await expect(page.locator('body')).toContainText('gfx: graded', { timeout: 20_000 });
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  const [cr, cg, cb] = centerPixel(await canvas.screenshot());
  expect(cr + cg + cb, 'graded canvas is non-black').toBeGreaterThan(24);

  const posterUrl = await page.getAttribute('img[alt], img', 'src').catch(() => null);
  if (posterUrl) {
    const resp = await page.request.get(posterUrl);
    if (resp.ok()) {
      const [pr, pg, pb] = centerPixel(await resp.body());
      const dist = Math.abs(cr - pr) + Math.abs(cg - pg) + Math.abs(cb - pb);
      expect(dist, `graded frame (${cr},${cg},${cb}) ≈ baked poster (${pr},${pg},${pb})`).toBeLessThan(140);
    }
  }
});
