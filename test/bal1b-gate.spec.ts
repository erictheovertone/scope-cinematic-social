import { test, expect } from '@playwright/test';
import { isSandboxUser, onrampModeFor, secretKeyFor } from '../src/lib/onramp/sandbox';

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

test('missing test key → error, NEVER a live fall-through', () => {
  const r = secretKeyFor('test', { STRIPE_SECRET_KEY: 'sk_live_x' } as unknown as NodeJS.ProcessEnv);
  expect('error' in r).toBe(true);                       // sandbox user, no test key → hard error
  const r2 = secretKeyFor('test', { STRIPE_TEST_SECRET_KEY: 'sk_test_x' } as unknown as NodeJS.ProcessEnv);
  expect('key' in r2 && r2.key).toBe('sk_test_x');        // test key present → test key
  const r3 = secretKeyFor('live', { STRIPE_SECRET_KEY: 'sk_live_x' } as unknown as NodeJS.ProcessEnv);
  expect('key' in r3 && r3.key).toBe('sk_live_x');        // live mode → live key
});
