import { test, expect } from '@playwright/test';
import { isSandboxUser, onrampModeFor, secretKeyFor } from '../src/lib/onramp/sandbox';
import { collectsFor, preselectAmount } from '../src/lib/onramp/topupMath';

// ── BAL-1b §3 — the server-decided sandbox gate (pure logic) ──────────────────────────────────────
test('listed username → test (case/space-insensitive)', () => {
  expect(onrampModeFor('EBERT', 'ebert,overtone')).toBe('test');
  expect(onrampModeFor('ebert', 'ebert,overtone')).toBe('test');
  expect(onrampModeFor('Overtone', '  ebert , overtone ')).toBe('test');
  expect(isSandboxUser('EBERT', 'ebert,overtone')).toBe(true);
});

test('unlisted / empty list / no username → live', () => {
  expect(onrampModeFor('alice', 'ebert,overtone')).toBe('live');
  expect(onrampModeFor('ebert', '')).toBe('live');
  expect(onrampModeFor('ebert', undefined)).toBe('live');
  expect(onrampModeFor(null, 'ebert')).toBe('live');
  expect(onrampModeFor('', 'ebert')).toBe('live');
});

// ── BAL-1b.1 §1/§2 — collect-count label + preselect ──────────────────────────────────────────────
test('collects label = floor(amount / buyQuote.usdAmount); no quote → no count', () => {
  expect(collectsFor(25, 3)).toBe(8);        // $25 of $3 collects → 8
  expect(collectsFor(10, 3)).toBe(3);
  expect(collectsFor(50, 3)).toBe(16);
  expect(collectsFor(25, null)).toBeNull();  // no live quote → no counts
  expect(collectsFor(25, 0)).toBeNull();
});

test('preselect covers the shortfall; over $50 → $50; none → $25', () => {
  expect(preselectAmount(4)).toBe(10);       // smallest covering $4
  expect(preselectAmount(12)).toBe(25);
  expect(preselectAmount(26)).toBe(50);
  expect(preselectAmount(73)).toBe(50);      // shortfall over $50 → $50
  expect(preselectAmount(null)).toBe(25);    // no shortfall → default
  expect(preselectAmount(0)).toBe(25);
});

test('missing test key → error, NEVER a live fall-through', () => {
  const r = secretKeyFor('test', { STRIPE_SECRET_KEY: 'sk_live_x' } as unknown as NodeJS.ProcessEnv);
  expect('error' in r).toBe(true);                       // sandbox user, no test key → hard error
  const r2 = secretKeyFor('test', { STRIPE_TEST_SECRET_KEY: 'sk_test_x' } as unknown as NodeJS.ProcessEnv);
  expect('key' in r2 && r2.key).toBe('sk_test_x');        // test key present → test key
  const r3 = secretKeyFor('live', { STRIPE_SECRET_KEY: 'sk_live_x' } as unknown as NodeJS.ProcessEnv);
  expect('key' in r3 && r3.key).toBe('sk_live_x');        // live mode → live key
});
