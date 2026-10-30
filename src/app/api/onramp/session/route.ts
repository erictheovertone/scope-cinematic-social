// ── POST /api/onramp/session — Coinbase Onramp session token (Brief WAL-1) ─────────────────────
// Direct CDP "secure init" flow (not Privy's funding modal). Auth required: the Privy access token
// is verified (callerOf → DID → users.id) exactly like the other owner-gated wallet/catalog routes;
// no token → 401. Body: NONE — the server funds the caller's OWN embedded wallet address
// (users.wallet_address, which UserSyncProvider backfills to the embedded wallet), so a caller can
// never mint a session for someone else's address. Signs a CDP JWT (Ed25519) with @coinbase/cdp-sdk
// generateJwt, mints a single-use session token on Base (ETH + USDC), and returns the pay.coinbase.com
// buy URL. Every failure returns explicit error JSON — no silent fallback.
import { NextResponse } from 'next/server';
import { generateJwt } from '@coinbase/cdp-sdk/auth';
import { callerOf, serviceClient } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const CDP_HOST = 'api.developer.coinbase.com';
const err = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  // AUTH FIRST — verified Privy caller (→ 401), same check as the other wallet/catalog routes.
  // (Before the config check, so an unauthenticated call is always 401, never a 500 config leak.)
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return err('sign in required', 401);

  const keyId = process.env.CDP_API_KEY_ID;
  const keySecret = process.env.CDP_API_KEY_SECRET;
  if (!keyId || !keySecret) return err('onramp not configured (CDP_API_KEY_ID / CDP_API_KEY_SECRET missing)', 500);

  // The caller's OWN embedded wallet address (never a client-supplied one).
  const { data: user } = await supabase.from('users').select('wallet_address').eq('id', caller.userId).maybeSingle();
  const address = user?.wallet_address;
  if (!address) return err('no wallet on this account yet — finish wallet setup first', 400);

  // 1) sign the CDP request JWT (Ed25519 secret).
  let jwt: string;
  try {
    jwt = await generateJwt({ apiKeyId: keyId, apiKeySecret: keySecret, requestMethod: 'POST', requestHost: CDP_HOST, requestPath: '/onramp/v1/token' });
  } catch (e) {
    return err(`onramp jwt sign failed: ${(e as Error)?.message ?? 'unknown'}`, 500);
  }

  // 2) mint the single-use session token (Base; ETH + USDC).
  let tokenRes: Response;
  try {
    tokenRes = await fetch(`https://${CDP_HOST}/onramp/v1/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: [{ address, blockchains: ['base'] }], assets: ['ETH', 'USDC'] }),
    });
  } catch (e) {
    return err(`onramp token request failed: ${(e as Error)?.message ?? 'network'}`, 502);
  }
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    return err(`onramp token ${tokenRes.status}: ${body.slice(0, 400)}`, 502);
  }
  const token = ((await tokenRes.json().catch(() => ({}))) as { token?: string }).token;
  if (!token) return err('onramp token: no token in response', 502);

  // 3) the Coinbase Onramp buy URL (session token is single-use, ~5 min TTL).
  const url =
    `https://pay.coinbase.com/buy/select-asset?sessionToken=${encodeURIComponent(token)}` +
    `&defaultNetwork=base&defaultAsset=ETH&fiatCurrency=USD&presetFiatAmount=5` +
    `&partnerUserId=${encodeURIComponent(caller.did)}` +
    `&redirectUrl=${encodeURIComponent('https://scopeapp.world/wallet?funded=1')}`;
  return NextResponse.json({ url });
}
