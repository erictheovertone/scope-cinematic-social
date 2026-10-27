// ── Server-side Privy access-token verification (Brief ARR-1) ──────────────────────────────────
// Verifies the ES256 access token a client sends as `Authorization: Bearer <token>` against Privy's
// published JWKS (no new dependency — node:crypto takes JWKs directly), and returns the caller's DID
// (`sub`). Checks signature, issuer (privy.io), audience (our app id) and expiry. The JWKS is cached
// per server instance for 10 minutes; an unknown `kid` forces one refetch (key rotation).
import 'server-only';
import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { PRIVY_APP_ID } from '@/lib/privy';

type Jwk = JsonWebKey & { kid?: string };
let cache: { at: number; keys: Jwk[] } | null = null;

async function jwks(force = false): Promise<Jwk[]> {
  if (!force && cache && Date.now() - cache.at < 10 * 60_000) return cache.keys;
  const res = await fetch(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`privy jwks ${res.status}`);
  const keys = ((await res.json()) as { keys: Jwk[] }).keys ?? [];
  cache = { at: Date.now(), keys };
  return keys;
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** The caller's Privy DID, or null if the token is missing/invalid/expired. */
export async function verifyPrivyToken(token: string | null | undefined): Promise<string | null> {
  try {
    if (!token) return null;
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const header = JSON.parse(b64url(h).toString()) as { alg?: string; kid?: string };
    if (header.alg !== 'ES256') return null;
    let jwk = (await jwks()).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await jwks(true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, b64url(s));
    if (!ok) return null;
    const claims = JSON.parse(b64url(p).toString()) as { sub?: string; iss?: string; aud?: string | string[]; exp?: number };
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== 'privy.io' || !aud.includes(PRIVY_APP_ID)) return null;
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    return claims.sub ?? null;
  } catch {
    return null;
  }
}

/** Convenience: the DID from a request's Authorization header. */
export function verifyRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  return verifyPrivyToken(auth.startsWith('Bearer ') ? auth.slice(7) : null);
}
