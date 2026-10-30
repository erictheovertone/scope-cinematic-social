// ── BRIEF MUS-1 + AUG-1 — screenshot gates (375 · 1440 × dark · light) ──────────────────────────
// TEST ACCOUNT ONLY. MUS-1: track view · composer page · manage · bio-sheet Music.
// AUG-1: upsell (as a free member) · then, with the test account set Augmented for the shot only,
// profile · bio sheet · Arrival card (anonymous) · post-row chip. Restores the account to free.
//   BASE_URL=http://localhost:3000 AUTH_STATE=<shared throwaway.json> npx playwright test test/mus-aug-shots.spec.ts --workers=1
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import { IDS, ALBUM_TITLE, db, me, seed, teardown, resetMembership } from './mus-aug-harness';

const OUT = 'test/shots-mus-aug';
mkdirSync(OUT, { recursive: true });
const THEMES = ['dark', 'light'] as const;

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000); // four surfaces per test on 3× WebKit
test.beforeAll(async () => { await seed(); await resetMembership(); });
test.afterAll(async () => { if (process.env.MUS_KEEP !== '1') await teardown(); });

async function themed(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => { try { localStorage.setItem('scope.theme', t); } catch { /* */ } }, theme);
}
const shot = (page: Page, project: string, theme: string, name: string) =>
  page.screenshot({ path: `${OUT}/${project}-${theme}-${name}.png`, fullPage: false });

async function setAugmented(on: boolean) {
  const m = await me();
  await db.from('profiles').update(on
    ? { membership_tier: 'augmented', paid_member_until: new Date(Date.now() + 30 * 86_400_000).toISOString(), augmented_since: new Date().toISOString() }
    : { membership_tier: 'free', paid_member_until: null, augmented_since: null }).eq('user_id', m.userId);
}

for (const theme of THEMES) {
  test(`MUS-1 shots · ${theme}`, async ({ page }, info) => {
    const p = info.project.name;
    const m = await me();
    await themed(page, theme);
    await page.goto(`/track/${IDS.tracks[0]}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('track-view').filter({ hasText: 'Harness Ember' }).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await shot(page, p, theme, 'track-view');

    await page.goto(`/composer/${m.username}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(ALBUM_TITLE).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await shot(page, p, theme, 'composer');

    await page.goto(`/composer/${m.username}/manage`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/manage music/i).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await shot(page, p, theme, 'manage');

    await page.goto('/profile', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /profile info/i }).first().click({ timeout: 20_000 });
    const music = page.getByTestId('bio-music');
    await expect(music).toBeVisible({ timeout: 15_000 });
    await music.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await shot(page, p, theme, 'bio-music');
  });

  test(`AUG-1 shots · ${theme}`, async ({ page, browser }, info) => {
    const p = info.project.name;
    const m = await me();
    await themed(page, theme);

    // upsell — as a free member, from a Download tap
    await setAugmented(false);
    await page.goto(`/track/${IDS.tracks[0]}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('track-download').click({ timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: 'Augmented Pro' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(700);
    await shot(page, p, theme, 'upsell');

    // brass — the test account set Augmented for these shots only
    await setAugmented(true);
    try {
      await page.goto('/profile', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('augmented-tag').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('brass-frame').first()).toBeVisible();
      await page.waitForTimeout(800);
      await shot(page, p, theme, 'profile');

      await page.getByRole('button', { name: /profile info/i }).first().click();
      await expect(page.getByTestId('brass-aperture').first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(600);
      await shot(page, p, theme, 'bio-sheet');
      await page.keyboard.press('Escape').catch(() => {});

      // post-row chip — the test account's own post in the unified post lightbox (author byline)
      const { data: post } = await db.from('posts').select('id').eq('user_id', m.userId).eq('is_deleted', false).limit(1).single();
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.evaluate((id) => window.dispatchEvent(new CustomEvent('scope:open-post', { detail: { postId: id } })), post!.id);
      await expect(page.getByTestId('augmented-chip').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await shot(page, p, theme, 'post-chip');

      // Arrival — anonymous visitor
      const anon = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
      const ap = await anon.newPage();
      await ap.addInitScript((t) => { try { localStorage.setItem('scope.theme', t); } catch { /* */ } }, theme);
      await ap.goto(`/${m.username}`);
      await ap.getByRole('button').filter({ hasText: /log in|sign up|join/i }).first().waitFor({ timeout: 20_000 }).catch(() => {});
      await ap.mouse.click(200, 300).catch(() => {}); // tap-to-reveal the card (ARR-4)
      await expect(ap.getByTestId('augmented-tag').first()).toBeVisible({ timeout: 15_000 });
      await ap.waitForTimeout(700);
      await ap.screenshot({ path: `${OUT}/${p}-${theme}-arrival.png` });
      await anon.close();
    } finally {
      await setAugmented(false);
    }
  });
}
