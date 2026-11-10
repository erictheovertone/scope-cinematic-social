// ── POST /api/onramp/stripe/session — create a Stripe HOSTED onramp session (BAL-1h #2) ───────────
// Direct Stripe Crypto Onramp (NOT Privy useDepositFunds, NOT the embedded widget). Privy is only the
// wallet address + email. Verified Privy caller → we create a server-side session LOCKED to USDC on
// Base, prefilled amount + email, wallet address locked, and return Stripe's hosted redirect_url
// (crypto.link.com). The client redirects the member there; Apple Pay shows on Stripe's own domain.
//
// NOTE (/api/onramp/session is Coinbase/WAL-1 — untouched; this is the Stripe path under /stripe/).
// The exact field names are empirically verified against the live test API:
//   wallet_addresses[base_network] (NOT `base`/`ethereum`), destination_{currencies,networks}[] lock
//   both, source_amount is a default the user may still edit, customer_information[email] prefills.
import { NextResponse } from 'next/server';
import { callerOf, serviceClient } from '@/lib/serverAuth';
import { onrampModeFor, secretKeyFor } from '@/lib/onramp/sandbox';

export const dynamic = 'force-dynamic';

const AMOUNTS = new Set([10, 25, 50]);
const isAddr = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

export async function POST(req: Request) {
  const supabase = serviceClient();
  const caller = await callerOf(req, supabase);
  if (!caller) return NextResponse.json({ error: 'sign in required' }, { status: 401 });

  let b: { amount?: unknown; walletAddress?: unknown; email?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const amount = Number(b.amount);
  if (!AMOUNTS.has(amount)) return NextResponse.json({ error: 'amount must be 10, 25 or 50' }, { status: 400 });
  if (!isAddr(b.walletAddress)) return NextResponse.json({ error: 'valid wallet address required' }, { status: 400 });
  const email = typeof b.email === 'string' && b.email.includes('@') ? b.email : null;

  // BAL-1b §3 — SERVER-decided sandbox switch. Resolve the verified caller's username (never read the
  // mode from the request); a username in ONRAMP_SANDBOX_USERS → Stripe TEST, else LIVE. A sandbox user
  // with no test key is a hard error, never a fall-through to the live key.
  const { data: prof } = await supabase.from('profiles').select('username').eq('user_id', caller.userId).maybeSingle();
  const mode = onrampModeFor((prof as { username?: string } | null)?.username ?? null, process.env.ONRAMP_SANDBOX_USERS);
  const resolved = secretKeyFor(mode, process.env);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error, mode }, { status: mode === 'test' ? 503 : 500 });
  const key = resolved.key;

  // Locked to USDC-on-Base; amount + email prefilled; wallet address locked. metadata carries the
  // uuid so the webhook can attribute topup_started/completed/failed without a token.
  const form = new URLSearchParams();
  form.set('source_currency', 'usd');
  form.set('source_amount', String(amount));
  form.set('destination_currency', 'usdc');
  form.set('destination_network', 'base');
  form.append('destination_currencies[]', 'usdc');
  form.append('destination_networks[]', 'base');
  form.set('wallet_addresses[base_network]', b.walletAddress);
  form.set('lock_wallet_address', 'true');
  if (email) form.set('customer_information[email]', email);
  form.set('metadata[userId]', caller.userId);
  form.set('metadata[amount]', String(amount));

  const res = await fetch('https://api.stripe.com/v1/crypto/onramp_sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = (await res.json()) as { redirect_url?: string; client_secret?: string; id?: string; error?: { message?: string; code?: string } };
  if (!res.ok || !data.client_secret) {
    console.error(`[onramp/stripe/session] create failed (${mode})`, { code: data.error?.code, msg: data.error?.message, status: res.status });
    return NextResponse.json({ error: data.error?.message || 'onramp session failed', mode }, { status: 502 });
  }
  // BAL-1e — EMBEDDED uses client_secret (mounted on our domain, no redirect). The same session object
  // also carries redirect_url (hosted, BAL-1h); the client picks the embedded path. BAL-1b: `mode` tells
  // the client which publishable key to load Stripe with (test vs live) — decided here, never trusted from input.
  return NextResponse.json({ clientSecret: data.client_secret, url: data.redirect_url, id: data.id, mode });
}
