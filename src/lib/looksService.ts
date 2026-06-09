import { supabase } from './supabase/client';
import type { EditParams } from './editor/params';

/**
 * looksService — CREATE + LIST saved Looks (Brief: ADD TO PALETTE). A Look is the
 * current EditParams saved for reuse. This is the SAVE side only; applying a Look
 * across posts + the LUT/.cube engine are the later Look Palette brief.
 *
 * IDENTIFIER TYPING (the recurring landmine): `userId` here is the **uuid**
 * (users.id / profiles.user_id), resolved by the caller via getUserByPrivyId(did)
 * → users.id. NEVER pass the Privy DID here.
 *
 * Persistence: requires the `looks` table (migration PROPOSED for Eric, not run):
 *   create table if not exists looks (
 *     id uuid default gen_random_uuid() primary key,
 *     user_id uuid not null,
 *     name text not null,
 *     params jsonb not null,            -- versioned {v:1,...EditParams}
 *     created_at timestamptz default now()
 *   );
 *   create index if not exists looks_user_id_idx on looks(user_id);
 */

export interface SavedLook {
  id: string;
  name: string;
  params: EditParams;
  created_at?: string;
}

function stripVersion(p: unknown): EditParams {
  if (p && typeof p === 'object') {
    const { v: _v, ...rest } = p as Record<string, unknown>;
    void _v;
    return rest as unknown as EditParams;
  }
  return p as EditParams;
}

export async function createLook(userId: string, name: string, params: EditParams): Promise<SavedLook> {
  const { data, error } = await supabase
    .from('looks')
    .insert([{ user_id: userId, name, params: { v: 1, ...params } }])
    .select()
    .single();
  if (error) { console.error('[looksService.createLook]', error); throw error; }
  return { id: data.id, name: data.name, params: stripVersion(data.params), created_at: data.created_at };
}

export async function getLooks(userId: string): Promise<SavedLook[]> {
  const { data, error } = await supabase
    .from('looks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  // Pre-migration the table won't exist — degrade gracefully rather than crash.
  if (error) { console.warn('[looksService.getLooks]', error.message); return []; }
  return (data ?? []).map((d) => ({ id: d.id, name: d.name, params: stripVersion(d.params), created_at: d.created_at }));
}
