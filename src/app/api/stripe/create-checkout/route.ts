import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { isStripePlan, priceFor } from "@/lib/stripePlans";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: NextRequest) {
  try {
    const { plan, privyUserId } = await req.json();

    if (!isStripePlan(plan)) return NextResponse.json({ error: "unknown plan" }, { status: 400 });
    if (!privyUserId) return NextResponse.json({ error: "privyUserId required" }, { status: 400 });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://scopeapp.world";

    // AUG-1 — a dashboard Price (src/lib/stripePlans.ts), always a recurring subscription.
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceFor(plan), quantity: 1 }],
      metadata: { privyUserId, plan },
      subscription_data: { metadata: { privyUserId, plan } },
      success_url: `${baseUrl}/membership/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${baseUrl}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[stripe/create-checkout]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
