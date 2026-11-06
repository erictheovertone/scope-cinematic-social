import { test, expect } from '@playwright/test';

// ── VID-2b §5 — resumable upload, proven deterministically ───────────────────────────────────────
// Drives the REAL uploadVideoToStream() (via /debug/upload) against a MOCKED direct-upload route and a
// mock RESUMABLE tus server, so it needs no auth and no Cloudflare. The mock tracks offset per upload
// URL and mints a UNIQUE url per create call — so a reload that RE-MINTS (offset 0) is distinguishable
// from one that RESUMES the stored url (offset > 0).
//   BASE_URL=http://localhost:3100 npx playwright test -c playwright.vid2b.config.ts
const TOTAL = 60 * 1024 * 1024;

type Mock = { offsets: Map<string, number>; patchStarts: number[]; mints: number; net: { offline: boolean }; countAfter: { on: boolean; starts: number[] } };

async function installMock(context: import('@playwright/test').BrowserContext, base: string, tag: string): Promise<Mock> {
  const m: Mock = { offsets: new Map(), patchStarts: [], mints: 0, net: { offline: false }, countAfter: { on: false, starts: [] } };
  await context.route('**/api/stream/direct-upload', (route) => {
    m.mints++;
    const url = new URL(`/__tus__/${tag}${m.mints}`, base).toString();
    m.offsets.set(url, 0);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: url, uid: `uid-${tag}` }) });
  });
  await context.route('**/__tus__/**', (route) => {
    const req = route.request();
    if (m.net.offline) return route.abort('internetdisconnected'); // simulate a dropped connection
    const url = req.url();
    const method = req.method();
    if (method === 'HEAD') {
      return route.fulfill({ status: 200, headers: { 'Upload-Offset': String(m.offsets.get(url) ?? 0), 'Upload-Length': String(TOTAL), 'Tus-Resumable': '1.0.0' } });
    }
    if (method === 'PATCH') {
      const start = Number(req.headers()['upload-offset'] ?? 0);
      m.patchStarts.push(start);
      if (m.countAfter.on) m.countAfter.starts.push(start);
      const len = req.postDataBuffer()?.length ?? 0;
      const next = Math.min(TOTAL, start + len);
      m.offsets.set(url, next);
      return route.fulfill({ status: 204, headers: { 'Upload-Offset': String(next), 'Tus-Resumable': '1.0.0' } });
    }
    return route.fulfill({ status: 204, headers: { 'Tus-Resumable': '1.0.0' } });
  });
  return m;
}

declare global { interface Window { __upload?: { pct: number; state: string; uid: string } } }

test('resumes after a mid-upload network drop — same URL, offset > 0, no restart', async ({ page, context, baseURL }) => {
  const base = baseURL || 'http://localhost:3100';
  const m = await installMock(context, base, 'drop');

  await page.goto(`${base}/debug/upload?debug=video&mb=60`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.__upload?.pct ?? 0) >= 25, undefined, { timeout: 30_000 });

  m.net.offline = true;              // drop the connection mid-upload
  await page.waitForTimeout(5000);
  m.net.offline = false;            // back online → tus backoff resumes from the server offset

  await page.waitForFunction(() => window.__upload?.state === 'done', undefined, { timeout: 60_000 });
  const res = await page.evaluate(() => window.__upload);
  expect(res?.uid).toBe('uid-drop');
  expect(res?.state).toBe('done');

  expect(m.mints, 'only ONE upload URL minted (no fresh restart)').toBe(1);
  expect(Math.max(...m.patchStarts), 'PATCH resumed well past byte 0 after the drop').toBeGreaterThan(TOTAL * 0.2);
  // never restarted from 0 after making progress
  let seenProgress = false, reset = false;
  for (const s of m.patchStarts) { if (s > 0) seenProgress = true; if (seenProgress && s === 0) reset = true; }
  expect(reset, 'never restarted from byte 0 after progress').toBe(false);
});

test('resumes from the stored URL after a page reload', async ({ page, context, baseURL }) => {
  const base = baseURL || 'http://localhost:3100';
  const m = await installMock(context, base, 'reload');

  await page.goto(`${base}/debug/upload?debug=video&mb=60`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.__upload?.pct ?? 0) >= 25, undefined, { timeout: 30_000 });

  m.countAfter.on = true;          // count PATCH offsets issued AFTER the reload
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => window.__upload?.state === 'done', undefined, { timeout: 60_000 });
  expect(m.mints, 'reload reused the STORED url (did NOT mint a second)').toBe(1);
  expect(m.countAfter.starts.length, 'PATCHes continued after reload').toBeGreaterThan(0);
  expect(Math.min(...m.countAfter.starts), 'after reload, PATCH resumed from offset > 0').toBeGreaterThan(0);
});
