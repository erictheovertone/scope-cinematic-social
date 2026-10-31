// ── ARR-7 — the fresh-signup test account's SAFETY GUARD ─────────────────────────────────────────
// Preview and Production share ONE Supabase database, so resetting the test account deletes rows
// from the live DB. Every deletion goes through cleanupTestAccount() and nothing else.
//
//   1. Resolve PRIVY_TEST_EMAIL → Privy DID from PRIVY ITSELF (passwordless init + authenticate with
//      the test account's fixed code; the response's linked email must equal PRIVY_TEST_EMAIL
//      exactly). Our users table has no email column, so Privy is the only authority for email→DID.
//   2. Resolve that DID → users rows with an EXACT eq on users.privy_id. Cleanup requires EXACTLY
//      one row (0 or >1 aborts loudly).
//   3. Refuse if anything resolved matches Eric in any shape: his DID, his Supabase UUID, or his email.
//   4. Count, log, and cap: users (eq id), profiles (eq user_id), follows (eq follower_id / eq
//      following_id). Any table over MAX_PER_TABLE aborts before a single delete.
//   5. Delete ONLY those rows, by the same exact eq filters. No LIKE, no prefix, no username match.
// The guard is not relaxed to make a test pass: if it trips, the test fails.
import { db, E } from './mus-aug-harness';

const FORBIDDEN = {
  dids: ['did:privy:cmhjqhry90120kz0ddgzkir25'],
  uuids: ['ce1ebe42-3c33-4a16-8785-ec3e87d66e16'],
  emails: ['eric@muon.film'],
};
const ALL_FORBIDDEN = [...FORBIDDEN.dids, ...FORBIDDEN.uuids, ...FORBIDDEN.emails].map((s) => s.toLowerCase());
export const MAX_PER_TABLE = 5;
const APP_ID = E('NEXT_PUBLIC_PRIVY_APP_ID') || 'cmfggbvdy013fl50ba827mw47';

class GuardError extends Error {
  constructor(msg: string) { super(`[arr7-guard] ABORT — ${msg}`); this.name = 'GuardError'; }
}

/** Refuse if a value matches any forbidden identity, in any shape (exact, case-insensitive, or contained). */
function refuseIfEric(label: string, value: string | null | undefined) {
  if (!value) return;
  const v = value.toLowerCase();
  const hit = ALL_FORBIDDEN.find((f) => v === f || v.includes(f) || f.includes(v));
  if (hit) throw new GuardError(`${label} "${value}" matches a forbidden identity (Eric) — refusing`);
}

export function testCredentials() {
  const email = E('PRIVY_TEST_EMAIL').trim().toLowerCase();
  const otp = E('PRIVY_TEST_OTP').trim();
  if (!email || !otp) throw new GuardError('PRIVY_TEST_EMAIL / PRIVY_TEST_OTP not set in .env.local');
  refuseIfEric('PRIVY_TEST_EMAIL', email);
  if (!/^test-\d+@privy\.io$/.test(email)) throw new GuardError(`PRIVY_TEST_EMAIL "${email}" is not a Privy test account (test-NNNN@privy.io)`);
  return { email, otp };
}

/** PRIVY_TEST_EMAIL → DID, from Privy. Fails CLOSED. Resolved ONCE per run (one passwordless
 *  login): re-resolving before/after every test tripped Privy's rate limit (429), which also starved
 *  the browser's own sign-up. A failed resolution is not cached — the next call retries (and aborts
 *  again if Privy still refuses). Every row-level check below still runs on every call. */
let resolved: Promise<string> | null = null;
export function resolveTestDid(): Promise<string> {
  if (!resolved) resolved = resolveFromPrivy().catch((e) => { resolved = null; throw e; });
  return resolved;
}

async function resolveFromPrivy(): Promise<string> {
  const { email, otp } = testCredentials();
  const H = { 'privy-app-id': APP_ID, Origin: 'http://localhost:3000', 'Content-Type': 'application/json', Accept: 'application/json' };
  const init = await fetch('https://auth.privy.io/api/v1/passwordless/init', { method: 'POST', headers: H, body: JSON.stringify({ email }) });
  if (!init.ok) throw new GuardError(`Privy passwordless/init ${init.status} — cannot resolve the test account`);
  const auth = await fetch('https://auth.privy.io/api/v1/passwordless/authenticate', { method: 'POST', headers: H, body: JSON.stringify({ email, code: otp }) });
  if (!auth.ok) throw new GuardError(`Privy passwordless/authenticate ${auth.status} — cannot resolve the test account`);
  const j = (await auth.json()) as { user?: { id?: string; linked_accounts?: { type?: string; address?: string }[] } };
  const did = j.user?.id ?? '';
  const emails = (j.user?.linked_accounts ?? []).map((a) => (a.address ?? '').toLowerCase()).filter((a) => a.includes('@'));
  if (!/^did:privy:[a-z0-9]+$/.test(did)) throw new GuardError(`Privy returned no usable DID for ${email}`);
  if (emails.length !== 1 || emails[0] !== email) throw new GuardError(`Privy account ${did} has linked emails [${emails.join(', ')}], expected exactly [${email}]`);
  refuseIfEric('resolved DID', did);
  return did;
}

/** The users rows for that DID (exact eq). */
async function usersFor(did: string): Promise<{ id: string; privy_id: string }[]> {
  const { data, error } = await db.from('users').select('id, privy_id').eq('privy_id', did);
  if (error) throw new GuardError(`users lookup failed: ${error.message}`);
  return (data ?? []) as { id: string; privy_id: string }[];
}

/** How many users rows the test account has right now (0 = fresh). Aborts on >1. */
export async function testAccountRowCount(): Promise<{ did: string; n: number }> {
  const did = await resolveTestDid();
  const rows = await usersFor(did);
  if (rows.length > 1) throw new GuardError(`${did} resolves to ${rows.length} users rows — expected at most 1`);
  rows.forEach((r) => { refuseIfEric('users.id', r.id); refuseIfEric('users.privy_id', r.privy_id); });
  return { did, n: rows.length };
}

/** THE only delete path. Exactly one resolved users row, counted + capped + logged, exact-eq deletes. */
export async function cleanupTestAccount(reason: string): Promise<{ did: string; deleted: Record<string, number> }> {
  const did = await resolveTestDid();
  const rows = await usersFor(did);
  if (rows.length !== 1) throw new GuardError(`${did} resolves to ${rows.length} users rows — cleanup needs exactly 1 (${reason})`);
  const uid = rows[0].id;
  refuseIfEric('users.id', uid);
  refuseIfEric('users.privy_id', rows[0].privy_id);
  if (rows[0].privy_id !== did) throw new GuardError(`users.privy_id ${rows[0].privy_id} !== resolved DID ${did}`);

  const count = async (table: string, col: string, val: string) => {
    const { count: n, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq(col, val);
    if (error) throw new GuardError(`count ${table}.${col} failed: ${error.message}`);
    return n ?? 0;
  };
  const plan = {
    users: await count('users', 'id', uid),
    profiles: await count('profiles', 'user_id', uid),
    'follows(follower)': await count('follows', 'follower_id', did),
    'follows(following)': await count('follows', 'following_id', did),
  };
  console.log(`[arr7-guard] ${reason} — about to delete for ${did} / ${uid}:`, JSON.stringify(plan));
  const over = Object.entries(plan).filter(([, n]) => n > MAX_PER_TABLE);
  if (over.length) throw new GuardError(`would delete more than ${MAX_PER_TABLE} rows from ${over.map(([t, n]) => `${t}=${n}`).join(', ')} — refusing`);
  if (plan.users !== 1) throw new GuardError(`users count ${plan.users} !== 1`);
  // Deleting the users row CASCADES (FK on delete cascade) into these tables. A fresh-signup account
  // never has rows there; if it does, deleting would reach beyond users/profiles/follows → refuse.
  const cascades: [string, string][] = [['user_assets', 'user_id'], ['conversations', 'user_a'], ['conversations', 'user_b'], ['messages', 'sender_id'], ['tracks', 'composer_user_id'], ['albums', 'composer_id'], ['track_versions', 'composer_id'], ['downloads', 'user_id']];
  for (const [t, c] of cascades) {
    const n = await count(t, c, uid);
    if (n > 0) throw new GuardError(`${t}.${c} holds ${n} row(s) for ${uid} — deleting the users row would cascade into it; refusing`);
  }

  const del = async (table: string, col: string, val: string) => {
    const { error, count: n } = await db.from(table).delete({ count: 'exact' }).eq(col, val);
    if (error) throw new GuardError(`delete ${table}.${col} failed: ${error.message}`);
    return n ?? 0;
  };
  const deleted = {
    'follows(follower)': await del('follows', 'follower_id', did),
    'follows(following)': await del('follows', 'following_id', did),
    profiles: await del('profiles', 'user_id', uid),
    users: await del('users', 'id', uid),
  };
  console.log(`[arr7-guard] deleted:`, JSON.stringify(deleted));
  return { did, deleted };
}
