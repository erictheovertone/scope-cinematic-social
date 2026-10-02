import { test, expect, type Locator } from '@playwright/test';
import { join } from 'path';
import sharp from 'sharp';

// Brief C2 §0 — the create-pipeline matrix. Reuses the stored Privy session. For each fixture it
// imports → crops → confirms, capturing the [crop] open/next + [finish] console traces + a finishing
// screenshot, asserts the overlay/finishing ratio == label (§1a invariant), and — C2c §4 — samples
// the finishing CANVAS to prove the baked cells are the ones the overlay framed (ordering/no-mirror,
// full-width, non-degenerate) and the P3 fixture survives colour management.

// ── C2c §4: finishing-canvas pixel sampling ────────────────────────────────────
// The fixtures carry a 4×4 grid of 16 maximally-separated colours (generate.mjs). Nearest-cell
// classification is therefore robust to a default grade — a shifted colour still classifies right.
const CELLS = ['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6',
               '#bcf60c','#fabebe','#008080','#9a6324','#800000','#808000','#000075','#a9a9a9'];
type RGB = { r: number; g: number; b: number };
const hex = (h: string): RGB => ({ r: parseInt(h.slice(1,3),16), g: parseInt(h.slice(3,5),16), b: parseInt(h.slice(5,7),16) });
const dist = (a: RGB, b: RGB) => Math.hypot(a.r-b.r, a.g-b.g, a.b-b.b);
const nearestCell = (c: RGB) => { let idx = -1, d = 1e9; CELLS.forEach((h,i) => { const e = dist(c, hex(h)); if (e < d) { d = e; idx = i; } }); return { idx, d }; };

// Screenshot the finishing canvas, read RGB at each normalized (nx,ny).
async function sampleCanvas(canvas: Locator, pts: [number, number][]): Promise<RGB[]> {
  const png = await canvas.screenshot();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  return pts.map(([nx, ny]) => {
    const x = Math.min(width - 1, Math.max(0, Math.round(nx * width)));
    const y = Math.min(height - 1, Math.max(0, Math.round(ny * height)));
    const i = (y * width + x) * channels;
    return { r: data[i], g: data[i+1], b: data[i+2] };
  });
}

// Fixtures whose stored pixels are NOT rotated — column order maps straight to the grid.
const UNROTATED = new Set(['landscape', 'square', 'perf-12mp']);
const P3_REF = hex('#e6194b'); // the P3 fixture's actual top-left cell (see note in generate.mjs)

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

// AspectId → the picker tile's visible label (grid-layout/page.tsx LAYOUTS[].label). 1x variants
// where they exist; `legacy` only ships a 2X tile. Confirmed against the live source on the first
// authed run. The picker is two-stage: tap the labelled tile → click CONFIRM on the confirm screen.
// NOTE: this WRITES the signed-in user's profile aspect_ratio/mobile_count. Run the full matrix
// serially (--workers=1) — parallel workers would race on the one profile — and restore after.
const TILE_LABEL: Record<string, string> = {
  'scope': '1X SCOPE', 'pana-wide': '1X ULTRA-PAN', 'cine-wide': '1X CINE WIDE',
  'legacy': '2X LEGACY', 'collage': 'COLLAGE',
};

async function setGridLayout(page: import('@playwright/test').Page, aspect: string) {
  await page.goto(`/profile/grid-layout`);
  const tile = page.getByText(TILE_LABEL[aspect], { exact: true }).first();
  await expect(tile).toBeVisible({ timeout: 10_000 });
  await tile.click(); // → ConfirmationView
  await page.getByRole('button', { name: /^confirm$/i }).first().click(); // persists the layout
  // C2c §1/§2 — the CONFIRM handler now awaits the write and only redirects to /profile once it has
  // LANDED (fire-and-forget fixed in grid-layout/page.tsx). So the redirect IS the success signal:
  // wait for it with NO catch. If it never comes, the write didn't land — fail loud, real finding.
  await page.waitForURL(/\/profile(\/|\?|$)/, { timeout: 15_000 });
}

// Import FIXTURES[0] and advance to crop; returns the captured [crop] open line.
async function importAndOpenCrop(page: import('@playwright/test').Page, traces: string[], file: string) {
  traces.length = 0;
  await page.goto(`/create?debug=crop`);
  const enter = page.getByRole('button', { name: /^ENTER$/ }); // dismiss "WHILE YOU WERE AWAY"
  if (await enter.count()) await enter.first().click({ timeout: 2000 }).catch(() => {});
  await page.locator('input[type="file"]').first().setInputFiles(file);
  // media → crop is gated behind Next (step machine starts at 'media'; CreatePostFlow Next →
  // setStep('crop')). setInputFiles alone does NOT advance.
  await page.getByRole('button', { name: 'Next' }).first().click();
  await expect.poll(() => traces.find((t) => t.startsWith('[crop] open')), { timeout: 15_000 }).toBeTruthy();
  return traces.find((t) => t.startsWith('[crop] open')) || '';
}

for (const aspect of Object.keys(RATIOS)) {
  test(`create matrix — ${aspect}`, async ({ page }, testInfo) => {
    const traces: string[] = [];
    page.on('console', (m) => { const t = m.text(); if (t.startsWith('[crop]') || t.startsWith('[finish]')) traces.push(t); });

    await setGridLayout(page, aspect); // redirect = write landed; first create below must match

    for (const fx of FIXTURES) {
      await importAndOpenCrop(page, traces, FIX(fx.file)); // import → crop ([crop] open ∈ traces)
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

      // C2c §4 — PIXEL check: the baked finishing output shows the cells the overlay framed.
      const canvas = page.locator('[data-testid="finishing-step"] canvas').first();
      await expect(canvas).toBeVisible({ timeout: 10_000 });
      // 4 samples across the vertical middle of the frame (left→right).
      const mids = await sampleCanvas(canvas, [[0.15, 0.5], [0.38, 0.5], [0.62, 0.5], [0.85, 0.5]]);
      const hits = mids.map(nearestCell);
      // (a) non-degenerate bake — every sample is a real grid colour, not a black/letterbox bar.
      hits.forEach((h, i) => expect(h.d, `${aspect}/${fx.id} sample ${i} not a grid colour (Δ=${h.d.toFixed(0)}) rgb=${JSON.stringify(mids[i])}`).toBeLessThan(90));
      if (UNROTATED.has(fx.id)) {
        // (b) full-width + correct column order (no mirror — the C1c mirror-retire regression guard):
        // the 4 samples are 4 DISTINCT cells whose column (idx%4) ascends left→right.
        const cols = hits.map((h) => h.idx % 4);
        expect(new Set(cols).size, `${aspect}/${fx.id} columns not distinct: ${cols}`).toBe(4);
        expect(cols, `${aspect}/${fx.id} columns not ascending L→R (mirror?): ${cols}`).toEqual([...cols].sort((a, b) => a - b));
      }
      if (fx.id === 'p3') {
        // (c) colour management — the P3-tagged fixture's top-left cell survives → sRGB without a
        // gross shift (X5: colorSpaceConversion default → sRGB). NOTE: generate.mjs tags the normal
        // grid as P3 rather than baking a true wide-gamut swatch, so the meaningful ref is the
        // actual top-left cell (#e6194b), not the aspirational {0,249,0}. Δ budget widened accordingly.
        const [tl] = await sampleCanvas(canvas, [[0.06, 0.5]]); // left edge, mid (top-left column, cropped band)
        const delta = dist(tl, P3_REF);
        // eslint-disable-next-line no-console
        console.log(`  P3 top-left rgb=${JSON.stringify(tl)} vs sRGB(#e6194b)=${JSON.stringify(P3_REF)} Δ=${delta.toFixed(1)}`);
        expect(delta, `P3 top-left Δ too large (colour management broke?) rgb=${JSON.stringify(tl)}`).toBeLessThan(40);
      }
    }
  });
}
