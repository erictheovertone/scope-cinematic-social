// ── ARR-1 server flag ────────────────────────────────────────────────────────────
// PUBLIC_PROFILES_ENABLED (server env, default OFF). Off = /[username] and the public-profile API
// 404 for everyone — exactly today's behaviour. Read per request (never inlined into the client).
export function publicProfilesEnabled(): boolean {
  return process.env.PUBLIC_PROFILES_ENABLED === 'true';
}
