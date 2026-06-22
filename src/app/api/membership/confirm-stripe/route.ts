import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: "no sessionId" }, { status: 400 });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const privyUserId = session.metadata?.privyUserId;
    const plan = session.metadata?.plan;

    if (!privyUserId) return NextResponse.json({ error: "no privyUserId" }, { status: 400 });
    if (session.payment_status !== "paid") return NextResponse.json({ error: "not paid" }, { status: 400 });

    const daysToAdd = plan === "annual_stripe" ? 365 : 30;
    const paidUntil = new Date();
    paidUntil.setDate(paidUntil.getDate() + daysToAdd);

    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("privy_id", privyUserId)
      .single();

    if (!userData?.id) return NextResponse.json({ error: "user not found" }, { status: 404 });

    // Persist the Stripe customer + subscription DIRECTLY from the Checkout Session
    // (already retrieved above). This is what cancel later reads — without it,
    // stripe_customer_id stayed NULL and cancel always 404'd. Doing it here removes
    // the dependency on the webhook (not forwarded in local/dev). Annual is Stripe
    // mode 'payment' → no subscription → that field is null (correct, one-time).
    const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
    const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;

    await supabase
      .from("profiles")
      .update({
        is_paid_member: true,
        paid_member_until: paidUntil.toISOString(),
        payment_method: "stripe",
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      })
      .eq("user_id", userData.id);

    console.log("[confirm-stripe] membership activated for:", privyUserId, "| customer:", stripeCustomerId, "| sub:", stripeSubscriptionId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[confirm-stripe]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
