// ── /api/dm/_shared — DM server plumbing (service-role + identity discipline) ──
//
// Underscore-prefixed file → NOT a route (App Router ignores it). Shared by the
// four /api/dm/* routes.
//
// IDENTITY (the landmine discipline): the client sends its Privy DID (user.id).
// The server resolves DID → users.id (the canonical uuid) and treats THAT uuid
// as the caller's identity for every write and participant check. conversations
// + messages store uuids, never raw DIDs — the DID is an edge token, the uuid is
// the internal id.
//
// TRUST BOUNDARY (flagged for Eric): this repo has no Privy server SDK / app
// secret, so the DID is TRUSTED as passed — the same posture as every other
// route here (hero-upload, membership, cancel-subscription). A caller who passes
// someone else's DID would act as them. When Privy server-side token
// verification is added, verify the access token and derive the DID from it
// inside resolveCallerUuid() — no other route code changes. Until then the real
// privacy guarantee is the deny-default RLS: the anon key can't read messages at
// all, and these routes participant-check every read against the resolved uuid.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** DID → users.id (uuid). Returns null if the DID maps to no user. */
export async function resolveCallerUuid(
  supabase: SupabaseClient,
  did: string | null | undefined,
): Promise<string | null> {
  if (!did) return null;
  const { data } = await supabase
    .from('users').select('id').eq('privy_id', did).maybeSingle();
  return data?.id ?? null;
}

/** users.id (uuid) → that user's Privy DID (for notification recipient_id). */
export async function didForUuid(
  supabase: SupabaseClient,
  uuid: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('users').select('privy_id').eq('id', uuid).maybeSingle();
  return data?.privy_id ?? null;
}

/** Normalized pair (user_a < user_b) — the conversation's canonical key order. */
export function orderedPair(x: string, y: string): { user_a: string; user_b: string } {
  return x < y ? { user_a: x, user_b: y } : { user_a: y, user_b: x };
}

/** True iff `uuid` is a participant of the conversation. */
export function isParticipant(
  conv: { user_a: string; user_b: string },
  uuid: string,
): boolean {
  return conv.user_a === uuid || conv.user_b === uuid;
}
