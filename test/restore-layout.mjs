// Brief C2 §0 — restore the signed-in user's grid layout after a mutating matrix run.
// The create-matrix sweep cycles profile aspect_ratio through 5 values; this sets it back.
// Usage:  BASE_URL=https://<deploy> LAYOUT_LABEL='1X SCOPE' node test/restore-layout.mjs
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const STATE = process.env.AUTH_STATE || 'test/.auth/state.json';
const LABEL = process.env.LAYOUT_LABEL || '1X SCOPE';

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await page.goto(BASE_URL + '/profile/grid-layout');
  await page.getByText(LABEL, { exact: true }).first().click({ timeout: 10_000 });
  await page.getByRole('button', { name: /^confirm$/i }).first().click({ timeout: 10_000 });
  await page.waitForTimeout(2500); // let the save + any WelcomeTransition settle
  console.log('✓ restored layout →', LABEL);
} catch (e) {
  console.error('✗ restore failed:', e?.message || e, '\n  → set it manually: /profile/grid-layout → 1X SCOPE → CONFIRM');
}
await browser.close();
process.exit(0);
