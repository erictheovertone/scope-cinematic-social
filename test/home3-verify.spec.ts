import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

// ── HOME-3 §A/§B VERIFY ───────────────────────────────────────────────────────
// Drives the authed Home feed with ?debug=video (graded pipeline forced on via the
// server's GRADED_PLAYBACK_ALLOWLIST=* for this run). Captures the [vid …] crumbs and a
// frame contact sheet through several loops of the first graded video.
//   §A — the pipeline must NOT unmount between attach and detach across loops (the raw-frame-
//        on-every-loop teardown is gone): first card's `pipeline unmount` count === 0 while it
//        looped (`ended`) ≥ 2×.
//   §B — the frames (contact sheet, assembled after) must never show the raw picture.
//
//   GRADED_PLAYBACK_ALLOWLIST='*' BASE_URL=http://localhost:3000 \
//     AUTH_STATE=test/.auth/throwaway.json \
//     npx playwright test --config=playwright.home3.config.ts --project=desktop-chromium

test('HOME-3 §A/§B — graded loop: no teardown + contact sheet', async ({ page }, info) => {
  const lines: string[] = [];
  page.on('console', (m) => { const t = m.text(); if (t.includes('[vid ')) lines.push(`${Date.now()} ${t}`); });

  const OUT = join(process.cwd(), 'test/shots-home3', info.project.name);
  mkdirSync(OUT, { recursive: true });

  await page.goto('/?debug=video', { waitUntil: 'domcontentloaded' });

  // Give the feed time to settle + a video to start, then capture frames every 300ms for ~21s —
  // covers many loops of a short clip. We analyse AFTER capture (no early poll) so a device that
  // falls to the CSS path (headless WebKit can't texture HLS → gfxFallback) still yields a trace.
  await page.waitForTimeout(3000);
  // Clip each frame to the first VIDEO card's box so the grade is legible in the contact sheet.
  const clip = await page.evaluate(() => {
    const v = document.querySelector('video');
    const box = (v?.closest('div')?.getBoundingClientRect()) || v?.getBoundingClientRect();
    if (!box || box.width < 10 || box.height < 10) return null;
    return { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(box.width, 1200), height: Math.min(box.height, 1200) };
  });
  const frames: string[] = [];
  for (let i = 0; i < 70; i++) {
    const p = join(OUT, `f${String(i).padStart(2, '0')}.jpg`);
    await page.screenshot({ path: p, type: 'jpeg', quality: 80, ...(clip ? { clip } : {}) }).catch(() => {});
    frames.push(p);
    await page.waitForTimeout(300);
  }

  const tagOf = (l: string) => (l.match(/\[vid ([^\]]+)\]/) || [])[1] ?? '';
  // The first video that produced any crumb (pipeline card if one mounted, else the first player).
  const firstMount = lines.find((l) => /pipeline mount/.test(l));
  const firstPlaying = lines.find((l) => /\] playing/.test(l));
  const tag = tagOf(firstMount ?? firstPlaying ?? lines[0] ?? '');
  const forTag = (re: RegExp) => lines.filter((l) => tagOf(l) === tag && re.test(l));
  const mountedForTag = forTag(/pipeline mount/).length > 0;
  const unmountsT = forTag(/pipeline unmount/);
  const endedT = forTag(/\] ended/);
  const firstDrawT = forTag(/first-draw/);

  const report = {
    project: info.project.name,
    firstTag: tag,
    gradedPipelinePath: mountedForTag,
    totalCrumbs: lines.length,
    mountsAll: lines.filter((l) => /pipeline mount/.test(l)).length,
    unmountsAll: lines.filter((l) => /pipeline unmount/.test(l)).length,
    firstCard: { ended: endedT.length, unmounts: unmountsT.length, firstDraw: firstDrawT.length },
    tail: lines.slice(-50),
  };
  await info.attach('home3-trace', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log(`[HOME3] ${JSON.stringify({ project: info.project.name, tag, pipeline: mountedForTag, ended: endedT.length, unmounts: unmountsT.length, firstDraw: firstDrawT.length, mountsAll: report.mountsAll, unmountsAll: report.unmountsAll })}`);

  // The video looped during the window (either path).
  expect(endedT.length, 'the video should have looped ≥2× during the capture').toBeGreaterThanOrEqual(2);
  // §A — whatever the path, the pipeline must NEVER tear down between loops (zero raw-frame teardown).
  // On the graded path this is the real test; on the CSS fallback it holds trivially (no pipeline).
  expect(unmountsT.length, 'HOME-3 §A — the pipeline must NOT unmount between loops (no raw-frame teardown)').toBe(0);
  expect(report.unmountsAll, 'HOME-3 §A — no pipeline unmount anywhere while cards stayed in view').toBe(0);
});
