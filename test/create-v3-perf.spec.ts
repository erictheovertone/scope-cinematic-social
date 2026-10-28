import { test, expect, type CDPSession } from '@playwright/test';
import { join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { PUB, OUT, counts, toEdit } from './v3-harness';

// Brief V3 §3/§8 — EDIT & POST scrub perf (perf:smooth's method: long tasks > 50ms + rAF frame deltas,
// Chromium at 4× CPU throttle). UNTRACED: Playwright's trace snapshotter runs a DOM snapshot in-page on
// every action (82 mouse moves here) and shows up as its own long tasks (captureSnapshot/visitNode in a
// CDP profile) — perf:smooth measures untraced, so this does too.
test.use({ trace: 'off' });

test('V3 EDIT & POST scrub — one player, no long task > 50ms', async ({ page, browserName }, testInfo) => {
  test.skip(!existsSync(join(PUB, 'v-4k.mp4')), 'needs the 4K fixture');
  test.setTimeout(150_000);
  await toEdit(page, 'v-4k.mp4');
  const track = page.locator('[data-testid="snippet-track"]');
  await track.scrollIntoViewIfNeeded();
  // Strip: captured once from the preview element — ≤12 frames into ≤320px.
  const strip = track.locator('img');
  await expect(strip).toBeVisible({ timeout: 20_000 });
  const stripW = await strip.evaluate((i) => (i as HTMLImageElement).naturalWidth);
  const before = await counts(page);

  // perf:smooth's method (test/smooth-gate.mjs): long tasks > 50ms + rAF frame deltas; Chromium
  // also gets its 4× CPU throttle (≈ a mid iPhone on JS-heavy work).
  let cdp: CDPSession | null = null;
  if (browserName === 'chromium') { cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  await page.evaluate(() => {
    type S = { frames: number[]; lt: number[]; ltAt: number[]; t0: number; last: number; on: boolean };
    const P: S = { frames: [], lt: [], ltAt: [], t0: performance.now(), last: 0, on: true };
    (window as unknown as { __scrub: S }).__scrub = P;
    const loop = (t: number) => { if (!P.on) return; if (P.last) P.frames.push(t - P.last); P.last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { P.lt.push(e.duration); P.ltAt.push(Math.round(e.startTime - P.t0)); })).observe({ type: 'longtask' }); } catch { /* WebKit: no longtask API */ }
  });
  if (cdp && process.env.V3_PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const box = (await track.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 4, y);
  await page.mouse.down();
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i <= 40; i++) {
      const f = pass % 2 === 0 ? i / 40 : 1 - i / 40;
      await page.mouse.move(box.x + 4 + f * (box.width - 8), y);
      await page.waitForTimeout(16);
    }
  }
  const upAt = await page.evaluate(() => Math.round(performance.now() - (window as unknown as { __scrub: { t0: number } }).__scrub.t0));
  await page.mouse.up();
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => { const P = (window as unknown as { __scrub: { frames: number[]; lt: number[]; ltAt: number[]; on: boolean } }).__scrub; P.on = false; return { frames: P.frames, lt: P.lt, ltAt: P.ltAt }; });
  if (cdp && process.env.V3_PROFILE) {
    const { profile } = (await cdp.send('Profiler.stop')) as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[]; samples: number[]; timeDeltas: number[] } };
    const self = new Map<number, number>();
    profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
    const byFn = new Map<string, number>();
    for (const n of profile.nodes) { const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; byFn.set(k, (byFn.get(k) ?? 0) + (self.get(n.id) ?? 0)); }
    console.log('[V3 profile]', JSON.stringify([...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, us]) => `${Math.round(us / 1000)}ms ${k}`)));
  }
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const after = await counts(page);
  const sorted = [...m.frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * sorted.length)] ?? 0;
  const report = {
    project: testInfo.project.name, cpuThrottle: browserName === 'chromium' ? 4 : 1, stripW,
    longTasksOver50: m.lt.filter((d) => d > 50).length, maxLongTaskMs: Math.round(Math.max(0, ...m.lt)),
    longTasks: m.lt.map((d, i) => `${Math.round(d)}ms@${m.ltAt[i]}`), pointerUpAt: upAt,
    frames: m.frames.length, p95FrameMs: Math.round(p95 * 10) / 10, maxFrameMs: Math.round(Math.max(0, ...m.frames) * 10) / 10,
    countsDuringEdit: before, countsAfterScrub: after,
  };
  console.log(`[V3§8 scrub] ${JSON.stringify(report)}`);
  writeFileSync(join(OUT, `v3-scrub-${testInfo.project.name}.json`), JSON.stringify(report, null, 2));
  expect(stripW, 'strip ≤ 320px wide').toBeLessThanOrEqual(320);
  expect(before.vid, 'EDIT & POST: one decoder while the strip is up').toBe(1);
  expect(before.gl, 'EDIT & POST: one GL context while the strip is up').toBe(1);
  expect(after.vid + after.gl, 'scrubbing stood up no second decoder/context').toBe(2);
  if (browserName === 'chromium') expect(report.longTasksOver50, 'long tasks > 50ms while scrubbing').toBe(0);
});
