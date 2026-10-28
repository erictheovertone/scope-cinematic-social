import { test, expect, type Page } from '@playwright/test';

// ── Brief UPLOAD-STATE — "preparing" state after the video upload ──────────────
// After the TUS bytes reach 100% the overlay used to freeze on a static "100%" while Cloudflare
// encoded. It must instead show "Uploaded · Preparing your video" with an indeterminate indicator
// and an encode estimate, poll readyToStream, and complete.
//
// Real Cloudflare Stream can't run in-harness (no creds locally; the create-video/seam specs skip
// publish for the same reason), so the Stream + publish endpoints are route-mocked here — this is a
// deterministic test of the UI STATE MACHINE (100% → preparing → complete), not the Stream account.
// Needs the seam build + the localhost authed state:
//   BASE_URL=http://localhost:3000 AUTH_STATE=test/.auth/throwaway.json npm run create:login:test
//   NEXT_PUBLIC_TEST_SEAM=1 npm run build && NEXT_PUBLIC_TEST_SEAM=1 npm run start
//   BASE_URL=http://localhost:3000 AUTH_STATE=test/.auth/throwaway.json \
//     npx playwright test test/upload-state.spec.ts --project=iphone-webkit

async function mockPublish(page: Page) {
  // Stream direct-upload → a fake TUS endpoint we control.
  await page.route('**/api/stream/direct-upload', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'https://mock.tus.local/u/1', uid: 'mockuid-20s' }) }));
  // The fake TUS endpoint: HEAD → offset 0; PATCH → ack the whole file at once (offset jumps past
  // the size so uploadVideoToStream's loop ends and reports 100%).
  await page.route('https://mock.tus.local/**', (r) => {
    const m = r.request().method();
    if (m === 'HEAD') return r.fulfill({ status: 200, headers: { 'Upload-Offset': '0', 'Tus-Resumable': '1.0.0' } });
    return r.fulfill({ status: 204, headers: { 'Upload-Offset': '999999999', 'Tus-Resumable': '1.0.0' } });
  });
  // readyToStream poll → ready on the first probe.
  await page.route('**/api/stream/check', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ready' }) }));
  // createPost insert (.select().single() → one object). Only the INSERT; reads pass through.
  await page.route('**/rest/v1/posts**', (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'mock-post-1', media_urls: [], media_type: 'video', username: 'OVERTONE', caption: '', layout_id: 'scope', video_status: 'processing', stream_uid: 'mockuid-20s', created_at: new Date().toISOString() }) });
  });
  // Keep the best-effort poster bake off real storage (it's caught if it fails).
  await page.route('**/storage/v1/object/**', (r) => {
    const m = r.request().method();
    if (m === 'POST' || m === 'PUT') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'post-media/mock.jpg' }) });
    return r.continue();
  });
  await page.route('**/api/renditions', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], flagged: false }) }));
}

// DOM-driven (console.* is stripped in the production/seam build, so the [crop]/[finish] traces
// never fire — wait on the real UI like create-v3 does).
async function driveVideoToEdit(page: Page) {
  await page.goto('/create');
  const enter = page.getByRole('button', { name: /^ENTER$/ });
  if (await enter.count()) await enter.first().click({ timeout: 3000 }).catch(() => {});
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { __scopeInjectMedia?: unknown }).__scopeInjectMedia === 'function'), { timeout: 15_000 })
    .toBeTruthy();
  await page.evaluate(() => (window as unknown as { __scopeInjectMedia: (t: string, u: string) => Promise<void> }).__scopeInjectMedia('video', '/welcome-to-pro-new-ani.mp4'));
  await page.getByRole('button', { name: 'Next' }).first().click();
  const confirm = page.getByRole('button', { name: /^Confirm$/i }).first();
  await expect(confirm).toBeVisible({ timeout: 45_000 });     // CROP open
  await confirm.click();
  const done = page.getByRole('button', { name: /^done$/i }).first();
  await expect(done).toBeVisible({ timeout: 30_000 });        // FINISHING
  await done.click();
  await page.waitForTimeout(1500);                            // EDIT & POST settles
}

test('upload-state — 100% gives way to a preparing state, then completes', async ({ page }) => {
  await mockPublish(page);
  await driveVideoToEdit(page);

  // EDIT & POST → the deck step, then publish (Skip = no deck).
  await page.getByRole('button', { name: /^Next$/ }).first().click();
  await page.getByRole('button', { name: /^Skip$/ }).first().click();

  // The state change: the overlay shows the "preparing" state (never a frozen static 100%).
  const preparing = page.locator('[data-upload-preparing]');
  await expect(preparing).toBeVisible({ timeout: 15_000 });
  await expect(preparing.getByText(/preparing your video/i)).toBeVisible();
  await expect(preparing.getByText(/this usually takes/i)).toBeVisible(); // the encode estimate
  // The big static "100%" counter is NOT what's showing.
  await expect(page.getByText('100', { exact: true })).toHaveCount(0);

  // It completes: readyToStream (mocked ready) resolves the poll and the mint prompt appears.
  await expect(page.getByText(/mint this post to base/i)).toBeVisible({ timeout: 15_000 });
  await expect(preparing).toHaveCount(0);
});
