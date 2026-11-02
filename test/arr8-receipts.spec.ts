import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// ── Brief ARR-8 — receipts for §4 (collect-sheet media) + §5 (Arrival header brass) ─────────────
const OUT = join(process.cwd(), 'test/shots-arr8');
mkdirSync(OUT, { recursive: true });
const THEMES = ['light', 'dark'] as const;
async function boot(page: Page, t: string) { await page.addInitScript((x) => { try { localStorage.setItem('scope.theme', x); } catch { /* */ } }, t); }

const VIDEO_POST = '4e38c309-7f99-4048-8102-349d2dff31e2'; // OVERTONE — coined VIDEO (Stream)
const IMAGE_POST = 'd72db111-8ac2-4496-90a3-8e9b8e466fcd'; // EBERT — coined IMAGE

// §5 — the ARRIVAL header brass (logged-OUT; an authed viewer is redirected to the normal profile).
test.describe('ARR-8 §5 — Arrival header brass', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const theme of THEMES) {
    test(`arrival header — ${theme}`, async ({ page }, info) => {
      await boot(page, theme);
      await page.goto('/arrival?u=overtone', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: join(OUT, `arr-header-${theme}-${info.project.name}.png`) });
    });
  }
});

// §4 — collect-sheet media (authed; opens the sheet off a coined post).
test.describe('ARR-8 §4 — collect-sheet media', () => {
  for (const theme of THEMES) {
    test(`collect media — ${theme}`, async ({ page }, info) => {
      for (const [label, id] of [['video', VIDEO_POST], ['image', IMAGE_POST]] as const) {
        await boot(page, theme);
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3500);
        await page.evaluate((pid) => window.dispatchEvent(new CustomEvent('scope:open-post', { detail: { postId: pid } })), id);
        await page.waitForTimeout(2800);
        const collect = page.getByRole('button', { name: 'COLLECT', exact: true }).first();
        if (!(await collect.count())) { console.warn(`[arr8] no COLLECT for ${label}`); continue; }
        await collect.scrollIntoViewIfNeeded();
        await collect.click({ force: true });
        // Wait for the V2 sheet (its BUY/currency controls) to mount over the post.
        await page.waitForTimeout(3200);
        await page.screenshot({ path: join(OUT, `collect-${label}-${theme}-${info.project.name}.png`) });
      }
    });
  }
});
