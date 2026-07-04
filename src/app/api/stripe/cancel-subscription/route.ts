import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// One log line per attempt for the PROD env check (key MODE only, never the key):
// look for "[cancel] mode=LIVE|TEST" in Vercel function logs after a phone attempt.
const keyMode = () => {
  const k = process.env.STRIPE_SECRET_KEY ?? '';
  return k.startsWith('sk_live') ? 'LIVE' : k.startsWith('sk_test') ? 'TEST' : 'MISSING';
};

// Period end from the subscription — newer Stripe API versions carry it on the
// item, older on the subscription root. Fallback: our stored paid_member_until.
const periodEndIso = (sub: Stripe.Subscription, fallback: string | null): string | null => {
  const epoch = (sub as unknown as { current_period_end?: number }).current_period_end
    ?? (sub.items?.data?.[0] as unknown as { current_period_end?: number })?.current_period_end;
  return epoch ? new Date(epoch * 1000).toISOString() : fallback;
};

// CANCELLATION TRUTH: a successful cancel persists membership_cancels_at on the
// profile so the UI can show "PRO · cancels <date>" forever after — a cancel
// must never be indistinguishable from an active membership. `action: 'resume'`
// un-schedules it (Stripe supports flipping cancel_at_period_end back off any
// time before the period ends).
export async function POST(req: NextRequest) {
  try {
    const { userId, action } = await req.json();
    const resume = action === 'resume';

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

    console.log(`[cancel] mode=${keyMode()} action=${resume ? 'resume' : 'cancel'} sub=${profile?.stripe_subscription_id ?? 'none'} customer=${profile?.stripe_customer_id ?? 'none'}`);

    // Persist the scheduled-cancel state; tolerate a missing column so the
    // cancel itself still succeeds pre-migration (logged loudly).
    const persistCancelState = async (cancelsAt: string | null) => {
      const { error } = await supabase
        .from('profiles')
        .update({ membership_cancels_at: cancelsAt })
        .eq('user_id', supaUserId);
      if (error) console.error('[cancel] membership_cancels_at write failed (run the migration?):', error.message);
    };

    const applyTo = async (subscriptionId: string) => {
      const sub = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: !resume });
      const cancelsAt = resume ? null : periodEndIso(sub, profile?.paid_member_until ?? null);
      await persistCancelState(cancelsAt);
      return NextResponse.json({ success: true, mode: 'subscription', cancelsAt });
    };

    // 1) We have the subscription id → act on it directly.
    if (profile?.stripe_subscription_id) {
      try {
        return await applyTo(profile.stripe_subscription_id);
      } catch (e: unknown) {
        console.error('[cancel] subscriptions.update failed:', (e as Error)?.message, '| sub:', profile.stripe_subscription_id);
        // fall through to the customer lookup (e.g. stale id) before giving up.
      }
    }

    // 2) Only the customer id → find the active subscription for it.
    if (profile?.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'active' });
      if (subs.data.length > 0) {
        // Backfill the id we were missing so next time path 1 hits.
        await supabase.from('profiles').update({ stripe_subscription_id: subs.data[0].id }).eq('user_id', supaUserId);
        return await applyTo(subs.data[0].id);
      }
    }

    if (resume) return NextResponse.json({ error: 'No subscription to resume' }, { status: 404 });

    // 3) Pro in our DB but NO recurring Stripe subscription — a ONE-TIME plan
    //    (annual mode 'payment', or USDC). Nothing recurring to cancel; access
    //    runs to paid_member_until and won't auto-renew. Honest success, and we
    //    DON'T revoke paid time.
    if (profile?.is_paid_member) {
      await persistCancelState(profile.paid_member_until ?? null);
      return NextResponse.json({ success: true, mode: 'no-renewal', cancelsAt: profile.paid_member_until ?? null });
    }

    // 4) Genuinely not a member.
    return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
  } catch (e: unknown) {
    console.error('[cancel] error:', (e as Error)?.message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
