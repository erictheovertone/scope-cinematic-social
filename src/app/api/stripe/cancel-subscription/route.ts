import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    // The caller passes the Privy DID (usePrivy user.id), but profiles.user_id is
    // the Supabase users.id (UUID). Resolve DID → users.id so the lookup matches —
    // this mismatch was why cancel silently 404'd. Falls back to the raw value if a
    // UUID was already supplied.
    const { data: u } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', userId)
      .single();
    const supaUserId = u?.id ?? userId;

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', supaUserId)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'active',
    });

    if (subscriptions.data.length === 0) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }

    await stripe.subscriptions.update(subscriptions.data[0].id, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
