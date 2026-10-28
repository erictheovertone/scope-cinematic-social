// ── ARR-1 server flag ────────────────────────────────────────────────────────────
// PUBLIC_PROFILES_ENABLED (server env, default OFF). Off = /[username] and the public-profile API
// 404 for everyone — exactly today's behaviour. Read per request (never inlined into the client).
// ARR-3 — accept the common truthy spellings (1 / true / yes / on) so a `=1` setting (what the
// deploy notes said to use) turns it on; '=== "true"' alone silently left it off.
export function publicProfilesEnabled(): boolean {
  const v = (process.env.PUBLIC_PROFILES_ENABLED ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

// ── ARR-2 allowlist ─────────────────────────────────────────────────────────
// PUBLIC_PROFILES_ALLOWLIST (comma-separated usernames, server env). With the flag ON:
//   • allowlist SET   → only those usernames render Arrival to anonymous visitors; everyone
//                       else notFound() (as today).
//   • allowlist EMPTY → all usernames render Arrival.
// (Flag off → nothing renders; callers check publicProfilesEnabled() first.) Case-insensitive.
export function publicProfileAllowed(username: string): boolean {
  const raw = (process.env.PUBLIC_PROFILES_ALLOWLIST ?? '').trim();
  if (!raw) return true; // empty allowlist = all
  const set = new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  return set.has(String(username).trim().toLowerCase());
}
