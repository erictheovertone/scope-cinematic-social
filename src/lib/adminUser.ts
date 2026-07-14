// ── src/lib/adminUser.ts — the admin identity + a SHAPE GUARD ────────────────
// SCOPE_ADMIN_USER_ID MUST be a Privy DID (did:privy:…). It is compared against
// user.id (a DID) in the /admin gate AND written into notifications.recipient_id
// (a DID-keyed column). A UUID sitting where a DID belongs silently breaks BOTH —
// the gate never matches, and admin alerts reach nobody (the FC float alerts went
// to no one for weeks for exactly this reason). So a mis-shaped value must
// ANNOUNCE itself, loudly, not fail silently.

let warned = false;

/**
 * The configured admin Privy DID, or null when unset. If it's set but mis-shaped
 * (not a `did:privy:` value), logs a loud `[config]` warning ONCE per process and
 * still returns the raw value — behaviour is unchanged, but it can no longer fail
 * in silence. Consumers keep failing CLOSED on a mismatch (the gate 403s; alerts
 * simply won't land — surfaced by the warning).
 */
export function getAdminUserId(): string | null {
  const raw = process.env.SCOPE_ADMIN_USER_ID;
  if (!raw) return null;
  if (!raw.startsWith('did:privy:') && !warned) {
    warned = true;
    console.warn(
      `[config] SCOPE_ADMIN_USER_ID is mis-shaped: "${raw}". It MUST be a Privy DID ` +
      `(did:privy:…) — it is compared against user.id and used as ` +
      `notifications.recipient_id, both DID-keyed. A UUID here silently breaks the ` +
      `admin gate AND admin alerts. Fix the env.`,
    );
  }
  return raw;
}

/** True iff `did` matches the configured admin DID. Fails closed on any mismatch. */
export function isAdminUser(did: string | null | undefined): boolean {
  const admin = getAdminUserId();
  return !!admin && !!did && did === admin;
}
