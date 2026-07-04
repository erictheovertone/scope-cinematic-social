import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Stripe webhook — FULL subscription lifecycle ──────────────────────────────
//
// Handles: checkout.session.completed (activation — persists customer/
// subscription ids so cancel always has a target), invoice.payment_succeeded
// (renewal → paid_member_until = Stripe's REAL period boundary, no now+30
// drift), customer.subscription.updated (dashboard/portal cancels + resumes
// sync membership_cancels_at both directions), customer.subscription.deleted
// (the actual downgrade), invoice.payment_failed (recorded, NOT a downgrade —
// Stripe's dunning retries; the downgrade arrives as subscription.deleted).
//
// IDEMPOTENT by construction: every handler writes ABSOLUTE state derived from
// the event's subscription object — redelivery rewrites the same values.
// ID RESOLUTION: profiles are matched by stored stripe_subscription_id, then
// stripe_customer_id (both persisted at activation). NEVER by email. The one
// DID-based path is checkout.session.completed, whose metadata.privyUserId we
// set ourselves at session creation.
// Unknown events: acknowledged 200, ignored.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Period end — newer Stripe API versions carry it on the subscription item,
// older on the root (same handling as the cancel route).
const periodEndIso = (sub: Stripe.Subscription): string | null => {
  const epoch = (sub as unknown as { current_period_end?: number }).current_period_end
    ?? (sub.items?.data?.[0] as unknown as { current_period_end?: number })?.current_period_end;
  return epoch ? new Date(epoch * 1000).toISOString() : null;
};

// Resolve the profile row for a subscription event: stored subscription id
// first, customer id as fallback.
async function profileFor(
  supabase: SupabaseClient,
  subscriptionId: string | null,
  customerId: string | null,
): Promise<string | null> {
  if (subscriptionId) {
    const { data } = await supabase
      .from("profiles").select("user_id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  if (customerId) {
    const { data } = await supabase
      .from("profiles").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  return null;
}

// Core fields write + best-effort writes for post-migration columns
// (membership_cancels_at / membership_payment_failed_at may not exist yet —
// their failure must never fail the core state change).
async function writeMembership(
  supabase: SupabaseClient,
  userId: string,
  core: Record<string, unknown>,
  optional: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from("profiles").update(core).eq("user_id", userId);
  if (error) throw new Error(`core membership write failed: ${error.message}`);
  for (const [k, v] of Object.entries(optional)) {
    const { error: e } = await supabase.from("profiles").update({ [k]: v }).eq("user_id", userId);
    if (e) console.warn(`[stripe/webhook] optional column ${k} write failed (migration pending?):`, e.message);
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e: unknown) {
    console.error("[stripe/webhook] signature verification failed:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── ACTIVATION (initial purchase, hosted OR embedded) ────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const privyUserId = session.metadata?.privyUserId;
        const plan = session.metadata?.plan;
        if (!privyUserId) {
          console.error("[stripe/webhook] checkout.session.completed without privyUserId metadata");
          return NextResponse.json({ received: true, ignored: "no privyUserId" });
        }
        const { data: userData } = await supabase
          .from("users").select("id").eq("privy_id", privyUserId).single();
        if (!userData?.id) {
          console.error("[stripe/webhook] user not found for privy_id:", privyUserId);
          return NextResponse.json({ received: true, ignored: "user not found" });
        }

        const customerId = typeof session.customer === "string" ? session.customer : null;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;

        // paid_member_until: the REAL period end for subscriptions; one-time
        // 'payment' mode (annual) has no subscription → plan-based fallback.
        let paidUntil: string | null = null;
        if (subscriptionId) {
          try { paidUntil = periodEndIso(await stripe.subscriptions.retrieve(subscriptionId)); } catch { /* fallback below */ }
        }
        if (!paidUntil) {
          const days = plan === "annual_stripe" ? 365 : 30;
          const d = new Date(); d.setDate(d.getDate() + days);
          paidUntil = d.toISOString();
        }

        await writeMembership(supabase, userData.id, {
          is_paid_member: true,
          paid_member_until: paidUntil,
          payment_method: "stripe",
          // The mapping's gap: hosted purchases that missed confirm-stripe left
          // these NULL → the un-cancellable state. The webhook now persists them.
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        }, {
          membership_cancels_at: null,
          membership_payment_failed_at: null,
        });
        console.log("[stripe/webhook] activated:", privyUserId, "until:", paidUntil, "| sub:", subscriptionId);
        break;
      }

      // ── RENEWAL — extend from Stripe's true boundary (no drift) ──────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof (invoice as unknown as { subscription?: string }).subscription === "string"
          ? (invoice as unknown as { subscription: string }).subscription : null;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        const userId = await profileFor(supabase, subscriptionId, customerId);
        if (!userId) {
          // Initial invoices can arrive BEFORE checkout.session.completed persisted
          // the ids — acknowledge (never 400: Stripe would retry/disable the endpoint).
          console.warn("[stripe/webhook] payment_succeeded: no profile for", subscriptionId ?? customerId);
          return NextResponse.json({ received: true, ignored: "no matching profile" });
        }
        // True boundary: the invoice line's period end (falls back to the sub).
        let paidUntil: string | null = null;
        const lineEnd = invoice.lines?.data?.[0]?.period?.end;
        if (lineEnd) paidUntil = new Date(lineEnd * 1000).toISOString();
        if (!paidUntil && subscriptionId) {
          try { paidUntil = periodEndIso(await stripe.subscriptions.retrieve(subscriptionId)); } catch { /* keep null */ }
        }
        await writeMembership(supabase, userId,
          { is_paid_member: true, ...(paidUntil ? { paid_member_until: paidUntil } : {}) },
          { membership_payment_failed_at: null });
        console.log("[stripe/webhook] renewal:", userId, "until:", paidUntil);
        break;
      }

      // ── SYNC — cancels/resumes made ANYWHERE (dashboard, portal, our app) ────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await profileFor(supabase, sub.id, typeof sub.customer === "string" ? sub.customer : null);
        if (!userId) return NextResponse.json({ received: true, ignored: "no matching profile" });
        const cancelsAt = sub.cancel_at_period_end ? periodEndIso(sub) : null;
        await writeMembership(supabase, userId,
          sub.status === "active" || sub.status === "trialing"
            ? { is_paid_member: true, ...(periodEndIso(sub) ? { paid_member_until: periodEndIso(sub) } : {}) }
            : {},
          { membership_cancels_at: cancelsAt });
        console.log("[stripe/webhook] sync:", userId, "| status:", sub.status, "| cancelsAt:", cancelsAt);
        break;
      }

      // ── THE DOWNGRADE — the subscription actually ended ──────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await profileFor(supabase, sub.id, typeof sub.customer === "string" ? sub.customer : null);
        if (!userId) return NextResponse.json({ received: true, ignored: "no matching profile" });
        const endedAt = (sub as unknown as { ended_at?: number }).ended_at;
        await writeMembership(supabase, userId, {
          is_paid_member: false,
          ...(endedAt ? { paid_member_until: new Date(endedAt * 1000).toISOString() } : {}),
        }, {
          membership_cancels_at: null,
          membership_payment_failed_at: null,
        });
        console.log("[stripe/webhook] DOWNGRADED:", userId, "| sub ended:", sub.id);
        break;
      }

      // ── DUNNING — record, don't downgrade (subscription.deleted is the axe) ──
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof (invoice as unknown as { subscription?: string }).subscription === "string"
          ? (invoice as unknown as { subscription: string }).subscription : null;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        const userId = await profileFor(supabase, subscriptionId, customerId);
        if (!userId) return NextResponse.json({ received: true, ignored: "no matching profile" });
        await writeMembership(supabase, userId, {}, { membership_payment_failed_at: new Date().toISOString() });
        console.log("[stripe/webhook] payment FAILED recorded:", userId);
        break;
      }

      default:
        // Unknown events: acknowledged, ignored (previous behavior preserved).
        break;
    }
  } catch (e: unknown) {
    console.error(`[stripe/webhook] handler error for ${event.type}:`, (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
