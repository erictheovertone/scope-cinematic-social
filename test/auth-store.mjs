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
export const MIN_VALID_MIN = 35;
const LOCK_STALE_MS = 3 * 60_000;
const LOCK_WAIT_MS = 4 * 60_000;

const isLocalhost = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

export function readState(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
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
