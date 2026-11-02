import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// ── Brief ARR-8 §2 — the 4-screen intro runs on phone for BOTH entry points ─────────────────────
// Plain /welcome AND Arrival sign-ups both route a fresh (no-username) phone account through
// /profile/setup, so the intro is now the FIRST step there (order: intro → setup → grid → land).
// Arrival sign-ups used to skip it (they land on the creator's profile, which never rendered the
// intro). This asserts the intro shows at setup entry, ADVANCES (screen 1), and dismisses to setup.
const OUT = join(process.cwd(), 'test/shots-arr8');
mkdirSync(OUT, { recursive: true });

async function clearOnboarded(page: Page) {
  await page.addInitScript(() => {
    try { Object.keys(localStorage).filter((k) => k.startsWith('scope_onboarded_')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
  });
}

test('ARR-8 §2 — intro runs at /profile/setup entry on phone, advances, then setup follows', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone-webkit', 'phone-only — the 4-screen intro is the mobile flow');
  await clearOnboarded(page);
  await page.goto('/profile/setup', { waitUntil: 'domcontentloaded' });

  // Screen 0 — the intro is up BEFORE the setup form.
  await expect(page.getByText(/CINEMA/i).first(), 'the intro must show before setup').toBeVisible({ timeout: 12_000 });
  await page.getByTestId("onboarding-intro").screenshot({ path: join(OUT, `intro-${info.project.name}.png`) });

  // NEXT advances to screen 1 ("YOU HAVE A WALLET") — the intro is interactive, en route to setup.
  await page.getByRole('button', { name: 'NEXT', exact: true }).first().click();
  await expect(page.getByText(/WALLET/i).first(), 'NEXT advances the intro').toBeVisible({ timeout: 6000 });

  // SKIP dismisses the intro → the setup form behind it is revealed.
  await page.getByRole("button", { name: "SKIP", exact: true }).first().click();
  await page.waitForTimeout(700);
  await expect(page.getByText(/Set up your profile/i).first(), "setup form follows the intro").toBeVisible({ timeout: 8000 });
});
