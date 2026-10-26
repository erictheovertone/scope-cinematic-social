import { test, expect, type Locator, type Page } from '@playwright/test';
import { join } from 'path';
import sharp from 'sharp';

// Brief C3-2 — colour-management, measured at THREE readouts (decode → GL preview → bake),
// not one. The P3 swatch and its sRGB twin are driven through import → crop → finishing; the
// green (left) + orange (right, the discriminator) regions are read at each hop and the per-
// readout twin Δ is logged so the FIRST hop that diverges is visible. See fixtures/create/COLOR.md.
//
// SCOPE OF THE ASSERT: headless WebKit's colour handling is NOT iPhone Safari's, so this is the
// PLUMBING GUARD — it fails on gross breakage (a black/degenerate readout, a wired-wrong
// discriminator, twins blown apart beyond a coarse budget), and LOGS the subtle Δ for the device
// to adjudicate. Requires the seam build: NEXT_PUBLIC_TEST_SEAM=1 (next build && next start).

type RGB = [number, number, number];
const dist = (a: RGB, b: RGB) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const FIX = (n: string) => join(process.cwd(), 'test/fixtures/create', n);

const TWINS = [
  { id: 'p3',   file: 'p3-swatch.jpg' },
  { id: 'srgb', file: 'srgb-swatch.jpg' },
];

// Documented stored bytes (fixtures/create/COLOR.md). The discriminator is ORANGE.
const EXPECT = {
  green:  { p3: [0,255,0] as RGB, srgb: [0,255,1] as RGB },
  orange: { p3: [255,117,0] as RGB, srgb: [255,127,0] as RGB },
};

async function sampleCanvas(canvas: Locator, pts: [number, number][]): Promise<RGB[]> {
  const png = await canvas.screenshot();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  return pts.map(([nx, ny]) => {
    const x = Math.min(width - 1, Math.max(0, Math.round(nx * width)));
    const y = Math.min(height - 1, Math.max(0, Math.round(ny * height)));
    const i = (y * width + x) * channels;
    return [data[i], data[i+1], data[i+2]] as RGB;
  });
}

async function importToFinishing(page: Page, traces: string[], file: string) {
  traces.length = 0;
  await page.goto(`/create?debug=crop`);
  const enter = page.getByRole('button', { name: /^ENTER$/ });
  if (await enter.count()) await enter.first().click({ timeout: 2000 }).catch(() => {});
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.getByRole('button', { name: 'Next' }).first().click();
  await expect.poll(() => traces.find((t) => t.startsWith('[crop] open')), { timeout: 15_000 }).toBeTruthy();
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  await expect.poll(() => traces.find((t) => t.startsWith('[finish]')), { timeout: 15_000 }).toBeTruthy();
  await page.waitForTimeout(700); // let the colour-managed decode land in the texture
}

test('create colour — three-readout P3/sRGB twin divergence', async ({ page }, testInfo) => {
  const traces: string[] = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[crop]') || t.startsWith('[finish]') || t.startsWith('[c3-2]')) traces.push(t);
  });

  const readouts: Record<string, { r1: { green: RGB; orange: RGB }; r2: { green: RGB; orange: RGB } }> = {};

  for (const twin of TWINS) {
    await importToFinishing(page, traces, FIX(twin.file));

    // Readout (1) — the decoded bitmap, off the seam window hook.
    const r1 = await page.evaluate(() => (window as unknown as { __scopeColorReadout1?: { green: RGB; orange: RGB } }).__scopeColorReadout1 ?? null);
    expect(r1, `readout1 missing for ${twin.id} — is NEXT_PUBLIC_TEST_SEAM=1 on this build?`).toBeTruthy();

    // Readout (2) — the gl-react preview the suite displays. (3) bake shares this GL readback.
    const canvas = page.locator('[data-testid="finishing-step"] canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    const [green2, orange2] = await sampleCanvas(canvas, [[0.12, 0.5], [0.88, 0.5]]);

    readouts[twin.id] = { r1: r1 as { green: RGB; orange: RGB }, r2: { green: green2, orange: orange2 } };

    await page.screenshot({ path: `test/.report/${testInfo.project.name}__color__${twin.id}.png` });
    // eslint-disable-next-line no-console
    console.log(`READOUTS ${twin.id}\n  (1) decode  green=${(r1 as any).green} orange=${(r1 as any).orange}\n  (2) preview green=${green2} orange=${orange2}`);

    // Plumbing: no degenerate (black) readout; green region is green-dominant, orange is red-dominant.
    for (const [hop, ro] of [['decode', (r1 as any)], ['preview', { green: green2, orange: orange2 }]] as const) {
      expect(ro.green[1], `${twin.id} ${hop}: green region not green-dominant ${ro.green}`).toBeGreaterThan(ro.green[2]);
      expect(ro.orange[0], `${twin.id} ${hop}: orange region not red-dominant ${ro.orange}`).toBeGreaterThan(ro.orange[2]);
    }
  }

  // ── The twin divergence, per readout — the localiser ──────────────────────────
  const dGreen1 = dist(readouts.p3.r1.green, readouts.srgb.r1.green);
  const dOrange1 = dist(readouts.p3.r1.orange, readouts.srgb.r1.orange);
  const dGreen2 = dist(readouts.p3.r2.green, readouts.srgb.r2.green);
  const dOrange2 = dist(readouts.p3.r2.orange, readouts.srgb.r2.orange);
  // eslint-disable-next-line no-console
  console.log(`TWIN Δ (p3 vs srgb)\n  (1) decode  green Δ=${dGreen1.toFixed(1)} orange Δ=${dOrange1.toFixed(1)}\n  (2) preview green Δ=${dGreen2.toFixed(1)} orange Δ=${dOrange2.toFixed(1)}\n  → the first readout whose Δ jumps is where management is lost.`);

  // Coarse plumbing budget — catches gross breakage (one twin black/wrong-channel), NOT the
  // subtle wash (that is the device's call). If the managed pipeline is intact, both twins land
  // in the same neighbourhood at every readout.
  const GROSS = 120;
  expect(dOrange1, `decode twin Δ(orange)=${dOrange1.toFixed(1)} exceeds gross budget — management broke at DECODE`).toBeLessThan(GROSS);
  expect(dOrange2, `preview twin Δ(orange)=${dOrange2.toFixed(1)} exceeds gross budget — management broke at/after the GL UPLOAD`).toBeLessThan(GROSS);
});
