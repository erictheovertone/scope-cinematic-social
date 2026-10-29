// ── Stripe plans — the ONE map from a checkout plan to its Price + membership tier (Brief AUG-1) ──
// Checkout never builds inline price_data: every plan is a Stripe Price created in the dashboard
// (live IDs in Production, test IDs in Preview), read from env. All four are RECURRING
// subscriptions — annual included (it was a one-time payment before AUG-1).
//
// Plan ids: the two Pro ids keep their historic names (MembershipSheet + success page + stored
// metadata already use them); the Augmented ids are new.
import 'server-only';

export type MembershipTier = 'free' | 'pro' | 'augmented';
export type StripePlan = 'monthly_stripe' | 'annual_stripe' | 'augmented_monthly' | 'augmented_annual';

const PLANS: Record<StripePlan, { env: string; tier: Exclude<MembershipTier, 'free'>; name: string }> = {
  monthly_stripe:    { env: 'STRIPE_PRICE_PRO_MONTHLY',       tier: 'pro',       name: 'Scope Pro — Monthly' },
  annual_stripe:     { env: 'STRIPE_PRICE_PRO_ANNUAL',        tier: 'pro',       name: 'Scope Pro — Annual' },
  augmented_monthly: { env: 'STRIPE_PRICE_AUGMENTED_MONTHLY', tier: 'augmented', name: 'Augmented Pro — Monthly' },
  augmented_annual:  { env: 'STRIPE_PRICE_AUGMENTED_ANNUAL',  tier: 'augmented', name: 'Augmented Pro — Annual' },
};

export const isStripePlan = (p: unknown): p is StripePlan => typeof p === 'string' && p in PLANS;

/** The Price id for a plan — throws (500 upstream) if the env var is missing, never falls back. */
export function priceFor(plan: StripePlan): string {
  const id = process.env[PLANS[plan].env];
  if (!id || !id.startsWith('price_')) throw new Error(`${PLANS[plan].env} is not set`);
  return id;
}

export const tierForPlan = (plan: StripePlan) => PLANS[plan].tier;

/** Reverse lookup: which tier does a subscription's Price grant? (renewals, portal plan changes) */
export function tierForPrice(priceId: string | null | undefined): Exclude<MembershipTier, 'free'> | null {
  if (!priceId) return null;
  for (const p of Object.values(PLANS)) if (process.env[p.env] === priceId) return p.tier;
  return null;
}
