import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';
import { readFileSync, mkdirSync } from 'fs';
import sharp from 'sharp';

// ── BRIEF MX-3 + C4 — crop matrix: geometry · delivered-region · letterbox · P3 ──────────────────
// Self-contained per the brief. Every fixture × every frame, both projects. Soft assertions so one
// run produces the whole divergence table AND gates green only when every cell passes.
//   geometry       overlay DOM rect vs rendered-image DOM rect: aspect within 2% of nominal AND the
//                  overlay lies entirely inside the image. Measured on EVERY fixture (portrait+square).
//   delivered      the finishing canvas (delivered pixels) sampled 3×3; each sample's decoded fixture
//                  cell must match the cell the overlay framed in source coords, within one cell.
//   letterbox      any sample reading a non-grid colour = the bake included area outside the image.
//   P3             per engine: the bare-<img> Δ is the floor; pipeline budget = floor + 8.
// Harness account = the new test account in AUTH_STATE (writes its profile aspect_ratio/mobile_count).

const REPORT = join(process.cwd(), 'test/.report');
mkdirSync(REPORT, { recursive: true });

// ── Supabase post-write assertion (unchanged from MX-2) ───────────────────────
function envVar(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try { const m = readFileSync('.env.local', 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm')); if (m) return m[1].trim().replace(/^["']|["']$/g, ''); } catch { /* */ }
  return '';
}
const SUPA_URL = envVar('NEXT_PUBLIC_SUPABASE_URL');
const SUPA_KEY = envVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const supaHeaders = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };
const EXPECT_MOBILE: Record<string, number> = { scope: 1, 'pana-wide': 1, 'cine-wide': 1, legacy: 2, collage: 2 };
let _uid: string | null = null;
async function testUserId(): Promise<string> {
  if (_uid) return _uid;
  const state = JSON.parse(readFileSync(process.env.AUTH_STATE || 'test/.auth/throwaway.json', 'utf8'));
  const ls = (state.origins || []).flatMap((o: { localStorage?: { name: string; value: string }[] }) => o.localStorage || []);
  const tok = ls.find((k: { name: string }) => k.name === 'privy:token');
  if (!tok) throw new Error('[post-write] no privy:token in AUTH_STATE');
  const pid = JSON.parse(Buffer.from(tok.value.split('.')[1], 'base64').toString()).sub as string;
  const r = await fetch(`${SUPA_URL}/rest/v1/users?privy_id=eq.${encodeURIComponent(pid)}&select=id`, { headers: supaHeaders });
  const rows = (await r.json()) as { id: string }[];
  if (!rows?.[0]?.id) throw new Error(`[post-write] user not found for ${pid} (HTTP ${r.status})`);
  _uid = rows[0].id; return _uid;
}
async function readProfileAR(): Promise<{ aspect_ratio: string; mobile_count: number }> {
  const uid = await testUserId();
  const r = await fetch(`${SUPA_URL}/rest/v1/profiles?user_id=eq.${uid}&select=aspect_ratio,mobile_count`, { headers: supaHeaders });
  const rows = (await r.json()) as { aspect_ratio: string; mobile_count: number }[];
  if (!rows?.[0]) throw new Error(`[post-write] profile not found for user ${uid} (HTTP ${r.status})`);
  return rows[0];
}

// ── frames + fixtures ─────────────────────────────────────────────────────────
const NOMINAL: Record<string, number> = { scope: 2.39, 'pana-wide': 2.75, 'cine-wide': 1.85, legacy: 4 / 3, collage: 2.39 };
const TILE_LABEL: Record<string, string> = { scope: '1X SCOPE', 'pana-wide': '1X ULTRA-PAN', 'cine-wide': '1X CINE WIDE', legacy: '2X LEGACY', collage: 'COLLAGE' };
const GRID = (n: string) => join(process.cwd(), 'test/fixtures/create/grid', n);
const FIXTURES = [
  { id: '1920x1440', file: GRID('grid-1920x1440.jpg') },
  { id: '1440x1920', file: GRID('grid-1440x1920.jpg') },
  { id: '1920x1920', file: GRID('grid-1920x1920.jpg') },
  { id: '1080x1350', file: GRID('grid-1080x1350.jpg') },
  { id: '1080x1920', file: GRID('grid-1080x1920.jpg') },
  { id: '1170x2532', file: GRID('grid-1170x2532.jpg') },
  { id: '3024x4032', file: GRID('grid-3024x4032.jpg') },
  { id: '1170x2532e6', file: GRID('grid-1170x2532-exif6.jpg') },
  { id: '3024x4032e6', file: GRID('grid-3024x4032-exif6.jpg') },
];

// ── grid decode (kept in sync with gen-grid-fixtures.mjs fillFor) ─────────────
const N = 10;
const markerOk = (R: number, G: number, B: number) => Math.abs(B - 120) <= 34 && R >= 12 && R <= 236 && G >= 12 && G <= 236;
function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
// The finishing preview letterboxes the crop inside a source-aspect canvas, so the delivered pixels
// occupy a CONTENT BAND. Find it by ROW/COL MAJORITY (a row/col counts as content only when ≥50% of
// it is grid-marker) so the preview's own black bars — and 1-px anti-aliased edges — are excluded;
// a real "outside the image" inclusion (the brief's letterbox, a substantial bar) still shows as a
// non-marker SAMPLE inside the band.
function findBand(raw: Buffer, w: number, h: number, ch: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const rowFrac = new Float32Array(h); const colCnt = new Int32Array(w);
  for (let y = 0; y < h; y++) { let m = 0; const base = y * w * ch; for (let x = 0; x < w; x++) { const i = base + x * ch; if (markerOk(raw[i], raw[i + 1], raw[i + 2])) { m++; colCnt[x]++; } } rowFrac[y] = m / w; }
  const ys: number[] = []; for (let y = 0; y < h; y++) if (rowFrac[y] >= 0.5) ys.push(y);
  const nContent = ys.length || 1;
  const xs: number[] = []; for (let x = 0; x < w; x++) if (colCnt[x] >= nContent * 0.5) xs.push(x);
  if (!ys.length || !xs.length) return null;
  return { x0: xs[0], y0: ys[0], x1: xs[xs.length - 1], y1: ys[ys.length - 1] };
}
// Decode the fixture cell at an absolute pixel from a patch (filters border/text/letterbox).
function decodeAtPx(raw: Buffer, w: number, h: number, ch: number, cx: number, cy: number): { r: number; c: number } | null {
  const rad = Math.max(3, Math.round(Math.min(w, h) * 0.02));
  const Rs: number[] = [], Gs: number[] = [];
  for (let dy = -rad; dy <= rad; dy += 2) for (let dx = -rad; dx <= rad; dx += 2) {
    const x = Math.round(cx + dx), y = Math.round(cy + dy); if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = (y * w + x) * ch; const R = raw[i], G = raw[i + 1], B = raw[i + 2];
    if (markerOk(R, G, B)) { Rs.push(R); Gs.push(G); }
  }
  if (Rs.length < 4) return null; // outside the image at this point (real letterbox)
  const R = median(Rs), G = median(Gs);
  return { r: Math.max(0, Math.min(9, Math.round((R - 25) / 22))), c: Math.max(0, Math.min(9, Math.round((G - 25) / 22))) };
}

// ── P3 (the kept 4×4 colour fixture) ───────────────────────────────────────────
const CELLS = ['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6','#bcf60c','#fabebe','#008080','#9a6324','#800000','#808000','#000075','#a9a9a9'];
const hx = (h: string) => ({ r: parseInt(h.slice(1,3),16), g: parseInt(h.slice(3,5),16), b: parseInt(h.slice(5,7),16) });
const d3 = (a: {r:number;g:number;b:number}, b: {r:number;g:number;b:number}) => Math.hypot(a.r-b.r, a.g-b.g, a.b-b.b);
const nearest = (c: {r:number;g:number;b:number}) => { let d = 1e9; CELLS.forEach((h) => { const e = d3(c, hx(h)); if (e < d) d = e; }); return d; };
async function sampleRGB(raw: Buffer, w: number, h: number, ch: number, pts: [number, number][]) {
  return pts.map(([nx, ny]) => { const x = Math.round(nx * (w - 1)), y = Math.round(ny * (h - 1)); const i = (y * w + x) * ch; return { r: raw[i], g: raw[i+1], b: raw[i+2] }; });
}
const P3_PTS: [number, number][] = [[0.15, 0.5], [0.38, 0.5], [0.62, 0.5], [0.85, 0.5]];
let _p3floor: number | null = null;
// Floor = the engine's own P3→sRGB error in a BARE <img>, read from a colour-managed PAGE
// screenshot (canvas.screenshot returns the raw WebGL buffer in a shifted space — not comparable).
async function p3Floor(page: Page): Promise<number> {
  if (_p3floor != null) return _p3floor;
  const b64 = readFileSync(join(process.cwd(), 'test/fixtures/create/p3-tagged.jpg')).toString('base64');
  await page.setContent(`<body style="margin:0;background:#000"><img style="position:fixed;inset:0;width:100vw;height:100vh;object-fit:fill" src="data:image/jpeg;base64,${b64}"></body>`);
  await page.waitForTimeout(300);
  const { data, info } = await sharp(await page.screenshot()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const s = await sampleRGB(data, info.width, info.height, info.channels, P3_PTS);
  _p3floor = Math.max(...s.map(nearest)); // engine's P3→sRGB floor
  return _p3floor;
}

// ── flow helpers ───────────────────────────────────────────────────────────────
async function setGridLayout(page: Page, aspect: string) {
  await page.goto('/profile/grid-layout');
  const tile = page.getByText(TILE_LABEL[aspect], { exact: true }).first();
  await expect(tile).toBeVisible({ timeout: 10_000 });
  await tile.click();
  await page.getByRole('button', { name: /^confirm$/i }).first().click();
  await page.waitForURL((u) => new URL(u).pathname === '/profile', { timeout: 15_000 });
  const row = await readProfileAR();
  expect(row.aspect_ratio, `[post-write] aspect_ratio after setGridLayout(${aspect}) — got ${JSON.stringify(row)}`).toBe(aspect);
  expect(row.mobile_count, `[post-write] mobile_count after setGridLayout(${aspect}) — got ${JSON.stringify(row)}`).toBe(EXPECT_MOBILE[aspect]);
}
async function importAndOpenCrop(page: Page, file: string) {
  await page.goto('/create');
  const enter = page.getByRole('button', { name: /^ENTER$/ });
  if (await enter.count()) await enter.first().click({ timeout: 2000 }).catch(() => {});
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.getByRole('button', { name: 'Next' }).first().click();
  await expect(page.locator('[data-testid="crop-move"]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('img[alt="Crop preview"]').first()).toBeVisible({ timeout: 10_000 });
}

type Row = { frame: string; fixture: string; engine: string; ar: string; inside: string; delivered: string; letterbox: string; p3: string };
const ROWS: Row[] = [];
function logRow(r: Row) { ROWS.push(r); /* eslint-disable-next-line no-console */ console.log(`ROW ${r.engine} | ${r.frame} | ${r.fixture} | ar ${r.ar} | inside ${r.inside} | delivered ${r.delivered} | letterbox ${r.letterbox} | p3 ${r.p3}`); }

for (const frame of Object.keys(NOMINAL)) {
  test(`matrix — ${frame}`, async ({ page }, testInfo) => {
    const engine = testInfo.project.name;
    await setGridLayout(page, frame);

    for (const fx of FIXTURES) {
      await importAndOpenCrop(page, fx.file);

      // geometry — overlay rect vs rendered-image rect
      const rects = await page.evaluate(() => {
        const img = document.querySelector('img[alt="Crop preview"]') as HTMLElement | null;
        const ov = document.querySelector('[data-testid="crop-move"]') as HTMLElement | null;
        if (!img || !ov) return null;
        const a = img.getBoundingClientRect(), b = ov.getBoundingClientRect();
        return { img: { l: a.left, t: a.top, w: a.width, h: a.height }, ov: { l: b.left, t: b.top, w: b.width, h: b.height } };
      });
      let arStr = '—', insideStr = '—', region = { x0: 0, y0: 0, x1: 1, y1: 1 };
      if (rects) {
        const measured = rects.ov.w / rects.ov.h, nominal = NOMINAL[frame];
        const arDev = Math.abs(measured - nominal) / nominal;
        arStr = `${measured.toFixed(3)}/${nominal.toFixed(3)} ${(arDev * 100).toFixed(1)}%`;
        const inside = rects.ov.l >= rects.img.l - 2 && rects.ov.t >= rects.img.t - 2 &&
          rects.ov.l + rects.ov.w <= rects.img.l + rects.img.w + 2 && rects.ov.t + rects.ov.h <= rects.img.t + rects.img.h + 2;
        insideStr = inside ? 'y' : 'n';
        region = {
          x0: Math.max(0, (rects.ov.l - rects.img.l) / rects.img.w), y0: Math.max(0, (rects.ov.t - rects.img.t) / rects.img.h),
          x1: Math.min(1, (rects.ov.l + rects.ov.w - rects.img.l) / rects.img.w), y1: Math.min(1, (rects.ov.t + rects.ov.h - rects.img.t) / rects.img.h),
        };
        expect.soft(arDev, `[${engine}/${frame}/${fx.id}] overlay aspect ${arStr}`).toBeLessThan(0.02);
        expect.soft(inside, `[${engine}/${frame}/${fx.id}] overlay NOT inside image`).toBeTruthy();
      } else {
        expect.soft(rects, `[${engine}/${frame}/${fx.id}] could not read crop rects`).toBeTruthy();
      }

      await page.getByRole('button', { name: 'Confirm' }).first().click();
      const canvas = page.locator('[data-testid="finishing-step"] canvas').first();
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(700);

      // delivered-region + letterbox — a COLOUR-MANAGED page screenshot clipped to the canvas
      // (canvas.screenshot returns the raw WebGL buffer in a shifted space; the page screenshot is
      // sRGB-displayed, so the grid decodes). Sample WITHIN the content band (grid-pixel bbox).
      const cbox = await canvas.boundingBox();
      const shot = await page.screenshot(cbox ? { clip: { x: cbox.x, y: cbox.y, width: cbox.width, height: cbox.height } } : undefined);
      const { data, info } = await sharp(shot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const band = findBand(data, info.width, info.height, info.channels);
      const UV = [1 / 6, 1 / 2, 5 / 6];
      let deliveredBad = 0, letterbox = 0; const detail: string[] = [];
      if (!band) {
        letterbox = 9; detail.push('no grid pixels in delivered canvas');
      } else {
        const bw = band.x1 - band.x0, bh = band.y1 - band.y0;
        if (process.env.MX_DEBUG) { const mid = decodeAtPx(data, info.width, info.height, info.channels, band.x0 + bw / 2, band.y0 + bh / 2); console.log(`DBG ${fx.id} band ${bw}x${bh}@(${band.x0},${band.y0}) canvas ${info.width}x${info.height} mid→${JSON.stringify(mid)}`); }
        for (const v of UV) for (const u of UV) {
          const got = decodeAtPx(data, info.width, info.height, info.channels, band.x0 + u * bw, band.y0 + v * bh);
          const dispX = region.x0 + u * (region.x1 - region.x0), dispY = region.y0 + v * (region.y1 - region.y0);
          const expR = Math.max(0, Math.min(9, Math.floor(dispY * N))), expC = Math.max(0, Math.min(9, Math.floor(dispX * N)));
          if (!got) { letterbox++; detail.push(`(${u.toFixed(2)},${v.toFixed(2)})=LB`); continue; }
          if (Math.abs(got.r - expR) > 1 || Math.abs(got.c - expC) > 1) { deliveredBad++; detail.push(`(${u.toFixed(2)},${v.toFixed(2)}) got[${got.r},${got.c}]≠exp[${expR},${expC}]`); }
        }
      }
      const letterboxStr = letterbox ? `FAIL×${letterbox}` : 'n';
      const deliveredStr = deliveredBad ? `FAIL×${deliveredBad}` : (letterbox ? 'n/a' : 'y');
      expect.soft(letterbox, `[${engine}/${frame}/${fx.id}] letterbox samples: ${detail.join(' ')}`).toBe(0);
      expect.soft(deliveredBad, `[${engine}/${frame}/${fx.id}] delivered-region mismatches: ${detail.join(' ')}`).toBe(0);

      logRow({ frame, fixture: fx.id, engine, ar: arStr, inside: insideStr, delivered: deliveredStr, letterbox: letterboxStr, p3: '—' });

      if (deliveredBad || letterbox || insideStr === 'n') {
        const p = join(REPORT, `DIVERGE__${engine}__${frame}__${fx.id}.png`);
        await page.screenshot({ path: p }).catch(() => {});
        await testInfo.attach(`diverge-${frame}-${fx.id}`, { path: p, contentType: 'image/png' }).catch(() => {});
      }
    }

    // ── P3 (kept fixture) ──
    const floor = await p3Floor(page);
    await importAndOpenCrop(page, join(process.cwd(), 'test/fixtures/create/p3-tagged.jpg'));
    await page.getByRole('button', { name: 'Confirm' }).first().click();
    const pcanvas = page.locator('[data-testid="finishing-step"] canvas').first();
    await expect(pcanvas).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const pcb = await pcanvas.boundingBox();
    const pshot = await page.screenshot(pcb ? { clip: { x: pcb.x, y: pcb.y, width: pcb.width, height: pcb.height } } : undefined);
    const { data: pd, info: pi } = await sharp(pshot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // The P3 fixture is the 4×4 CELLS (not the grid), so locate the crop band geometrically: the
    // nominal-aspect crop centred in the source-aspect canvas. Sample at its vertical centre (row 2).
    const cAsp = pi.width / pi.height, nom = NOMINAL[frame];
    let bx0 = 0, by0 = 0, bw = pi.width, bh = pi.height;
    if (nom >= cAsp) { bh = pi.width / nom; by0 = (pi.height - bh) / 2; } else { bw = pi.height * nom; bx0 = (pi.width - bw) / 2; }
    const pPts: [number, number][] = P3_PTS.map(([nx]) => [(bx0 + nx * bw) / pi.width, (by0 + 0.5 * bh) / pi.height] as [number, number]);
    const ps = await sampleRGB(pd, pi.width, pi.height, pi.channels, pPts);
    const pipeMax = Math.max(...ps.map(nearest));
    if (process.env.MX_DEBUG) console.log(`DBG p3 ${engine} canvas ${pi.width}x${pi.height} band y0=${Math.round(by0)} h=${Math.round(bh)} samples=${ps.map((p) => `${p.r},${p.g},${p.b}`).join(' | ')} floor=${floor.toFixed(1)}`);
    const budget = floor + 8;
    const p3Str = `Δ${pipeMax.toFixed(0)}/floor${floor.toFixed(0)}+8`;
    expect.soft(pipeMax, `[${engine}/${frame}/p3] pipeline Δ=${pipeMax.toFixed(1)} > budget ${budget.toFixed(1)} (floor ${floor.toFixed(1)})`).toBeLessThanOrEqual(budget);
    logRow({ frame, fixture: 'p3', engine, ar: '—', inside: '—', delivered: '—', letterbox: '—', p3: p3Str });
  });
}

test.afterAll(async () => {
  if (!ROWS.length) return;
  const head = 'engine | frame | fixture | overlay ar % | inside | delivered | letterbox | P3';
  const lines = ROWS.map((r) => `${r.engine} | ${r.frame} | ${r.fixture} | ${r.ar} | ${r.inside} | ${r.delivered} | ${r.letterbox} | ${r.p3}`);
  const table = [head, ...lines].join('\n');
  // eslint-disable-next-line no-console
  console.log('\n===== MATRIX TABLE =====\n' + table + '\n========================\n');
  try { require('fs').writeFileSync(join(REPORT, `matrix-table-${Date.now()}.txt`), table); } catch { /* */ }
});
