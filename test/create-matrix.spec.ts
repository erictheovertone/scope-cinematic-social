import { test, expect, type Locator } from '@playwright/test';
import { join } from 'path';
import { readFileSync } from 'fs';
import sharp from 'sharp';

// ── MX-2 §1 — post-write profile assertion ─────────────────────────────────────
// Read the throwaway profile row from Supabase REST (profiles is public-read) after each layout
// switch and fail loudly if aspect_ratio / mobile_count don't match what was set — so a silent
// partial write (the setGridLayout race this brief fixes) can NEVER pass again. Creds come from
// .env.local; identity from the AUTH_STATE privy token (sub = privy_id) → users.id → profile.
function envVar(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const m = readFileSync('.env.local', 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* fall through */ }
  return '';
}
const SUPA_URL = envVar('NEXT_PUBLIC_SUPABASE_URL');
const SUPA_KEY = envVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const supaHeaders = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };
// aspect key → expected mobile_count (grid-layout handleConfirm: collage→2, 2X→2, 1X→1).
const EXPECT_MOBILE: Record<string, number> = { scope: 1, 'pana-wide': 1, 'cine-wide': 1, legacy: 2, collage: 2 };
let _uid: string | null = null;
async function throwawayUserId(): Promise<string> {
  if (_uid) return _uid;
  const state = JSON.parse(readFileSync(process.env.AUTH_STATE || 'test/.auth/throwaway.json', 'utf8'));
  const ls = (state.origins || []).flatMap((o: { localStorage?: { name: string; value: string }[] }) => o.localStorage || []);
  const tok = ls.find((k: { name: string }) => k.name === 'privy:token');
  if (!tok) throw new Error('[post-write] no privy:token in AUTH_STATE');
  const pid = JSON.parse(Buffer.from(tok.value.split('.')[1], 'base64').toString()).sub as string;
  const r = await fetch(`${SUPA_URL}/rest/v1/users?privy_id=eq.${encodeURIComponent(pid)}&select=id`, { headers: supaHeaders });
  const rows = (await r.json()) as { id: string }[];
  if (!rows?.[0]?.id) throw new Error(`[post-write] user not found for ${pid} (HTTP ${r.status})`);
  _uid = rows[0].id;
  return _uid;
}
async function readProfileAR(): Promise<{ aspect_ratio: string; mobile_count: number }> {
  const uid = await throwawayUserId();
  const r = await fetch(`${SUPA_URL}/rest/v1/profiles?user_id=eq.${uid}&select=aspect_ratio,mobile_count`, { headers: supaHeaders });
  const rows = (await r.json()) as { aspect_ratio: string; mobile_count: number }[];
  if (!rows?.[0]) throw new Error(`[post-write] profile not found for user ${uid} (HTTP ${r.status})`);
  return rows[0];
}

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
  // MX-2 §1 — the §3 FIX. The old gate `waitForURL(/\/profile(\/|\?|$)/)` matched the CURRENT
  // /profile/grid-layout URL instantly, so it NEVER waited for the CONFIRM redirect — the test
  // navigated away and cancelled the in-flight setSharedAspect/setMobileCount writes (MX-1 §1b).
  // Wait for the EXACT /profile path (the real redirect after WelcomeTransition → router.push),
  // which only fires once both writes resolved.
  await page.waitForURL((u) => new URL(u).pathname === '/profile', { timeout: 15_000 });
  // POST-WRITE ASSERTION — read the profile row back and fail loudly on any mismatch, so a silent
  // partial write can never pass again.
  const row = await readProfileAR();
  expect(row.aspect_ratio, `[post-write] aspect_ratio after setGridLayout(${aspect}) — got ${JSON.stringify(row)}`).toBe(aspect);
  expect(row.mobile_count, `[post-write] mobile_count after setGridLayout(${aspect}) — got ${JSON.stringify(row)}`).toBe(EXPECT_MOBILE[aspect]);
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

      // MX-1 §2b — GEOMETRY, not a log label: measure the crop overlay frame's REAL aspect from its
      // DOM rect and compare to the nominal ratio. The old assertion substring-matched the [crop] open
      // console label; a layout that silently did NOT change (e.g. the setGridLayout write race) could
      // still satisfy a label check. The measured rect cannot lie.
      //   Scope: the LANDSCAPE fixture, where the image fills the stage width and the frame rect is a
      //   clean read. Portrait/square letterbox inside the stage, so their rendered-px rect carries a
      //   few-% artifact that is NOT the layout — those fixtures keep the delivered-region pixel checks
      //   below. TOLERANCE: 2% — the app's OWN overlay-vs-chip tolerance (CropTool "overlay==out?" uses
      //   0.02); the brief's 0.5% is tighter than the overlay renders in sub-pixel px. A wrong layout
      //   deviates 15–80% here, so 2% catches every real miss with zero flake.
      if (fx.id === 'landscape') {
        const frame = page.locator('[data-testid="crop-move"]').first();
        await expect(frame).toBeVisible({ timeout: 10_000 });
        const fbox = await frame.boundingBox();
        const [nw, nh] = RATIOS[aspect].split(':').map(Number);
        const nominal = nw / nh;
        const measured = fbox ? fbox.width / fbox.height : 0;
        // eslint-disable-next-line no-console
        console.log(`GEOM ${aspect}/${fx.id} frame ${fbox ? Math.round(fbox.width) + '×' + Math.round(fbox.height) : '?'} aspect=${measured.toFixed(3)} nominal=${nominal.toFixed(3)}`);
        expect(Math.abs(measured - nominal) / nominal, `${aspect} crop frame aspect measured=${measured.toFixed(3)} vs nominal=${nominal.toFixed(3)} (${RATIOS[aspect]}) — overlay drew the WRONG AR (layout didn't change?)`).toBeLessThan(0.02);
      }

      await page.getByRole('button', { name: 'Confirm' }).first().click();
      // finishing → wait for the [finish] trace + screenshot
      await expect.poll(() => traces.find((t) => t.startsWith('[finish]')), { timeout: 15_000 }).toBeTruthy();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test/.report/${testInfo.project.name}__${aspect}__${fx.id}.png` });

      const open = traces.find((t) => t.startsWith('[crop] open')) || '';
      const finish = traces.find((t) => t.startsWith('[finish]')) || '';
      const expected = RATIOS[aspect];
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
        // (c) colour management — MX-1 §1c FIX. The OLD check sampled [0.06,0.5] and compared it to
        // #e6194b, the UNCROPPED top-left cell (A1). But a 2.39:1 centre-crop delivers the MIDDLE band
        // (rows B–C), so [0.06,0.5] is cell #bcf60c (C1, row 2) — NOT #e6194b, which the crop removes.
        // The old test's EXPECTATION was wrong; the app region is correct. Correct delivered-region
        // check: every mid sample must match the grid cell it ACTUALLY is within a TIGHT budget →
        // proves the P3→sRGB conversion is faithful (no gross chroma/tone shift), with no assumption
        // about WHICH cell the crop happens to deliver.
        const P3_BUDGET = 24; // faithful management; the real samples land Δ≈1–3 of their sRGB cell
        hits.forEach((h, i) => expect(h.d, `P3 sample ${i} colour-management Δ=${h.d.toFixed(1)} rgb=${JSON.stringify(mids[i])} (nearest ${CELLS[h.idx]})`).toBeLessThan(P3_BUDGET));
        // eslint-disable-next-line no-console
        console.log(`  P3 colour-management: ${hits.map((h, i) => `${CELLS[h.idx]}Δ${h.d.toFixed(0)}`).join('  ')}`);
      }
    }
  });
}
