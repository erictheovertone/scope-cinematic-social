// ── POST /api/onramp/stripe/webhook — Stripe onramp fulfillment → funnel events (BAL-1h #3/#4) ────
// Stripe sends `crypto.onramp_session.updated` on every status change after creation. We verify the
// signature with this endpoint's OWN secret (STRIPE_ONRAMP_WEBHOOK_SECRET — a separate endpoint from
// the membership webhook), read metadata.userId (set at session creation), and map the status to a
// funnel event. Idempotent: funnel_events is append-only and redelivery just logs the same transition.
//   fulfillment_processing → topup_started (paid; crypto delivering)
//   fulfillment_complete   → topup_completed
//   rejected               → topup_failed (reason: 'rejected')
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { serviceClient } from '@/lib/serverAuth';
import { serverTrack } from '@/lib/funnelServer';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' as any });

const STATUS_EVENT: Record<string, 'topup_started' | 'topup_completed' | 'topup_failed'> = {
  fulfillment_processing: 'topup_started',
  fulfillment_complete: 'topup_completed',
  rejected: 'topup_failed',
};

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_ONRAMP_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 400 });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    console.error('[onramp/stripe/webhook] bad signature', (e as Error).message);
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  // `crypto.onramp_session.updated` is a preview event not in the SDK's typed union — compare as string.
  if ((event.type as string) === 'crypto.onramp_session.updated') {
    const session = event.data.object as unknown as { status?: string; metadata?: Record<string, string>; id?: string };
    const mapped = session.status ? STATUS_EVENT[session.status] : undefined;
    if (mapped) {
      const userId = session.metadata?.userId ?? null;
      await serverTrack(serviceClient(), userId, mapped, {
        session: session.id ?? null,
        status: session.status,
        amount: session.metadata?.amount ? Number(session.metadata.amount) : null,
        ...(mapped === 'topup_failed' ? { reason: session.status } : {}),
      });
    }
  }
  return NextResponse.json({ received: true });
}
