import { defineConfig, devices } from '@playwright/test';

// ── Brief ARR-8 §1 — standalone config for the PRODUCTION reserved-route smoke ───────────────────
// Deliberately NO globalSetup and NO storageState: the smoke is logged-out and read-only, so it must
// not drag in the authed harness (whose preflight hard-fails against a non-localhost origin). Run:
//   BASE_URL=https://scopeapp.world npx playwright test -c playwright.arr8-smoke.config.ts
export default defineConfig({
  testDir: 'test',
  testMatch: /arr8-reserved-smoke\.spec\.ts/,
  timeout: 30_000,
  retries: 1, // a prod GET can blip; one retry keeps the smoke from flaking on a transient
  reporter: [['list']],
  use: { trace: 'off' },
  projects: [{ name: 'smoke', use: { ...devices['Desktop Chrome'] } }],
});
