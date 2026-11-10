// ── funnel — client-side track() for funnel events (BAL-1h #4) ───────────────────────────────────
// Posts to /api/funnel with the Privy access token; the server resolves the user and writes the row.
// Fire-and-forget at the UI level (fetch executes eagerly — unlike a postgrest builder — so this is
// not the MUS-3a no-op class); failures are swallowed so instrumentation never breaks a flow.
import { getAccessToken } from '@privy-io/react-auth';

export type FunnelEvent =
  | 'topup_opened' | 'topup_started' | 'topup_completed' | 'topup_failed'
  | 'collect_attempted' | 'collect_blocked_no_balance' | 'collect_completed' | 'mint_blocked_no_balance';

export async function track(event: FunnelEvent, props: Record<string, unknown> = {}): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;
    await fetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event, props }),
      keepalive: true, // survive a navigation (we fire topup_started right before redirecting to Stripe)
    });
  } catch { /* instrumentation must never break the flow */ }
}
