import { test, expect, webkit, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import { join } from 'path';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { PUB, OUT, ASSERT, counts, now, openCreate, inject, dumpCrumbs, toEdit, type Counts } from './v3-harness';

// ── Brief V3 §8 — EDIT & POST: one player per screen (harness evidence) ───────────────────────────
// Decoder + WebGL-context counts per step, measured by an INIT SCRIPT (not the app's own probe), so the
// SAME instrument runs against any build — main (before) and wt/v1-trace (after):
//   decoder = a <video> with networkState LOADING or readyState ≥ HAVE_METADATA (the app's definition —
//             a torn-down element, src removed + load(), drops to 0/0 and is not counted).
//   gl      = a WebGL context that is not isContextLost().
// Both are WeakRef'd, so an element the page dropped AND the engine collected stops counting; one the page
// leaked (detached but still holding src / an un-lost context) keeps counting — the device reality.
// carry = live decoders/contexts created BEFORE the step boundary that are still alive after it (must be 0).
//
//   BASE_URL=http://localhost:3000 AUTH_STATE=…/throwaway.json npx playwright test test/create-v3.spec.ts
//   V3_ASSERT=0 → record only (the BEFORE run on main).

const FIXTURES = [
  { id: '20s', file: 'v-20s.mp4' },
  { id: '4k', file: 'v-4k.mp4' },
  { id: '4k-hevc', file: 'v-4k-hevc.mov', webkitOnly: true }, // avconvert PresetHEVCHighestQuality of v-4k.mp4
] as { id: string; file: string; webkitOnly?: boolean }[];

for (const fx of FIXTURES) {
  test(`V3 per-step decoder/GL — ${fx.id}`, async ({ page, browserName }, testInfo) => {
    test.skip(!existsSync(join(PUB, fx.file)), `no fixture ${fx.file} (see test/fixtures/create/)`);
    test.skip(!!fx.webkitOnly && browserName !== 'webkit', 'HEVC: WebKit only (Chromium has no HEVC decode)');
    test.setTimeout(180_000);
    await openCreate(page);
    await inject(page, `/test-fixtures/${fx.file}`);
    const row: Record<string, Counts & { ms?: number }> = {};
    const settle = (ms = 1500) => page.waitForTimeout(ms);

    await settle(2500); // the duration/thumbnail one-shot finishes on the media step
    row.media = await counts(page);

    // media → crop
    let mark = await now(page);
    await page.getByRole('button', { name: 'Next' }).first().click();
    const confirm = page.getByRole('button', { name: /^Confirm$/i }).first();
    await expect(confirm).toBeVisible({ timeout: 45_000 });
    await settle();
    row.crop = await counts(page, mark);

    // crop → finishing
    mark = await now(page);
    await confirm.evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator('[data-testid="finishing-step"]')).toBeVisible({ timeout: 45_000 });
    const done = page.getByRole('button', { name: /^done$/i }).first();
    const decodeErr = page.getByText(/something went wrong loading/i).first();
    const finishing = await Promise.race([
      done.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'done' as const),
      decodeErr.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'decode-error' as const),
    ]).catch(() => 'timeout' as const);
    await settle(2500);
    row.finishing = await counts(page, mark);
    if (finishing !== 'done') {
      // The finishing <video> never reached loadeddata (6s watchdog → retry → error). Record it as the
      // step's outcome — that IS the evidence — rather than dying with no table.
      const report = { fixture: fx.file, project: testInfo.project.name, base: process.env.BASE_URL, finishing, row, crumbs: await dumpCrumbs(page) };
      console.log(`[V3§8] ${JSON.stringify(report)}`);
      writeFileSync(join(OUT, `v3-counts-${fx.id}-${testInfo.project.name}-${(process.env.V3_TAG || 'run')}.json`), JSON.stringify(report, null, 2));
      expect(ASSERT ? finishing : 'done', 'finishing step never decoded the video').toBe('done');
      return;
    }

    // finishing → EDIT & POST
    mark = await now(page);
    await done.evaluate((el) => (el as HTMLElement).click());
    await page.getByText(/edit & post/i).first().waitFor({ state: 'visible', timeout: 25_000 });
    await settle(4000); // main preview + (before) the snippet audition stand up
    row.edit = await counts(page, mark);

    // EDIT & POST → deck (no media on screen): everything from the media steps must be gone.
    mark = await now(page);
    await page.getByRole('button', { name: /^Next$/ }).first().evaluate((el) => (el as HTMLElement).click());
    await settle(2000);
    row.afterEdit = await counts(page, mark);

    const crumbs = await dumpCrumbs(page);
    const report = { fixture: fx.file, project: testInfo.project.name, base: process.env.BASE_URL, row, crumbs };
    console.log(`[V3§8] ${JSON.stringify(report)}`);
    writeFileSync(join(OUT, `v3-counts-${fx.id}-${testInfo.project.name}-${(process.env.V3_TAG || 'run')}.json`), JSON.stringify(report, null, 2));
    await testInfo.attach(`v3-counts-${fx.id}`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });

    if (ASSERT) {
      for (const s of ['crop', 'finishing', 'edit'] as const) {
        expect(row[s].vid, `${s}: live decoders`).toBe(1);
        expect(row[s].vidCarry, `${s}: decoders carried over from the previous step`).toBe(0);
        expect(row[s].glCarry, `${s}: GL contexts carried over from the previous step`).toBe(0);
      }
      expect(row.crop.gl, 'crop: GL contexts (CropTool has none)').toBe(0);
      expect(row.finishing.gl, 'finishing: GL contexts').toBe(1);
      expect(row.edit.gl, 'edit: GL contexts').toBe(1);
      expect(row.afterEdit.vid + row.afterEdit.gl, 'deck step: no decoder/GL left from EDIT & POST').toBe(0);
      expect(crumbs.some((c) => c.startsWith('edit:ready')), 'edit:ready crumb (viewer drew its first frame)').toBeTruthy();
    }
  });
}

// ── §5 — crash-safe restore ─────────────────────────────────────────────────────────────────────
// A silent iOS tab kill runs no handlers, so the create flow's marker (localStorage
// scope:create-live) survives into the next load. Simulated: reach EDIT & POST (draft saved), close
// the tab (its pagehide cleans the marker), then open the next page with the marker re-planted
// before any app script runs — exactly the state a killed tab leaves behind.
// Playwright's WebKit contexts are EPHEMERAL (private mode), and private-mode WebKit refuses Blob
// writes to IndexedDB — the C3-11 draft never saves there (a normal iPhone Safari stores it). So on
// WebKit these tests run in a PERSISTENT context seeded with the throwaway session.
async function restoreContext(page: Page, browserName: string, testInfo: TestInfo): Promise<{ page: Page; close: () => Promise<void> }> {
  if (browserName !== 'webkit') return { page, close: async () => {} };
  const u = testInfo.project.use;
  const ctx: BrowserContext = await webkit.launchPersistentContext(mkdtempSync(join(tmpdir(), 'v3-wk-')), {
    viewport: u.viewport ?? null, deviceScaleFactor: u.deviceScaleFactor, isMobile: u.isMobile, hasTouch: u.hasTouch, userAgent: u.userAgent,
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });
  const state = JSON.parse(readFileSync(process.env.AUTH_STATE || 'test/.auth/throwaway.json', 'utf8'));
  const origin = new URL(process.env.BASE_URL || 'http://localhost:3000').origin;
  const ls = (state.origins ?? []).find((o: { origin: string }) => o.origin === origin)?.localStorage ?? [];
  if (state.cookies?.length) await ctx.addCookies(state.cookies);
  await ctx.addInitScript((entries: { name: string; value: string }[]) => {
    for (const e of entries) if (localStorage.getItem(e.name) == null) localStorage.setItem(e.name, e.value);
  }, ls);
  const p = ctx.pages()[0] ?? await ctx.newPage();
  return { page: p, close: () => ctx.close() };
}

async function crashAndReopen(page: Page, extra: Record<string, string> = {}) {
  await toEdit(page, 'v-20s.mp4');
  await page.waitForTimeout(1500); // the draft save is debounced 600ms
  const ctx = page.context();
  await page.close();
  const next = await ctx.newPage();
  await next.addInitScript((kv) => {
    localStorage.setItem('scope:create-live', JSON.stringify({ step: 'edit', at: Date.now() }));
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
  }, extra);
  await openCreate(next);
  return next;
}

test('V3 crash restore — unclean previous page → CROP on the poster, zero decoders', async ({ page: pg, browserName }, testInfo) => {
  test.setTimeout(150_000);
  const rc = await restoreContext(pg, browserName, testInfo);
  try {
  const next = await crashAndReopen(rc.page);
  await expect(next.getByText(/picked up where you left off/i)).toBeVisible({ timeout: 20_000 });
  await expect(next.getByRole('button', { name: /^Confirm$/i }).first()).toBeVisible({ timeout: 20_000 });
  await expect(next.getByRole('img', { name: 'Crop preview' })).toBeVisible();
  await next.waitForTimeout(1500);
  const atCrop = await counts(next);
  const crumbs = await dumpCrumbs(next);
  // …and the user's own tap forward is what starts the next decode.
  await next.getByRole('button', { name: /^Confirm$/i }).first().evaluate((el) => (el as HTMLElement).click());
  await expect(next.getByRole('button', { name: /^done$/i }).first()).toBeVisible({ timeout: 30_000 });
  const report = { project: testInfo.project.name, atCrop, crumbs };
  console.log(`[V3§8 restore-crash] ${JSON.stringify(report)}`);
  writeFileSync(join(OUT, `v3-restore-crash-${testInfo.project.name}.json`), JSON.stringify(report, null, 2));
  expect(atCrop.vid, 'restored crop runs with zero decoders').toBe(0);
  expect(atCrop.gl).toBe(0);
  expect(crumbs.some((c) => c.startsWith('restore:file-ok'))).toBeTruthy();
  expect(crumbs.some((c) => c.startsWith('restore:crash-safe'))).toBeTruthy();
  expect(crumbs.some((c) => c.startsWith('step:edit') || c.startsWith('step:finishing')), 'never restored past crop').toBeFalsy();
  } finally { await rc.close(); }
});

test('V3 crash restore — stored File unreadable → "Pick the video again"', async ({ page: pg, browserName }, testInfo) => {
  test.setTimeout(150_000);
  const rc = await restoreContext(pg, browserName, testInfo);
  try {
  // NEXT_PUBLIC_TEST_SEAM-only hook: the restore's 1-byte read reports failure (a real unreadable
  // IDB blob can't be manufactured in a browser).
  const next = await crashAndReopen(rc.page, { 'scope:test:unreadable-draft': '1' });
  await expect(next.getByText(/pick the video again/i)).toBeVisible({ timeout: 20_000 });
  await expect(next.getByRole('button', { name: /choose from library/i })).toBeVisible();
  const atMedia = await counts(next);
  const crumbs = await dumpCrumbs(next);
  console.log(`[V3§8 restore-unreadable] ${JSON.stringify({ project: testInfo.project.name, atMedia, crumbs })}`);
  expect(crumbs.some((c) => c.startsWith('restore:file-unreadable'))).toBeTruthy();
  expect(atMedia.vid + atMedia.gl).toBe(0);
  // The bad draft is gone: a reload restores nothing.
  await next.evaluate(() => localStorage.removeItem('scope:test:unreadable-draft'));
  await next.reload();
  await next.waitForTimeout(4000);
  await expect(next.getByRole('button', { name: /choose from library/i })).toBeVisible();
  } finally { await rc.close(); }
});

// ── §4 — per-frame texture upload cost on a 4K source, before vs after ─────────────────────────────
// BEFORE = gl-react's video loader: texImage2D(<video>) at source size every frame.
// AFTER  = drawImage into the capped canvas (preview box × DPR) + texImage2D(canvas).
// Each sample forces completion with a 1px readPixels, so the GPU work is inside the timing.
test('V3 §4 texture upload cost — 4K source', async ({ page }, testInfo) => {
  test.skip(!existsSync(join(PUB, 'v-4k.mp4')), 'needs the 4K fixture');
  test.setTimeout(150_000);
  await toEdit(page, 'v-4k.mp4');
  // The live preview's GL canvas backing size IS the cap (Surface = box × DPR).
  const cap = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].find((x) => x.width > 0 && x.getBoundingClientRect().width > 0);
    return c ? { w: c.width, h: c.height } : null;
  });
  expect(cap, 'preview GL canvas').not.toBeNull();
  const r = await page.evaluate(async ({ w, h }) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.src = '/test-fixtures/v-4k.mp4';
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('load')); });
    const glc = document.createElement('canvas'); glc.width = 64; glc.height = 64;
    const gl = glc.getContext('webgl') as WebGLRenderingContext;
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    const fb = gl.createFramebuffer();
    const px = new Uint8Array(4);
    const sync = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); };
    const cv = document.createElement('canvas'); cv.width = Math.min(w, v.videoWidth); cv.height = Math.min(h, v.videoHeight);
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    const N = 40;
    const time = async (fn: () => void) => {
      const out: number[] = [];
      for (let i = 0; i < N + 5; i++) {
        v.currentTime = (i % 8) + 0.1; await new Promise((r) => (v.onseeked = () => r(null))); // a NEW frame each sample
        const t0 = performance.now(); fn(); sync(); const dt = performance.now() - t0;
        if (i >= 5) out.push(dt); // warm-up dropped
      }
      out.sort((a, b) => a - b);
      return { median: Math.round(out[Math.floor(N / 2)] * 100) / 100, p95: Math.round(out[Math.floor(N * 0.95)] * 100) / 100 };
    };
    const before = await time(() => { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v); });
    const after = await time(() => { ctx.drawImage(v, 0, 0, cv.width, cv.height); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); });
    const src = { w: v.videoWidth, h: v.videoHeight };
    v.removeAttribute('src'); v.load(); gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { src, capped: { w: cv.width, h: cv.height }, before, after,
      textureMB: { before: Math.round(src.w * src.h * 4 / 1048576 * 10) / 10, after: Math.round(cv.width * cv.height * 4 / 1048576 * 10) / 10 } };
  }, cap!);
  await page.waitForTimeout(1500);
  const appChose = (await dumpCrumbs(page)).find((c) => c.startsWith('tex+')) ?? 'tex: (no verdict yet)';
  const report = { project: testInfo.project.name, previewCanvas: cap, appChose, ...r };
  console.log(`[V3§4 texture] ${JSON.stringify(report)}`);
  writeFileSync(join(OUT, `v3-texture-${testInfo.project.name}.json`), JSON.stringify(report, null, 2));
  expect(r.capped.w * r.capped.h).toBeLessThan(r.src.w * r.src.h);
});

// ── §1 — the REAL picker (not the seam): a video pick registers and reaches a live crop ────────────
test('V3 real video pick → crop (crumb sequence)', async ({ page }, testInfo) => {
  await openCreate(page);
  // Pick only once React has hydrated (the seam installs from an effect) — a change event dispatched
  // into the SSR'd <input> before its handler attaches is lost. A device can't hit that: the library
  // only opens from the hydrated button's onClick.
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __scopeInjectMedia?: unknown }).__scopeInjectMedia === 'function'), { timeout: 15_000 }).toBeTruthy();
  await page.locator('input[type="file"]').first().setInputFiles(join(PUB, 'v-20s.mp4'));
  await page.getByRole('button', { name: 'Next' }).first().click();
  await expect(page.getByRole('button', { name: /^Confirm$/i }).first()).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => (await dumpCrumbs(page)).some((c) => c.startsWith('crop:ready')), { timeout: 15_000 }).toBeTruthy();
  const crumbs = await dumpCrumbs(page);
  console.log(`[V3§1 pick] ${testInfo.project.name} ${JSON.stringify(crumbs)}`);
  writeFileSync(join(OUT, `v3-pick-${testInfo.project.name}.json`), JSON.stringify(crumbs, null, 2));
  for (const step of ['pick:onchange', 'pick', 'meta', 'thumb', 'gate:finishctx:ready', 'step:crop', 'crop:ready']) {
    expect(crumbs.some((c) => c.startsWith(`${step}+`)), `crumb ${step}`).toBeTruthy();
  }
  expect(crumbs.filter((c) => c.startsWith('gate:finishctx:waiting')).length, '§6 one finishCtx fetch').toBe(1);
  expect(crumbs.some((c) => c.startsWith('leak+')), 'no leaked <video> at any boundary').toBeFalsy();
});
