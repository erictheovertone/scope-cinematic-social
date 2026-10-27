// ── The Arrival card's sign-in buttons = what Privy has enabled (ARR-1 addendum) ───────────────
// Read server-side from Privy's public app config (the same document the Privy SDK loads), cached
// 5 min. Order: Apple, Google, email — the first is the filled button. Nothing is hardcoded: Apple
// appears on its own once apple_oauth is switched on in the Privy dashboard. If the config can't be
// read, fall back to the client's configured methods (src/lib/privy.ts) that the card supports.
import 'server-only';
import { PRIVY_APP_ID, privyConfig } from '@/lib/privy';

export type ArrivalLoginMethod = 'apple' | 'google' | 'email';
const ORDER: { method: ArrivalLoginMethod; flag: string }[] = [
  { method: 'apple', flag: 'apple_oauth' },
  { method: 'google', flag: 'google_oauth' },
  { method: 'email', flag: 'email_auth' },
];

export async function getArrivalLoginMethods(): Promise<ArrivalLoginMethod[]> {
  try {
    const res = await fetch(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}`, {
      headers: { 'privy-app-id': PRIVY_APP_ID },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`privy app config ${res.status}`);
    const cfg = (await res.json()) as Record<string, unknown>;
    const on = ORDER.filter(({ flag }) => cfg[flag] === true).map(({ method }) => method);
    if (on.length) return on;
  } catch { /* fall through */ }
  const configured = privyConfig.loginMethods as string[];
  return ORDER.map(({ method }) => method).filter((m) => configured.includes(m));
}
