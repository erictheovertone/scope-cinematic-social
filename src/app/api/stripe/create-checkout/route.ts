import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: NextRequest) {
  try {
    const { plan, privyUserId } = await req.json();

    const isAnnual = plan === "annual_stripe";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://scopeapp.world";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: isAnnual ? "payment" : "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: isAnnual ? "Scope Pro — Annual" : "Scope Pro — Monthly",
              description: isAnnual
                ? "Full access to Scope Pro for 12 months. Unlimited posts, decks, analytics, and your member badge."
                : "Full access to Scope Pro. Unlimited posts, decks, analytics, and your member badge. Renews monthly.",
            },
            unit_amount: isAnnual ? 5000 : 500,
            ...(isAnnual ? {} : { recurring: { interval: "month" } }),
          },
          quantity: 1,
        },
      ],
      metadata: {
        privyUserId,
        plan,
      },
      success_url: `${baseUrl}/membership/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${baseUrl}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[stripe/create-checkout]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
