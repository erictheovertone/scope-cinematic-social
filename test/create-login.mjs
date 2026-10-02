// Brief C2 §0 — LOGIN ONCE. Eric runs this a single time; it opens a real browser at the app,
// waits for a successful Privy login, then saves the session to test/.auth/state.json (gitignored)
// so every harness run reuses it. Usage:  BASE_URL=https://<deploy> node test/create-login.mjs
import { webkit } from '@playwright/test';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const STATE = process.env.AUTH_STATE || 'test/.auth/state.json'; // C2c §3 — throwaway via AUTH_STATE
mkdirSync(dirname(STATE), { recursive: true });

const browser = await webkit.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE_URL + '/welcome');

console.log('\n▶ Log in with Privy in the opened window. Waiting for authentication…\n');
// Authenticated → the app leaves /welcome for the feed/home (or /transition). Poll generously.
try {
  await page.waitForFunction(() => !location.pathname.startsWith('/welcome'), null, { timeout: 300_000 });
  await page.waitForTimeout(2500); // let Privy finish writing its storage
  await ctx.storageState({ path: STATE });
  console.log('✓ session saved →', STATE);
} catch {
  console.error('✗ timed out waiting for login — nothing saved.');
}
await browser.close();
process.exit(0);
