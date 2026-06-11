import { supabase } from './supabase/client';
import type { EditParams } from './editor/params';

/** Bucket reused for look thumbnails — same public bucket + write pattern as post
 *  media (anon client uploads already work there, so no new storage policy needed). */
const THUMB_BUCKET = 'post-media';

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
 *     thumb_url text,                   -- burned-in source frame + look (PALETTE tile)
 *     created_at timestamptz default now()
 *   );
 *   create index if not exists looks_user_id_idx on looks(user_id);
 *   -- if the table predates the thumbnail feature:
 *   -- alter table looks add column if not exists thumb_url text;
 */

export interface SavedLook {
  id: string;
  name: string;
  params: EditParams;
  thumb_url?: string | null;
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
  return { id: data.id, name: data.name, params: stripVersion(data.params), thumb_url: data.thumb_url ?? null, created_at: data.created_at };
}

export async function getLooks(userId: string): Promise<SavedLook[]> {
  const { data, error } = await supabase
    .from('looks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  // Pre-migration the table won't exist — degrade gracefully rather than crash.
  if (error) { console.warn('[looksService.getLooks]', error.message); return []; }
  return (data ?? []).map((d) => ({ id: d.id, name: d.name, params: stripVersion(d.params), thumb_url: d.thumb_url ?? null, created_at: d.created_at }));
}

/**
 * Upload a look's thumbnail (the burned-in source frame + look) and return its
 * public URL. Keyed by the look's id under a DID-prefixed path, mirroring
 * uploadImage's convention. upsert:true so a re-save of the same look replaces it.
 */
export async function uploadLookThumb(blob: Blob, privyUserId: string, lookId: string): Promise<string> {
  const prefix = privyUserId.replace(/[^a-zA-Z0-9-]/g, '_');
  const path = `look-thumbs/${prefix}/${lookId}.jpg`;
  const file = new File([blob], `${lookId}.jpg`, { type: 'image/jpeg' });
  const { error } = await supabase.storage.from(THUMB_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(THUMB_BUCKET).getPublicUrl(path);
  return publicUrl;
}

/** Attach a thumbnail URL to an already-created look (kept separate so createLook's
 *  data path is unchanged — the thumbnail is an enhancement layered on after). */
export async function setLookThumb(lookId: string, url: string): Promise<void> {
  const { error } = await supabase.from('looks').update({ thumb_url: url }).eq('id', lookId);
  if (error) throw error;
}
