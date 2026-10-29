// ── ONE shared harness session (Brief U2 harness) ──────────────────────────────────────────────
// Every CC window and every local port reads the same test/.auth/throwaway.json. Privy refresh
// tokens are SINGLE-USE: two runs refreshing the same file each burn it for the other (the dead
// session that blocked U2). So:
//   • withLock()      — an exclusive mkdir lock beside the file (atomic on every fs; stale after 3 min).
//   • ensureFresh()   — under the lock: re-read, and refresh only if the token on disk is still the one
//                       we read (compare-and-swap); write atomically (tmp + rename); release.
//   • mirror          — localStorage is per ORIGIN (:3000 ≠ :3100), so every write copies the session
//                       into every localhost origin in the file + the run's own. Privy's cookies are
//                       host-scoped (localhost, any port) and already shared.
// The refresh leaves the access token with ≥ MIN_VALID_MIN of life, so test browsers never refresh
// mid-run (an in-browser refresh rotates the refresh token without writing it back — the old bug).
import { readFileSync, writeFileSync, renameSync, mkdirSync, rmdirSync, statSync, existsSync } from 'fs';
import { dirname } from 'path';

export const DEFAULT_STATE = 'test/.auth/throwaway.json';
// Privy's sessions API only rotates a token near expiry (it hands back the SAME token while it has
// more life than that) — so the floor sits inside Privy's window. A matrix run is ~1 min; ≥ 10 min
// keeps test browsers clear of the SDK's own refresh for any normal run.
export const MIN_VALID_MIN = 10;
const LOCK_STALE_MS = 3 * 60_000;
const LOCK_WAIT_MS = 4 * 60_000;

const isLocalhost = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

export function readState(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ── HARD RULE: the harness never runs as Eric ────────────────────────────────────────────────────
// Refused by DID (offline, from every stored token) and by email (Privy users/me — the stored tokens
// carry only the DID). No env override: a refusal means log in as the test account instead.
export const FORBIDDEN_DIDS = ['did:privy:cmhjqhry90120kz0ddgzkir25'];
export const FORBIDDEN_EMAILS = ['eric@muon.film'];
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmfggbvdy013fl50ba827mw47';

const jwtSub = (v) => { try { return JSON.parse(Buffer.from(String(v).replace(/^"|"$/g, '').split('.')[1], 'base64url').toString()).sub ?? null; } catch { return null; } };

function refuse(path, why) {
  const bar = '█'.repeat(78);
  return new Error(`\n${bar}\n[auth] REFUSED — ${why}\n  ${path} is Eric's session. The harness NEVER runs against eric@muon.film.\n  Log in as the TEST account:  BASE_URL=http://localhost:3000 AUTH_STATE=${path} npm run create:login:test\n${bar}`);
}

/** Every Privy DID the state could authenticate as (localStorage tokens on any origin + the cookie). */
export function didsOf(state) {
  const out = new Set();
  for (const o of state.origins ?? []) for (const e of o.localStorage ?? []) if (e.name === 'privy:token' || e.name === 'privy:id_token') { const s = jwtSub(e.value); if (s) out.add(s); }
  for (const c of state.cookies ?? []) if (/^privy-(token|id-token)$/.test(c.name)) { const s = jwtSub(c.value); if (s) out.add(s); }
  return [...out];
}

/** Offline check — throws if any token in the state belongs to a forbidden DID. */
export function assertNotForbiddenDid(state, path) {
  const hit = didsOf(state).find((d) => FORBIDDEN_DIDS.includes(d));
  if (hit) throw refuse(path, `Privy DID ${hit}`);
}

/**
 * Full check — DID offline, then the account's linked emails from Privy. Fails CLOSED: if Privy can't
 * confirm who the session is, nothing runs. Returns a status line for the run log.
 */
export async function assertHarnessIdentity(path, base) {
  if (!existsSync(path)) throw new Error(`[auth] missing ${path}`);
  const state = readState(path);
  assertNotForbiddenDid(state, path);
  const origin = new URL(base).origin;
  const t = tokenOf(state, origin);
  if (!t) throw new Error(`[auth] identity check: no Privy token in ${path}`);
  const o = (state.origins ?? []).find((x) => x.origin === t.origin);
  const caid = o?.localStorage?.find((e) => e.name === 'privy:caid')?.value?.replace(/^"|"$/g, '');
  let res;
  try {
    res = await fetch('https://auth.privy.io/api/v1/users/me', {
      headers: { 'privy-app-id': PRIVY_APP_ID, Origin: t.origin, ...(caid ? { 'privy-ca-id': caid } : {}), Authorization: `Bearer ${t.token.replace(/^"|"$/g, '')}`, Accept: 'application/json' },
    });
  } catch (e) { throw new Error(`[auth] identity check failed CLOSED — Privy unreachable (${e?.message || e}); refusing to run unverified`); }
  if (!res.ok) throw new Error(`[auth] identity check failed CLOSED — Privy users/me ${res.status}; refusing to run unverified`);
  const j = await res.json();
  const u = j.user ?? j;
  if (FORBIDDEN_DIDS.includes(u.id)) throw refuse(path, `Privy DID ${u.id}`);
  const emails = (u.linked_accounts ?? []).flatMap((a) => [a.address, a.email]).filter((x) => typeof x === 'string' && x.includes('@')).map((x) => x.toLowerCase());
  const bad = emails.find((e) => FORBIDDEN_EMAILS.includes(e));
  if (bad) throw refuse(path, `linked email ${bad}`);
  const mask = (e) => e.replace(/^(.).*(@.*)$/, '$1***$2');
  return `identity ok — ${u.id} (${emails.map(mask).join(', ') || 'no email'})`;
}

/** The freshest privy:token in the file (any localhost origin, or `origin`), with its exp. */
export function tokenOf(state, origin) {
  let best = null;
  for (const o of state.origins ?? []) {
    if (!(o.origin === origin || (isLocalhost(o.origin) && isLocalhost(origin)))) continue;
    const t = (o.localStorage ?? []).find((k) => k.name === 'privy:token')?.value;
    if (!t) continue;
    let exp = 0; // values may be JSON-quoted ("eyJ…") — the payload segment parses either way
    try { exp = JSON.parse(Buffer.from(t.replace(/^"|"$/g, '').split('.')[1], 'base64').toString()).exp ?? 0; } catch { /* not a jwt */ }
    if (!best || exp > best.exp) best = { token: t, exp, origin: o.origin };
  }
  return best;
}

/** Copy the localStorage of `fromOrigin` into every localhost origin in the state + `extra`. */
export function mirror(state, fromOrigin, extra = []) {
  const src = (state.origins ?? []).find((o) => o.origin === fromOrigin);
  if (!src) return state;
  const targets = new Set([...(state.origins ?? []).map((o) => o.origin).filter(isLocalhost), ...extra.filter(isLocalhost), fromOrigin]);
  const others = (state.origins ?? []).filter((o) => !targets.has(o.origin));
  return { ...state, origins: [...others, ...[...targets].map((origin) => ({ origin, localStorage: src.localStorage }))] };
}

export function writeAtomic(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}

export async function withLock(path, fn) {
  const lock = `${path}.lock`;
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) { rmdirSync(lock); continue; } } catch { continue; }
      if (Date.now() - t0 > LOCK_WAIT_MS) throw new Error(`[auth] timed out waiting for ${lock}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  try { return await fn(); } finally { try { rmdirSync(lock); } catch { /* already gone */ } }
}

/**
 * Make the shared session valid for `base` (≥ MIN_VALID_MIN left), refreshing at most once across all
 * concurrent runs. `refresh(state, origin, sourceOrigin)` returns the new storageState; sourceOrigin
 * is the origin the session was minted on (send it as Origin — Privy only accepts allowed origins).
 * Returns a status line for the run log; throws (with the login command) if the session is dead.
 */
export async function ensureFresh(path, base, refresh) {
  const origin = new URL(base).origin;
  const fix = `log in once:  BASE_URL=${origin} AUTH_STATE=${path} npm run create:login:test`;
  if (!existsSync(path)) throw new Error(`[auth] missing ${path}\n  ${fix}`);
  return withLock(path, async () => {
    const s0 = readState(path);
    const t0 = tokenOf(s0, origin);
    if (!t0) throw new Error(`[auth] no Privy session in ${path}\n  ${fix}`);
    const left = () => Math.round((t0.exp * 1000 - Date.now()) / 60_000);

    if (left() >= MIN_VALID_MIN) {
      const hasOrigin = (s0.origins ?? []).some((o) => o.origin === origin && tokenOf({ origins: [o] }, origin)?.token === t0.token);
      if (!hasOrigin) writeAtomic(path, mirror(s0, t0.origin, [origin]));
      return `ok — ${origin}, token valid ${left()}min${hasOrigin ? '' : ' (mirrored to this origin)'}`;
    }

    const next = await refresh(mirror(s0, t0.origin, [origin]), origin, t0.origin);
    const t1 = tokenOf(next, origin);
    // Privy declined to rotate (handed back the same token) and it is still live → not dead; carry on.
    if (t1 && t1.token === t0.token && t0.exp * 1000 > Date.now() + 60_000) {
      const hasOrigin = (s0.origins ?? []).some((o) => o.origin === origin && tokenOf({ origins: [o] }, origin)?.token === t0.token);
      if (!hasOrigin) writeAtomic(path, mirror(s0, t0.origin, [origin]));
      return `ok — ${origin}, token valid ${left()}min (Privy kept the current token)`;
    }
    if (!t1 || t1.exp * 1000 < Date.now() + MIN_VALID_MIN * 60_000) {
      throw new Error(`[auth] refresh failed — the session in ${path} is dead (refresh token already used or expired)\n  ${fix}`);
    }
    // Compare-and-swap: write only if the file still holds the token we read.
    const onDisk = tokenOf(readState(path), origin);
    if (onDisk?.token !== t0.token) return `ok — ${origin}, another run refreshed first (kept theirs)`;
    writeAtomic(path, mirror(next, t1.origin, [origin]));
    return `refreshed — ${origin}, token valid ${Math.round((t1.exp * 1000 - Date.now()) / 60_000)}min, mirrored to all localhost origins`;
  });
}
