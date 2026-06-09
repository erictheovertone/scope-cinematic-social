import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// apiVersion pinned to the account's runtime version; the installed SDK types are
// newer (see the same cast in create-checkout) — cast to avoid the version-drift
// type error while keeping the correct runtime value.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: "2024-06-20" as any,
});

/**
 * Embedded Checkout session (ui_mode: 'embedded', redirect_on_completion: 'never')
 * for the IN-SUITE purchase flow — resolves in-app so the FINISHING editor never
 * unmounts. Same plan/price/metadata as the hosted create-checkout. Returns a
 * client_secret + sessionId; the client mounts it and, on completion, confirms
 * via /api/membership/confirm-stripe with the sessionId.
 */
export async function POST(req: NextRequest) {
  try {
    const { plan, privyUserId } = await req.json();
    const isAnnual = plan === "annual_stripe";

    // ui_mode 'embedded' + redirect_on_completion 'never' are the runtime values
    // for the pinned apiVersion; cast past the newer SDK type union.
    const params = {
      ui_mode: "embedded",
      redirect_on_completion: "never",
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
      metadata: { privyUserId, plan },
    };
    const session = await stripe.checkout.sessions.create(params as unknown as Stripe.Checkout.SessionCreateParams);

    return NextResponse.json({ clientSecret: session.client_secret, sessionId: session.id });
  } catch (e: any) {
    console.error("[stripe/create-embedded-checkout]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
