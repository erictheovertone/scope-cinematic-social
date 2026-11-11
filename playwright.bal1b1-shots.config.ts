import { defineConfig } from '@playwright/test';

// BAL-1b.1 review shots — anonymous (no auth, no shared Privy session touched). The spec creates its
// own contexts (viewport/theme/scale) and drives the REAL components via the gated /debug/topup&shots
// harness. Point BASE_URL at a local production server (default :3010).
export default defineConfig({
  testDir: './test',
  testMatch: /bal1b1-shots\.spec\.ts/,
  timeout: 120_000,
  reporter: [['list']],
  use: { baseURL: process.env.BASE_URL || 'http://localhost:3010', trace: 'off' },
});
