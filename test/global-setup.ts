import { existsSync } from 'fs';
import { ensureFresh, DEFAULT_STATE, readState, assertNotForbiddenDid, assertHarnessIdentity } from './auth-store.mjs';

// Brief C3 → V1c §4 → U2 — auth preflight + shared-session refresh. ONE test/.auth/throwaway.json
// serves every CC window and every localhost port (test/auth-store.mjs): under a file lock, a token
// with < 10 min left is refreshed ONCE via Privy's public sessions API (V1c §4 — no browser), written
// back atomically only if the file still holds the token we read (compare-and-swap), and mirrored to
// every localhost origin. ≥ 10 min (inside Privy's rotation window) keeps test browsers from refreshing mid-run (an in-browser refresh
// rotates the single-use refresh token without writing it back — what burned the session in U2).
// A dead session fails LOUD before any test, with the login command.

type Entry = { name: string; value: string };
type State = { cookies: unknown[]; origins: { origin: string; localStorage: Entry[] }[] };

const unquote = (v: string | null | undefined): string | null => (v == null ? null : v.replace(/^"/, '').replace(/"$/, ''));

/** V1c §4 — mint a fresh access token from the stored refresh token (Privy public API). */
async function refreshViaPrivy(state: State, origin: string, sourceOrigin: string): Promise<State> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmfggbvdy013fl50ba827mw47';
  const o = state.origins.find((x) => x.origin === origin);
  if (!o) return state;
  const get = (name: string) => unquote(o.localStorage.find((e) => e.name === name)?.value);
  const refresh = get('privy:refresh_token');
  if (!refresh) return state;
  const access = get('privy:token');
  const caid = get('privy:caid'); // client-analytics id Privy ties the session to
  const res = await fetch('https://auth.privy.io/api/v1/sessions', {
    method: 'POST',
    headers: {
      'privy-app-id': appId,
      Origin: sourceOrigin, // REQUIRED, and must be an allowed origin — the one the session was minted on
      ...(caid ? { 'privy-ca-id': caid } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  const body = await res.text();
  if (!res.ok) { console.warn(`[auth] Privy refresh failed (${res.status}) ${body.slice(0, 200)}`); return state; }
  const j = JSON.parse(body) as { token?: string | null; refresh_token?: string | null; identity_token?: string | null; session_update_action?: string };
  if (!j?.token) { console.warn(`[auth] Privy refresh returned no token (keys: ${Object.keys(j).join(',')}; action: ${j.session_update_action ?? '-'})`); return state; }
  const set = (name: string, value: string) => {
    const v = JSON.stringify(value); // the app stores these JSON-quoted
    const e = o.localStorage.find((x) => x.name === name);
    if (e) e.value = v; else o.localStorage.push({ name, value: v });
  };
  set('privy:token', j.token);
  if (j.refresh_token) set('privy:refresh_token', j.refresh_token);
  if (j.identity_token) set('privy:id_token', j.identity_token);
  return state;
}

export default async function globalSetup() {
  const STATE = process.env.AUTH_STATE || DEFAULT_STATE;
  const BASE = process.env.BASE_URL || 'http://localhost:3000';
  // HARD RULE — never Eric. Offline DID check BEFORE the refresh (never rotate his tokens), full
  // DID+email check after. Outside the SKIP_AUTH_PREFLIGHT catch: nothing downgrades a refusal.
  if (existsSync(STATE)) assertNotForbiddenDid(readState(STATE), STATE);
  try {
    const line = await ensureFresh(STATE, BASE, refreshViaPrivy);
    // eslint-disable-next-line no-console
    console.log(`[auth] ${line}`);
  } catch (e) {
    // SKIP_AUTH_PREFLIGHT=1 (V1c) downgrades to a warning — ONLY for auth-free diagnostics; authed
    // tests will still hang on a dead session.
    if (process.env.SKIP_AUTH_PREFLIGHT !== '1') throw e;
    // eslint-disable-next-line no-console
    console.warn(`⚠ ${(e as Error).message}\n  (SKIP_AUTH_PREFLIGHT=1 — proceeding; authed tests WILL hang)`);
    return; // dead session: nothing to verify against Privy (and the offline DID check already ran)
  }
  // eslint-disable-next-line no-console
  console.log(`[auth] ${await assertHarnessIdentity(STATE, BASE)}`);
}
