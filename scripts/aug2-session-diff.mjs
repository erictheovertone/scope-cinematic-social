// ── AUG-2 evidence — Pro vs Augmented hosted checkout sessions match on every wallet field ────────
// Creates one Pro and one Augmented Checkout Session through the SAME params create-checkout uses, in
// TEST mode (asserts sk_test), and diffs the wallet-relevant fields. They must match on mode, ui_mode,
// payment_method_types, automatic_payment_methods, success_url shape, and customer fields — and differ
// only on line item (price) + metadata.plan. NEVER prints the secret key. Throwaway test prices are
// used because .env.local has no STRIPE_PRICE_* (the config is what matters, not the amount).
//   run:  node scripts/aug2-session-diff.mjs   (from the worktree; reads STRIPE_SECRET_KEY from .env.local)
import Stripe from 'stripe';
import { readFileSync } from 'fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const key = env.STRIPE_SECRET_KEY;
if (!key || !key.startsWith('sk_test')) { console.error('refusing to run: STRIPE_SECRET_KEY is not a TEST key (sk_test_…)'); process.exit(1); }
const stripe = new Stripe(key, { apiVersion: '2024-06-20' });
const baseUrl = env.NEXT_PUBLIC_APP_URL || 'https://scopeapp.world';

// A throwaway recurring test price per tier (stands in for STRIPE_PRICE_* which main's .env.local lacks).
async function throwawayPrice(label, amount) {
  const p = await stripe.prices.create({ currency: 'usd', unit_amount: amount, recurring: { interval: 'month' }, product_data: { name: `AUG-2 evidence — ${label}` } });
  return p.id;
}

// EXACTLY create-checkout's params (the only inputs that vary are price + plan metadata).
function sessionParams(plan, priceId, cancelPath) {
  const cancel = typeof cancelPath === 'string' && /^\/($|[^/])/.test(cancelPath) ? cancelPath : '/profile';
  return {
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { privyUserId: 'evidence_user', plan },
    subscription_data: { metadata: { privyUserId: 'evidence_user', plan } },
    success_url: `${baseUrl}/membership/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
    cancel_url: `${baseUrl}${cancel}`,
  };
}

const WALLET_FIELDS = ['mode', 'ui_mode', 'payment_method_types', 'automatic_payment_methods', 'customer', 'customer_creation', 'customer_email'];
const pick = (s) => {
  const o = {};
  for (const f of WALLET_FIELDS) o[f] = s[f] ?? null;
  o.success_url_shape = (s.success_url || '').replace(/plan=[^&]*/, 'plan=<PLAN>'); // normalise the only intended diff
  o.cancel_url = s.cancel_url;
  o.line_item_price = s.line_items?.data?.[0]?.price?.id ?? '(expanded below)';
  o.metadata_plan = s.metadata?.plan ?? null;
  return o;
};

const proPrice = await throwawayPrice('Pro', 500);
const augPrice = await throwawayPrice('Augmented', 2999);
const proS = await stripe.checkout.sessions.create(sessionParams('annual_stripe', proPrice, '/profile'));
const augS = await stripe.checkout.sessions.create(sessionParams('augmented_annual', augPrice, '/profile'));
// Re-fetch with line_items expanded so we can show the price ids.
const pro = await stripe.checkout.sessions.retrieve(proS.id, { expand: ['line_items'] });
const aug = await stripe.checkout.sessions.retrieve(augS.id, { expand: ['line_items'] });
const P = pick(pro), A = pick(aug);

console.log('\n=== PRO (annual_stripe) ===');       console.log(JSON.stringify(P, null, 2));
console.log('\n=== AUGMENTED (augmented_annual) ==='); console.log(JSON.stringify(A, null, 2));

// Diff.
const mustMatch = [...WALLET_FIELDS, 'success_url_shape', 'cancel_url'];
const mustDiffer = ['line_item_price', 'metadata_plan'];
let ok = true;
console.log('\n=== DIFF ===');
for (const f of mustMatch) { const same = JSON.stringify(P[f]) === JSON.stringify(A[f]); if (!same) ok = false; console.log(`${same ? '✓ match ' : '✗ DIFFER'}  ${f}: ${JSON.stringify(P[f])}`); }
for (const f of mustDiffer) { const diff = JSON.stringify(P[f]) !== JSON.stringify(A[f]); if (!diff) ok = false; console.log(`${diff ? '✓ differs' : '✗ SAME  '}  ${f}: pro=${JSON.stringify(P[f])} aug=${JSON.stringify(A[f])}`); }

// Clean up the throwaway test prices' products (archive).
for (const s of [pro, aug]) { try { const li = s.line_items?.data?.[0]; const prod = li?.price?.product; if (prod) await stripe.products.update(typeof prod === 'string' ? prod : prod.id, { active: false }); } catch { /* best effort */ } }

console.log(`\n${ok ? '✓ PASS — Augmented matches Pro on every wallet field; differs only on price + plan.' : '✗ FAIL — a wallet field diverged.'}`);
process.exit(ok ? 0 : 1);
