import { defineConfig } from '@playwright/test';
// Pure-logic gate test — no globalSetup (no auth), no browser needed.
export default defineConfig({ testDir: './test', testMatch: /bal1b-gate\.spec\.ts/, fullyParallel: true, reporter: 'list' });
