import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { isStripePlan, tierForPlan, tierForPrice } from "@/lib/stripePlans";

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

    // AUG-1 — every plan is a subscription: take the REAL period end + the tier from it
    // (same resolution as the webhook). The day-count is only a fallback if the retrieve fails.
    const subId = typeof session.subscription === "string" ? session.subscription : null;
    let sub: Stripe.Subscription | null = null;
    if (subId) { try { sub = await stripe.subscriptions.retrieve(subId); } catch { /* fallback below */ } }
    const epoch = (sub as unknown as { current_period_end?: number } | null)?.current_period_end
      ?? (sub?.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
    const paidUntil = epoch ? new Date(epoch * 1000) : new Date(Date.now() + (plan === "annual_stripe" || plan === "augmented_annual" ? 365 : 30) * 86_400_000);
    const tier = tierForPrice(sub?.items?.data?.[0]?.price?.id) ?? (isStripePlan(plan) ? tierForPlan(plan) : "pro");

    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("privy_id", privyUserId)
      .single();

    if (!userData?.id) return NextResponse.json({ error: "user not found" }, { status: 404 });

    // Persist the Stripe customer + subscription DIRECTLY from the Checkout Session
    // (already retrieved above). This is what cancel later reads — without it,
    // stripe_customer_id stayed NULL and cancel always 404'd. Doing it here removes
    // the dependency on the webhook (not forwarded in local/dev).
    const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
    const stripeSubscriptionId = subId;

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
    // Tier — best-effort like the webhook's (a missing column must not sink the activation).
    const { error: tierErr } = await supabase.from("profiles").update({ membership_tier: tier }).eq("user_id", userData.id);
    if (tierErr) console.warn("[confirm-stripe] membership_tier write failed (run mus1_aug1.sql?):", tierErr.message);
    else if (tier === "augmented") await supabase.from("profiles").update({ augmented_since: new Date().toISOString() }).eq("user_id", userData.id).is("augmented_since", null);

    console.log("[confirm-stripe] membership activated for:", privyUserId, "| customer:", stripeCustomerId, "| sub:", stripeSubscriptionId);
    return NextResponse.json({ success: true, tier }); // CEL-2 — the client picks the welcome film from this
  } catch (e: any) {
    console.error("[confirm-stripe]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
