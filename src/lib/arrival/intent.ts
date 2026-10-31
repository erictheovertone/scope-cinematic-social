// ── Arrival intent — the deep link that survives sign-up (Brief ARR-1) ─────────────────────────
// The Arrival card stores { username, ref, follow } before handing off to Privy. /auth/callback
// completes it (server follow + attribution) and lands the new account back on that profile,
// following; a fresh account that must onboard first keeps the intent until the grid-layout step
// finishes. localStorage (survives Privy's OAuth redirect round-trip); expires after an hour.
const KEY = 'scope.arrival';
const TTL_MS = 60 * 60_000;
// ARR-7 — a cookie MIRROR of "an arrival is in flight", so the server-rendered /arrival page can
// tell a member returning from Google OAuth (Privy cookies set, page reloads) apart from an
// existing member opening a shared link. Presence only: the intent itself stays in localStorage.
export const ARRIVAL_COOKIE = 'scope_arrival';
const setCookie = (on: boolean) => {
  try { document.cookie = `${ARRIVAL_COOKIE}=${on ? '1' : ''}; path=/; max-age=${on ? TTL_MS / 1000 : 0}; samesite=lax`; } catch { /* */ }
};

export interface ArrivalIntent { username: string; ref: string | null; follow: boolean; at: number; applied?: boolean }

export function saveArrivalIntent(i: Omit<ArrivalIntent, 'at'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...i, at: Date.now() })); } catch { /* private mode */ }
  setCookie(true);
}

export function readArrivalIntent(): ArrivalIntent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const i = JSON.parse(raw) as ArrivalIntent;
    if (!i?.username || Date.now() - i.at > TTL_MS) { localStorage.removeItem(KEY); setCookie(false); return null; }
    return i;
  } catch { return null; }
}

export function clearArrivalIntent() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
  setCookie(false);
}

/** Server-side follow + attribution, once per intent. Never throws. */
export async function applyArrivalIntent(i: ArrivalIntent, getAccessToken: () => Promise<string | null>): Promise<void> {
  if (i.applied) return;
  try {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch('/api/arrival/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: i.username, ref: i.ref, follow: i.follow }),
    });
    if (res.ok) localStorage.setItem(KEY, JSON.stringify({ ...i, applied: true }));
  } catch { /* the profile still opens; follow can be done by hand */ }
}

/** Where a completed arrival lands: the arrived-at profile, grid exposed, with the "following" note. */
export const arrivalDestination = (i: ArrivalIntent) => `/profile/${encodeURIComponent(i.username)}?arrived=1`;
