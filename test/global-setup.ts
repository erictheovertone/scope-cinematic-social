import { readFileSync, writeFileSync, existsSync } from 'fs';

// Brief C3 — auth-freshness preflight. The create harness silently hung for a whole
// session because the stored session was localhost-scoped AND its Privy token had
// expired (→ finishCtx never resolved → the cropper never opened). Fail LOUD here,
// before any test, with the exact fix, instead of a mystery 20s crop timeout.
//
// Brief V1c §4 — SELF-REFRESH. The stored session also carries Privy's refresh token.
// When the access token is within 10 min of expiry (or already expired), we mint a
// fresh one via Privy's public API and write it back to the state file — so Eric logs
// in once a day at most, not once an hour. Falls back to the loud throw if the refresh
// token is itself dead.

const unquote = (v: string | null | undefined): string | null =>
  v == null ? null : v.replace(/^"/, '').replace(/"$/, '');

type State = { origins?: { origin: string; localStorage?: { name: string; value: string }[] }[] };

function readLocal(state: State, origin: string, name: string): string | null {
  const o = (state.origins ?? []).find((x) => x.origin === origin);
  return unquote(o?.localStorage?.find((e) => e.name === name)?.value);
}
function writeLocal(state: State, origin: string, name: string, value: string): void {
  const o = (state.origins ?? []).find((x) => x.origin === origin);
  if (!o) return;
  const arr = (o.localStorage ??= []);
  const e = arr.find((x) => x.name === name);
  const v = JSON.stringify(value); // the app stores these JSON-quoted
  if (e) e.value = v; else arr.push({ name, value: v });
}
function tokenExp(jwtQuoted: string | null): number | null {
  const t = unquote(jwtQuoted);
  if (!t) return null;
  try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()).exp ?? null; } catch { return null; }
}

// Mint a fresh access token from Privy's refresh token. Returns true on success
// (state file rewritten in place). Never throws — the caller decides what to do.
async function refreshPrivySession(statePath: string, origin: string): Promise<boolean> {
  try {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmfggbvdy013fl50ba827mw47';
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as State;
    const refresh = readLocal(state, origin, 'privy:refresh_token');
    const access = readLocal(state, origin, 'privy:token');
    const caid = readLocal(state, origin, 'privy:caid'); // client-analytics id Privy ties the session to
    if (!refresh) return false;
    const res = await fetch('https://auth.privy.io/api/v1/sessions', {
      method: 'POST',
      headers: {
        'privy-app-id': appId,
        Origin: origin, // REQUIRED — Privy rejects with missing_origin otherwise
        ...(caid ? { 'privy-ca-id': caid } : {}),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) { console.warn(`[auth-preflight] Privy refresh failed (${res.status})`); return false; }
    const j = (await res.json()) as { token?: string; refresh_token?: string; identity_token?: string };
    if (!j?.token) return false;
    writeLocal(state, origin, 'privy:token', j.token);
    if (j.refresh_token) writeLocal(state, origin, 'privy:refresh_token', j.refresh_token);
    if (j.identity_token) writeLocal(state, origin, 'privy:id_token', j.identity_token);
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    return true;
  } catch (e) {
    console.warn('[auth-preflight] Privy refresh error:', (e as Error)?.message);
    return false;
  }
}

export default async function globalSetup() {
  const STATE = process.env.AUTH_STATE || 'test/.auth/state.json';
  const BASE = process.env.BASE_URL || 'http://localhost:3000';
  const baseOrigin = new URL(BASE).origin;
  const fix = `re-run:  BASE_URL=${BASE} ${process.env.AUTH_STATE ? `AUTH_STATE=${STATE} ` : ''}npm run create:login${process.env.AUTH_STATE ? ':test' : ''}`;

  if (!existsSync(STATE)) {
    throw new Error(`[auth-preflight] missing ${STATE}\n  ${fix}`);
  }
  let s = JSON.parse(readFileSync(STATE, 'utf8')) as State;
  const origins = (s.origins ?? []).map((o) => o.origin);
  if (!origins.includes(baseOrigin)) {
    throw new Error(`[auth-preflight] ${STATE} has no session for ${baseOrigin} (has: ${origins.join(', ') || 'none'})\n  A localhost session will NOT authenticate against prod.\n  ${fix}`);
  }

  const now = Math.floor(Date.now() / 1000);
  let exp = tokenExp(readLocal(s, baseOrigin, 'privy:token'));

  // V1c §4 — refresh when the token is within 10 min of expiry (or already expired).
  if (exp == null || exp - now < 600) {
    const ok = await refreshPrivySession(STATE, baseOrigin);
    if (ok) {
      s = JSON.parse(readFileSync(STATE, 'utf8')) as State; // re-read the rewritten file
      exp = tokenExp(readLocal(s, baseOrigin, 'privy:token'));
      // eslint-disable-next-line no-console
      console.log(`[auth-preflight] token auto-refreshed via Privy${exp != null ? `, now valid ${Math.round((exp - now) / 60)}min` : ''}`);
    }
  }

  if (exp != null && exp < now) {
    // SKIP_AUTH_PREFLIGHT=1 downgrades the expired-token throw to a warning — ONLY for
    // auth-free diagnostics (e.g. V1b's seam-inject decoder-count test, which never
    // needs a profile). The authed tests (crop/finishing) will still hang on a stale
    // token, so this is not a substitute for `create:login:test`.
    const msg = `[auth-preflight] Privy token in ${STATE} expired ${Math.round((now - exp) / 3600)}h ago (${new Date(exp * 1000).toISOString()}) and auto-refresh did not succeed\n  ${fix}`;
    if (process.env.SKIP_AUTH_PREFLIGHT === '1') {
      // eslint-disable-next-line no-console
      console.warn(`⚠ ${msg}\n  (SKIP_AUTH_PREFLIGHT=1 — proceeding; authed tests WILL hang)`);
    } else {
      throw new Error(msg);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[auth-preflight] ok — ${baseOrigin}${exp != null ? `, token valid ${Math.round((exp - now) / 60)}min` : ' (no privy:token exp found — proceeding)'}`);
}
