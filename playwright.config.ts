import { defineConfig, devices } from '@playwright/test';

// Brief C2 §0 — the create-pipeline harness. Two device profiles; both reuse a stored Privy
// session (test/.auth/state.json, gitignored) saved once by `npm run create:login`. Point
// BASE_URL at the deploy under test (default = local dev on :3000).
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
// AUTH_STATE lets the matrix run against a DEDICATED throwaway account (C2c §3) so tests never
// touch a real profile. Default = the primary saved session.
const STATE = process.env.AUTH_STATE || 'test/.auth/state.json';

export default defineConfig({
  testDir: 'test',
  testMatch: /create-matrix\.spec\.ts/,
  timeout: 120_000,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'test/.report', open: 'never' }]],
  use: { baseURL: BASE_URL, storageState: STATE, trace: 'on', video: 'off' },
  projects: [
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, defaultBrowserType: 'webkit' },
    },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
