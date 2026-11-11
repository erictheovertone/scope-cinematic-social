import { defineConfig, devices } from '@playwright/test';

// HOME-3 verify config — runs ONLY test/home3-verify.spec.ts (the default config's testMatch
// excludes it). Same auth + projects as playwright.config.ts.
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const STATE = process.env.AUTH_STATE || 'test/.auth/throwaway.json';

export default defineConfig({
  testDir: 'test',
  globalSetup: './test/global-setup.ts',
  testMatch: /home3-verify\.spec\.ts/,
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: BASE_URL, storageState: STATE, trace: 'off', video: 'off' },
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
