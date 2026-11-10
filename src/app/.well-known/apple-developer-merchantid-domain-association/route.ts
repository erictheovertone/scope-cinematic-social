// ── /.well-known/apple-developer-merchantid-domain-association (BAL-1h #5) ─────────────────────────
// Serves Stripe's Apple Pay domain-association file so Eric can register scopeapp.world as a Stripe
// Payment Method Domain (needed for Apple Pay on the AUG-2 EMBEDDED checkout; the hosted onramp shows
// Apple Pay on Stripe's own domain and needs no file). Content comes from the env var
// STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION — paste Stripe's string into Vercel; no redeploy to rotate it,
// and the account-specific value is never committed. Returns 404 until the env var is set.
export const dynamic = 'force-dynamic';

export async function GET() {
  const content = process.env.STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION;
  if (!content) return new Response('not configured', { status: 404 });
  return new Response(content, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
