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

  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (e: any) {
    console.error("[stripe/webhook] signature verification failed:", e.message);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "invoice.payment_succeeded"
  ) {
    const session = event.data.object as Stripe.CheckoutSession;
    const privyUserId = session.metadata?.privyUserId;
    const plan = session.metadata?.plan;

    if (!privyUserId) {
      console.error("[stripe/webhook] no privyUserId in metadata");
      return NextResponse.json({ error: "no privyUserId" }, { status: 400 });
    }

    const daysToAdd = plan === "annual_stripe" ? 365 : 30;
    const paidUntil = new Date();
    paidUntil.setDate(paidUntil.getDate() + daysToAdd);

    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("privy_id", privyUserId)
      .single();

    if (!userData?.id) {
      console.error("[stripe/webhook] user not found for privy_id:", privyUserId);
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        is_paid_member: true,
        paid_member_until: paidUntil.toISOString(),
        payment_method: "stripe",
      })
      .eq("user_id", userData.id);

    if (error) {
      console.error("[stripe/webhook] supabase update failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("[stripe/webhook] membership activated for:", privyUserId, "until:", paidUntil);
  }

  return NextResponse.json({ received: true });
}
