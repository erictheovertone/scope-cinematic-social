import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// TEMP DIAGNOSTIC — which Stripe mode this env is in (prefix + last4 only, never the
// full key). Remove once cancel is confirmed working in prod.
function keyTag(): string {
  const k = process.env.STRIPE_SECRET_KEY ?? '';
  if (!k) return 'MISSING';
  const mode = k.startsWith('sk_live') ? 'LIVE' : k.startsWith('sk_test') ? 'TEST' : 'OTHER';
  return `${mode}:${k.slice(0, 8)}…${k.slice(-4)}`;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    // Canonical resolution: DID → users.privy_id → users.id = profiles.user_id.
    // (Falls back to a raw UUID if one was passed instead of a DID.)
    const { data: u } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', userId)
      .single();
    const supaUserId = u?.id ?? userId;

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, is_paid_member, paid_member_until')
      .eq('user_id', supaUserId)
      .single();

    // TEMP DIAGNOSTIC (remove after confirming): resolved ids + what we have stored.
    console.log('[cancel] diag', JSON.stringify({
      key: keyTag(),
      did: userId,
      supaUserId,
      stored_customer: profile?.stripe_customer_id ?? null,
      stored_subscription: profile?.stripe_subscription_id ?? null,
      is_paid_member: profile?.is_paid_member ?? null,
      paid_until: profile?.paid_member_until ?? null,
    }));

    // 1) We have the subscription id → cancel it directly (at period end).
    if (profile?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(profile.stripe_subscription_id, { cancel_at_period_end: true });
        return NextResponse.json({ success: true, mode: 'subscription' });
      } catch (e: any) {
        console.error('[cancel] subscriptions.update failed:', e?.message, '| sub:', profile.stripe_subscription_id);
        // fall through to the customer lookup (e.g. stale id) before giving up.
      }
    }

    // 2) Only the customer id → find the active subscription for it and cancel.
    if (profile?.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'active' });
      if (subs.data.length > 0) {
        await stripe.subscriptions.update(subs.data[0].id, { cancel_at_period_end: true });
        // Backfill the id we were missing so next time path 1 hits.
        await supabase.from('profiles').update({ stripe_subscription_id: subs.data[0].id }).eq('user_id', supaUserId);
        return NextResponse.json({ success: true, mode: 'subscription' });
      }
    }

    // 3) Pro in our DB but NO recurring Stripe subscription — this is a ONE-TIME plan
    //    (annual = Stripe mode 'payment', or USDC). Nothing recurring to cancel; access
    //    runs to paid_member_until and won't auto-renew. Honest success, no scary error,
    //    and we DON'T revoke paid time.
    if (profile?.is_paid_member) {
      return NextResponse.json({ success: true, mode: 'no-renewal', paidUntil: profile.paid_member_until ?? null });
    }

    // 4) Genuinely not a member.
    return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
  } catch (e: any) {
    console.error('[cancel] error:', e?.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
