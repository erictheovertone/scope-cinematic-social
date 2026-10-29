import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isStripePlan, tierForPlan, tierForPrice, type MembershipTier } from "@/lib/stripePlans";

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
//
// TIER (Brief AUG-1): every write that grants access also writes profiles.membership_tier
// ('pro' | 'augmented'), resolved from the subscription's Price (tierForPrice) so renewals and
// plan changes land the right tier; subscription.deleted reverts it to 'free'. augmented_since
// is stamped once on the way into Augmented and cleared on the way out.

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

// The tier a subscription grants: its Price first (authoritative — survives plan changes in the
// portal), the plan metadata we set at checkout second, Pro as the historic default.
function tierOfSubscription(sub: Stripe.Subscription | null, plan?: string | null): Exclude<MembershipTier, "free"> {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  return tierForPrice(priceId) ?? (isStripePlan(plan) ? tierForPlan(plan) : null)
    ?? (isStripePlan(sub?.metadata?.plan) ? tierForPlan(sub!.metadata.plan as never) : "pro");
}

// Tier write: membership_tier is absolute; augmented_since is stamped only when first entering
// Augmented (the .is(null) guard makes redelivery a no-op) and cleared when leaving it.
async function writeTier(supabase: SupabaseClient, userId: string, tier: MembershipTier): Promise<void> {
  const { error } = await supabase.from("profiles").update({ membership_tier: tier }).eq("user_id", userId);
  if (error) { console.warn("[stripe/webhook] membership_tier write failed (run mus1_aug1.sql?):", error.message); return; }
  if (tier === "augmented") {
    await supabase.from("profiles").update({ augmented_since: new Date().toISOString() }).eq("user_id", userId).is("augmented_since", null);
  } else {
    await supabase.from("profiles").update({ augmented_since: null }).eq("user_id", userId);
  }
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

        // UPGRADE (Pro → Augmented, or monthly ↔ annual): the new subscription supersedes the
        // stored one. End the old one now so the member is never billed twice; its
        // subscription.deleted is ignored below because it is no longer the profile's current sub.
        const { data: prior } = await supabase.from("profiles").select("stripe_subscription_id").eq("user_id", userData.id).maybeSingle();
        const priorSub = prior?.stripe_subscription_id as string | null | undefined;
        if (priorSub && subscriptionId && priorSub !== subscriptionId) {
          try { await stripe.subscriptions.cancel(priorSub, { prorate: true }); console.log("[stripe/webhook] superseded sub cancelled:", priorSub); }
          catch (e) { console.warn("[stripe/webhook] could not cancel superseded sub", priorSub, (e as Error).message); }
        }

        // paid_member_until: the REAL period end for subscriptions; one-time
        // 'payment' mode (annual) has no subscription → plan-based fallback.
        let paidUntil: string | null = null;
        let sub: Stripe.Subscription | null = null;
        if (subscriptionId) {
          try { sub = await stripe.subscriptions.retrieve(subscriptionId); paidUntil = periodEndIso(sub); } catch { /* fallback below */ }
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
        const tier = tierOfSubscription(sub, plan);
        await writeTier(supabase, userData.id, tier);
        console.log("[stripe/webhook] activated:", privyUserId, "tier:", tier, "until:", paidUntil, "| sub:", subscriptionId);
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
        let sub: Stripe.Subscription | null = null;
        if (subscriptionId) {
          try { sub = await stripe.subscriptions.retrieve(subscriptionId); if (!paidUntil) paidUntil = periodEndIso(sub); } catch { /* keep null */ }
        }
        await writeMembership(supabase, userId,
          { is_paid_member: true, ...(paidUntil ? { paid_member_until: paidUntil } : {}) },
          { membership_payment_failed_at: null });
        if (sub) await writeTier(supabase, userId, tierOfSubscription(sub));
        console.log("[stripe/webhook] renewal:", userId, "until:", paidUntil);
        break;
      }

      // ── SYNC — cancels/resumes made ANYWHERE (dashboard, portal, our app) ────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await profileFor(supabase, sub.id, typeof sub.customer === "string" ? sub.customer : null);
        if (!userId) return NextResponse.json({ received: true, ignored: "no matching profile" });
        const { data: cur } = await supabase.from("profiles").select("stripe_subscription_id").eq("user_id", userId).maybeSingle();
        if (cur?.stripe_subscription_id && cur.stripe_subscription_id !== sub.id) {
          return NextResponse.json({ received: true, ignored: "superseded subscription" });
        }
        const cancelsAt = sub.cancel_at_period_end ? periodEndIso(sub) : null;
        await writeMembership(supabase, userId,
          sub.status === "active" || sub.status === "trialing"
            ? { is_paid_member: true, ...(periodEndIso(sub) ? { paid_member_until: periodEndIso(sub) } : {}) }
            : {},
          { membership_cancels_at: cancelsAt });
        if (sub.status === "active" || sub.status === "trialing") await writeTier(supabase, userId, tierOfSubscription(sub));
        console.log("[stripe/webhook] sync:", userId, "| status:", sub.status, "| cancelsAt:", cancelsAt);
        break;
      }

      // ── THE DOWNGRADE — the subscription actually ended ──────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await profileFor(supabase, sub.id, typeof sub.customer === "string" ? sub.customer : null);
        if (!userId) return NextResponse.json({ received: true, ignored: "no matching profile" });
        // Only the profile's CURRENT subscription can downgrade it — a superseded one (upgrade)
        // matched only by customer id ends silently.
        const { data: cur } = await supabase.from("profiles").select("stripe_subscription_id").eq("user_id", userId).maybeSingle();
        if (cur?.stripe_subscription_id && cur.stripe_subscription_id !== sub.id) {
          console.log("[stripe/webhook] superseded sub ended, no downgrade:", sub.id);
          return NextResponse.json({ received: true, ignored: "superseded subscription" });
        }
        const endedAt = (sub as unknown as { ended_at?: number }).ended_at;
        await writeMembership(supabase, userId, {
          is_paid_member: false,
          ...(endedAt ? { paid_member_until: new Date(endedAt * 1000).toISOString() } : {}),
        }, {
          membership_cancels_at: null,
          membership_payment_failed_at: null,
        });
        await writeTier(supabase, userId, "free");
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
