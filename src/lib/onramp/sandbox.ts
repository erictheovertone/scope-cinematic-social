// ── onramp sandbox gate (BAL-1b §3) — the mode is decided on the SERVER, never from the request ───
// A verified caller whose username is in ONRAMP_SANDBOX_USERS (comma list, case-insensitive) gets a
// Stripe TEST session; everyone else gets LIVE. Pure + unit-tested; the route resolves the username.

export type OnrampMode = 'test' | 'live';

/** Is this username in the sandbox allowlist? Case-insensitive, whitespace-tolerant. */
export function isSandboxUser(username: string | null | undefined, list: string | null | undefined): boolean {
  const u = (username ?? '').trim().toLowerCase();
  if (!u) return false;
  return (list ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(u);
}

/** The mode for a caller. */
export function onrampModeFor(username: string | null | undefined, list: string | null | undefined): OnrampMode {
  return isSandboxUser(username, list) ? 'test' : 'live';
}

/** Resolve the Stripe SECRET key for a mode from env. Returns `{ key }` or `{ error }` — a sandbox
 *  user with no test key is a hard error (a clear message), NEVER a fall-through to the live key. */
export function secretKeyFor(mode: OnrampMode, env: NodeJS.ProcessEnv): { key: string } | { error: string } {
  if (mode === 'test') {
    const key = env.STRIPE_TEST_SECRET_KEY;
    if (!key) return { error: 'Sandbox is enabled for your account but test payments are not configured yet. No live charge was attempted.' };
    return { key };
  }
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return { error: 'Payments are not configured.' };
  return { key };
}
