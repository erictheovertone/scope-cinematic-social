import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const STATE = process.env.AUTH_STATE || 'test/.auth/throwaway.json';

export default defineConfig({
  testDir: 'test',
  globalSetup: './test/global-setup.ts',
  testMatch: /h31-(proof|dryrun)\.spec\.ts/,
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: BASE_URL, storageState: STATE, trace: 'off', video: 'off' },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
  ],
});
