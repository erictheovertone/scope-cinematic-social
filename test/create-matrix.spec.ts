import { test, expect } from '@playwright/test';
import { join } from 'path';

// Brief C2 §0 — the create-pipeline matrix. Reuses the stored Privy session. For each fixture it
// imports → crops → confirms, capturing the [crop] open/next + [finish] console traces and a
// finishing screenshot, then asserts the overlay/finishing ratio == the expected label.
//
// NOTE (first-run scaffold): the crop AR is LOCKED to the user's grid layout (non-collage), so the
// full "5 ratios" axis means setting the grid layout before each pass. The RATIOS loop below drives
// /profile/grid-layout; its option selectors are marked ⚠ and get confirmed against the live DOM on
// the first authenticated run (Eric), then locked in. Everything else (import, confirm, traces,
// screenshots, ratio assert) runs as-is.

const FIX = (n: string) => join(process.cwd(), 'test/fixtures/create', n);
const FIXTURES = [
  { id: 'landscape', file: 'landscape-4000x3000-noexif.jpg' },
  { id: 'portrait-exif6', file: 'portrait-exif6.jpg' },
  { id: 'square', file: 'square-3000.jpg' },
  { id: 'p3', file: 'p3-tagged.jpg' },
  { id: 'perf-12mp', file: 'perf-12mp.jpg' },
];
// AspectId → expected crop-chip ratio label (CropTool AR_CHIPS.ratioLabel).
const RATIOS: Record<string, string> = {
  'scope': '2.39:1', 'pana-wide': '2.75:1', 'cine-wide': '1.85:1', 'legacy': '4:3', 'collage': '2.39:1',
};

async function setGridLayout(page: import('@playwright/test').Page, aspect: string) {
  // ⚠ selectors to confirm on the first authed run — the grid-layout page option tiles.
  await page.goto(`/profile/grid-layout`);
  const tile = page.locator(`[data-layout="${aspect}"], [data-aspect="${aspect}"]`).first();
  if (await tile.count()) { await tile.click(); const save = page.getByRole('button', { name: /save|confirm|done/i }).first(); if (await save.count()) await save.click(); await page.waitForTimeout(1200); }
  else test.info().annotations.push({ type: 'warn', description: `grid-layout tile for ${aspect} not found — set it manually / fix selector` });
}

for (const aspect of Object.keys(RATIOS)) {
  test(`create matrix — ${aspect}`, async ({ page }, testInfo) => {
    const traces: string[] = [];
    page.on('console', (m) => { const t = m.text(); if (t.startsWith('[crop]') || t.startsWith('[finish]')) traces.push(t); });

    await setGridLayout(page, aspect);

    for (const fx of FIXTURES) {
      traces.length = 0;
      await page.goto(`/create?debug=crop`);
      // import
      const input = page.locator('input[type="file"]').first();
      await input.setInputFiles(FIX(fx.file));
      // crop overlay → wait for the [crop] open trace, then confirm
      await expect.poll(() => traces.find((t) => t.startsWith('[crop] open')), { timeout: 15_000 }).toBeTruthy();
      await page.getByRole('button', { name: 'Confirm' }).first().click();
      // finishing → wait for the [finish] trace + screenshot
      await expect.poll(() => traces.find((t) => t.startsWith('[finish]')), { timeout: 15_000 }).toBeTruthy();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test/.report/${testInfo.project.name}__${aspect}__${fx.id}.png` });

      const open = traces.find((t) => t.startsWith('[crop] open')) || '';
      const finish = traces.find((t) => t.startsWith('[finish]')) || '';
      const expected = RATIOS[aspect];
      // frame ratio == label (the overlay drew the right AR)
      expect(open, `[crop] open for ${aspect}/${fx.id}`).toContain(expected);
      // finishing input == overlay (the SAME resolved chip flowed in — §1a invariant)
      expect(finish, `[finish] for ${aspect}/${fx.id}`).toContain(expected);
      // eslint-disable-next-line no-console
      console.log(`CELL ${testInfo.project.name} / ${aspect} / ${fx.id}\n  ${open}\n  ${finish}`);
      // TODO (authed run): sample the finishing canvas cells vs the fixture grid (baked cells ==
      // overlay cells) and the P3 top-left cell vs P3_SRGB_REF within Δ3.
    }
  });
}
