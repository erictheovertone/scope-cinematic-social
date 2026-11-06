import { defineConfig, devices } from '@playwright/test';

// ── VID-2b — standalone config for the resumable-upload spec ─────────────────────────────────────
// NO globalSetup / NO storageState: the spec drives /debug/upload (a synthetic file through the real
// uploadVideoToStream) with a MOCKED direct-upload route + a mock resumable tus server, so it needs
// no auth and no Cloudflare. Run against a local dev server:
//   BASE_URL=http://localhost:3100 npx playwright test -c playwright.vid2b.config.ts
export default defineConfig({
  testDir: 'test',
  testMatch: /vid2b-upload\.spec\.ts/,
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: process.env.BASE_URL || 'http://localhost:3100', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
