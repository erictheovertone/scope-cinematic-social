import { readFileSync, existsSync } from 'fs';

// Brief C3 — auth-freshness preflight. The create harness silently hung for a whole
// session because the stored session was localhost-scoped AND its Privy token had
// expired (→ finishCtx never resolved → the cropper never opened). Fail LOUD here,
// before any test, with the exact fix, instead of a mystery 20s crop timeout.
export default function globalSetup() {
  const STATE = process.env.AUTH_STATE || 'test/.auth/state.json';
  const BASE = process.env.BASE_URL || 'http://localhost:3000';
  const baseOrigin = new URL(BASE).origin;
  const fix = `re-run:  BASE_URL=${BASE} ${process.env.AUTH_STATE ? `AUTH_STATE=${STATE} ` : ''}npm run create:login${process.env.AUTH_STATE ? ':test' : ''}`;

  if (!existsSync(STATE)) {
    throw new Error(`[auth-preflight] missing ${STATE}\n  ${fix}`);
  }
  const s = JSON.parse(readFileSync(STATE, 'utf8')) as {
    origins?: { origin: string; localStorage?: { name: string; value: string }[] }[];
  };
  const origins = (s.origins ?? []).map((o) => o.origin);
  if (!origins.includes(baseOrigin)) {
    throw new Error(`[auth-preflight] ${STATE} has no session for ${baseOrigin} (has: ${origins.join(', ') || 'none'})\n  A localhost session will NOT authenticate against prod.\n  ${fix}`);
  }

  const now = Math.floor(Date.now() / 1000);
  let exp: number | null = null;
  for (const o of s.origins ?? []) {
    if (o.origin !== baseOrigin) continue;
    for (const { name, value } of o.localStorage ?? []) {
      if (name === 'privy:token') {
        try { exp = JSON.parse(Buffer.from(value.split('.')[1], 'base64').toString()).exp; } catch { /* not a jwt */ }
      }
    }
  }
  if (exp != null && exp < now) {
    throw new Error(`[auth-preflight] Privy token in ${STATE} expired ${Math.round((now - exp) / 3600)}h ago (${new Date(exp * 1000).toISOString()})\n  ${fix}`);
  }
  // eslint-disable-next-line no-console
  console.log(`[auth-preflight] ok — ${baseOrigin}${exp != null ? `, token valid ${Math.round((exp - now) / 60)}min` : ' (no privy:token exp found — proceeding)'}`);
}
