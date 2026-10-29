// ── serverAuth — the verified caller for owner-gated routes (MUS-1 manage, AUG-1 downloads) ─────
// The older music routes trust a client-passed userId. Anything that edits someone's catalog or
// hands out a paid file instead verifies the Privy access token (privyVerify) and resolves the
// DID to users.id here. No token / bad token → 401; the caller decides what 403 means.
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyRequest } from '@/lib/privyVerify';

export const serviceClient = (): SupabaseClient =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export type Caller = { did: string; userId: string };

/** The verified caller, or null (→ 401). */
export async function callerOf(req: Request, supabase: SupabaseClient): Promise<Caller | null> {
  const did = await verifyRequest(req);
  if (!did) return null;
  const { data } = await supabase.from('users').select('id').eq('privy_id', did).maybeSingle();
  return data?.id ? { did, userId: data.id as string } : null;
}
