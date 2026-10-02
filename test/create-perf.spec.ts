import { test, expect } from '@playwright/test';
import { join } from 'path';

// Brief C2c §6 — PERF *BEFORE* trace (the merge gate for perf/c2-heavy: previewDecode / bakeWorker /
// previewGrade). On the scope layout with the 12MP fixture it measures, during (A) the crop drag and
// (B) a grade-slider drag: long tasks (count / total blocking / max), p95 frame time, and JS heap.
// Non-mutating — imports a fixture, drives the UI, never confirms a post. Chromium only (the heap +
// longtask APIs are Chromium-only). Run: BASE_URL=… npx playwright test test/create-perf.spec.ts --project=desktop-chromium

const FIX = (n: string) => join(process.cwd(), 'test/fixtures/create', n);

type Perf = { longTasks: number; totalBlockingMs: number; maxTaskMs: number; p95FrameMs: number; frames: number; heapMB: number };

async function startInstrumentation(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__lt = [] as number[];
    try {
      const obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) (w.__lt as number[]).push(e.duration); });
      obs.observe({ entryTypes: ['longtask'] });
      w.__obs = obs;
    } catch { /* no longtask support */ }
    w.__frames = [] as number[];
    let last = performance.now();
    w.__raf = true;
    const tick = () => { const t = performance.now(); (w.__frames as number[]).push(t - last); last = t; if (w.__raf) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}

async function collect(page: import('@playwright/test').Page): Promise<Perf> {
  return await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__raf = false;
    try { (w.__obs as PerformanceObserver | undefined)?.disconnect(); } catch { /* */ }
    const lt = (w.__lt as number[]) || [];
    const frames = ((w.__frames as number[]) || []).slice(1); // drop first (warmup)
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      longTasks: lt.length,
      totalBlockingMs: Math.round(lt.reduce((s, d) => s + Math.max(0, d - 50), 0)),
      maxTaskMs: Math.round(lt.reduce((m, d) => Math.max(m, d), 0)),
      p95FrameMs: Math.round(p95 * 10) / 10,
      frames: frames.length,
      heapMB: Math.round((mem?.usedJSHeapSize ?? 0) / 1048576 * 10) / 10,
    };
  });
}

type Box = { x: number; y: number; width: number; height: number };
async function dragAcross(page: import('@playwright/test').Page, box: Box, from: { x: number; y: number }, to: { x: number; y: number }, steps = 60) {
  await page.mouse.move(box.x + box.width * from.x, box.y + box.height * from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(box.x + box.width * (from.x + (to.x - from.x) * t), box.y + box.height * (from.y + (to.y - from.y) * t));
    await page.waitForTimeout(16); // ~60fps input cadence
  }
  await page.mouse.up();
}

const fmt = (n: number) => String(n).padEnd(13);

test('perf BEFORE — crop drag + grade slider (scope, 12MP)', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'heap + longtask APIs are Chromium-only');

  // import → crop
  await page.goto('/create?debug=crop');
  const enter = page.getByRole('button', { name: /^ENTER$/ });
  if (await enter.count()) await enter.first().click({ timeout: 2000 }).catch(() => {});
  await page.locator('input[type="file"]').first().setInputFiles(FIX('perf-12mp.jpg'));
  await page.getByRole('button', { name: 'Next' }).first().click();
  const crop = page.locator('[data-testid="crop-move"]').first();
  await expect(crop).toBeVisible({ timeout: 15_000 });
  const cb = await crop.boundingBox();
  expect(cb, 'crop move-handle box').toBeTruthy();

  // (A) crop drag — reposition the crop box up then down (exercises the rAF-coalesced setCrop)
  await startInstrumentation(page);
  await dragAcross(page, cb!, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.12 });
  await dragAcross(page, cb!, { x: 0.5, y: 0.12 }, { x: 0.5, y: 0.88 });
  const cropPerf = await collect(page);

  // → finishing. The tool list shows buttons (EXPOSURE, CONTRAST…); a ToolSlider only mounts once a
  // tool is opened — tap EXPOSURE to reveal its track.
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  await page.getByRole('button', { name: 'EXPOSURE' }).first().click({ timeout: 15_000 });
  const slider = page.locator('[data-testid="tool-slider-track"]').first();
  await expect(slider, 'a finishing grade slider').toBeVisible({ timeout: 15_000 });
  const sb = await slider.boundingBox();
  expect(sb, 'grade slider box').toBeTruthy();

  // (B) grade slider drag — sweep the first grade control (drives the gl-react Pipeline re-render)
  await startInstrumentation(page);
  await dragAcross(page, sb!, { x: 0.12, y: 0.5 }, { x: 0.9, y: 0.5 });
  await dragAcross(page, sb!, { x: 0.9, y: 0.5 }, { x: 0.12, y: 0.5 });
  const gradePerf = await collect(page);

  const table = [
    `PERF BEFORE (scope · perf-12mp · ${testInfo.project.name})`,
    `  metric             crop-drag     grade-slider`,
    `  long tasks         ${fmt(cropPerf.longTasks)} ${gradePerf.longTasks}`,
    `  total blocking ms  ${fmt(cropPerf.totalBlockingMs)} ${gradePerf.totalBlockingMs}`,
    `  max task ms        ${fmt(cropPerf.maxTaskMs)} ${gradePerf.maxTaskMs}`,
    `  p95 frame ms       ${fmt(cropPerf.p95FrameMs)} ${gradePerf.p95FrameMs}`,
    `  frames sampled     ${fmt(cropPerf.frames)} ${gradePerf.frames}`,
    `  heap MB (end)      ${fmt(cropPerf.heapMB)} ${gradePerf.heapMB}`,
  ].join('\n');
  // eslint-disable-next-line no-console
  console.log('\n' + table + '\n');
  await testInfo.attach('perf-before.txt', { body: table, contentType: 'text/plain' });
});
