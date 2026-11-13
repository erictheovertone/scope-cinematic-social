import { test, expect } from '@playwright/test';
import { join } from 'path';
import { existsSync } from 'fs';

// HOME-3.1 Part B — prove the DRY RUN. Drives the create flow to EDIT & POST with ?debug=video and an
// injected video; the dry-run effect then runs the still bake once (no upload) and ships
// still_bake{dryRun:true}. We only need to REACH edit & post and dwell; the funnel_events row is checked
// out-of-band (Supabase) by the agent after this run.

test('HOME-3.1 §B — dry-run still_bake fires at EDIT & POST under video debug', async ({ page }) => {
  const url = existsSync(join(process.cwd(), 'public/test-fixtures/v-20s.mp4')) ? '/test-fixtures/v-20s.mp4' : null;
  test.skip(!url, 'no v-20s.mp4 fixture');

  const posts: string[] = [];
  page.on('console', (m) => { const t = m.text(); if (/still_bake|\[handlePost\]|dryRun/i.test(t)) posts.push(t); });
  page.on('requestfinished', (req) => { if (req.url().includes('/api/funnel')) posts.push(`FUNNEL ${req.method()} ${new Date().toISOString()}`); });

  await page.goto('/create?debug=video', { waitUntil: 'domcontentloaded' });
  const enter = page.getByRole('button', { name: /^ENTER$/ });
  if (await enter.count()) await enter.first().click({ timeout: 3000 }).catch(() => {});
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __scopeInjectMedia?: unknown }).__scopeInjectMedia === 'function'), { timeout: 15_000 }).toBeTruthy();

  await page.evaluate((u) => (window as unknown as { __scopeInjectMedia: (t: string, u: string) => Promise<void> }).__scopeInjectMedia('video', u as string), url);
  await page.getByRole('button', { name: 'Next' }).first().click();
  await expect(page.getByRole('button', { name: /^Confirm$/i }).first()).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Confirm$/i }).first().evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator('[data-testid="finishing-step"]')).toBeVisible({ timeout: 45_000 });
  const done = page.getByRole('button', { name: /^done$/i }).first();
  await done.waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {});
  await done.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
  const reached = await page.getByText(/edit & post/i).first().waitFor({ state: 'visible', timeout: 25_000 }).then(() => true).catch(() => false);
  // Let the dry-run effect fire + the bake run + the funnel POST land.
  await page.waitForTimeout(8000);

  console.log(`[H31-DRY] reachedEditPost=${reached} · signals=${JSON.stringify(posts.slice(-8))}`);
  expect(reached, 'should reach EDIT & POST').toBeTruthy();
  expect(posts.some((l) => l.startsWith('FUNNEL')), 'a /api/funnel POST should fire (the still_bake dry-run)').toBeTruthy();
});
