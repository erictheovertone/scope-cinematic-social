// ── REPERTORY — curated PROGRAMS of collected work ────────────────────────────
//
// collected_stacks / collected_stack_items (the decks pattern, but for HELD
// work). HOLD-ONLY SEMANTICS: membership rows PERSIST; every render FILTERS by
// current holdings (the badgeHoldings-style live truth) — selling drops an item
// from every program's render/count, re-collecting restores it (the row never
// died). Counts are held-items-only, everywhere.
//
// user_id = users.id (uuid — the holdings/badge engines' key). Title hard-cap
// 14 chars enforced HERE (service-side slice) + input maxLength client-side +
// varchar(14) in the schema — three layers, one number.

import { supabase } from '@/lib/supabase/client';

export const STACK_TITLE_MAX = 14;

export interface CollectedStack {
  id: string;
  user_id: string;
  title: string;
  hero_post_id: string | null;
  hero_banner_url: string | null;
  position: number;
  created_at: string;
  /** item post_ids in curated order (UNFILTERED — render filters by held). */
  itemPostIds: string[];
}

export async function getStacks(userId: string): Promise<CollectedStack[]> {
  const { data: stacks, error } = await supabase
    .from('collected_stacks')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });
  if (error || !stacks?.length) return [];
  const { data: items } = await supabase
    .from('collected_stack_items')
    .select('stack_id, post_id, position')
    .in('stack_id', stacks.map((s) => s.id))
    .order('position', { ascending: true });
  const byStack = new Map<string, string[]>();
  for (const it of items ?? []) {
    const list = byStack.get(it.stack_id) ?? [];
    list.push(it.post_id);
    byStack.set(it.stack_id, list);
  }
  return stacks.map((s) => ({ ...s, itemPostIds: byStack.get(s.id) ?? [] }));
}

export async function createStack(
  userId: string, title: string, postIds: string[], heroPostId: string | null,
): Promise<CollectedStack | null> {
  const capped = title.slice(0, STACK_TITLE_MAX).trim();
  if (!capped) return null;
  const { data: stack, error } = await supabase
    .from('collected_stacks')
    .insert({ user_id: userId, title: capped, hero_post_id: heroPostId })
    .select('*')
    .single();
  if (error || !stack) { console.error('[stacks] create failed:', error?.message); return null; }
  if (postIds.length) {
    const rows = postIds.map((p, i) => ({ stack_id: stack.id, post_id: p, position: i }));
    const { error: ie } = await supabase.from('collected_stack_items').upsert(rows, { onConflict: 'stack_id,post_id', ignoreDuplicates: true });
    if (ie) console.error('[stacks] items insert failed:', ie.message);
  }
  return { ...stack, itemPostIds: postIds };
}

export async function addStackItems(stackId: string, postIds: string[], startPosition: number): Promise<boolean> {
  const rows = postIds.map((p, i) => ({ stack_id: stackId, post_id: p, position: startPosition + i }));
  const { error } = await supabase.from('collected_stack_items').upsert(rows, { onConflict: 'stack_id,post_id', ignoreDuplicates: true });
  return !error;
}

export async function removeStackItem(stackId: string, postId: string): Promise<boolean> {
  const { error } = await supabase.from('collected_stack_items').delete().eq('stack_id', stackId).eq('post_id', postId);
  return !error;
}

export async function renameStack(stackId: string, title: string): Promise<boolean> {
  const capped = title.slice(0, STACK_TITLE_MAX).trim();
  if (!capped) return false;
  const { error } = await supabase.from('collected_stacks').update({ title: capped }).eq('id', stackId);
  return !error;
}

export async function deleteStack(stackId: string): Promise<boolean> {
  const { error } = await supabase.from('collected_stacks').delete().eq('id', stackId);
  return !error;
}

export async function setStackHero(stackId: string, postId: string, bannerUrl: string | null): Promise<boolean> {
  const { error } = await supabase.from('collected_stacks').update({ hero_post_id: postId, hero_banner_url: bannerUrl }).eq('id', stackId);
  return !error;
}

// ── HERO BAKE — client-side, OOM-safe ─────────────────────────────────────────
// createImageBitmap with resizeWidth cap (never decodes the full original into
// memory) → canvas center-crop to the banner ratio → WebP ~1500w → storage.
// Center-crop v1 (drag-to-position noted as a later nicety).

export const BANNER_RATIO = 5.5; // ultrawide program banner, w/h
const BAKE_W = 1500;

export async function bakeHeroBanner(imageUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) { console.warn('[stacks] hero source fetch', res.status); return null; }
    const src = await res.blob();
    // createImageBitmap: resize options throw on older Safari — try with, fall
    // back to a plain decode (the canvas step downscales anyway).
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(src, { resizeWidth: 2000, resizeQuality: 'high' } as ImageBitmapOptions);
    } catch {
      bmp = await createImageBitmap(src);
    }
    const outW = Math.min(BAKE_W, bmp.width);
    const outH = Math.round(outW / BANNER_RATIO);
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // center-crop: cover the banner window from the bitmap
    const scale = Math.max(outW / bmp.width, outH / bmp.height);
    const sw = outW / scale, sh = outH / scale;
    const sx = (bmp.width - sw) / 2, sy = (bmp.height - sh) / 2;
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, outW, outH);
    bmp.close();
    // WebP first; Safari doesn't encode WebP (spec-falls-back or nulls) → JPEG.
    // The blob's ACTUAL type travels with it (upload declares it truthfully —
    // the bucket enforces a mime whitelist).
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob || blob.type !== 'image/webp') {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85)) ?? blob;
    }
    if (!blob) console.warn('[stacks] hero bake: canvas export returned null');
    return blob;
  } catch (e) {
    console.warn('[stacks] hero bake failed:', (e as Error).message);
    return null;
  }
}

export async function uploadHeroBanner(userId: string, stackId: string, blob: Blob): Promise<string | null> {
  // Truthful mime + extension: Safari bakes JPEG, Chrome WebP — declare what
  // the blob actually is (the bucket whitelist rejects mislabeled uploads).
  const isJpeg = blob.type === 'image/jpeg';
  const path = `stacks/${userId}/${stackId}-hero.${isJpeg ? 'jpg' : 'webp'}`;
  const { error } = await supabase.storage.from('post-media').upload(path, blob, { upsert: true, cacheControl: '31536000', contentType: blob.type || 'image/webp' });
  if (error) { console.warn('[stacks] hero upload failed:', error.message); return null; }
  const { data } = supabase.storage.from('post-media').getPublicUrl(path);
  // Bust the CDN on re-bake (same path, upsert) — the same-URL swap discipline.
  return data?.publicUrl ? `${data.publicUrl}?v=${stackId.slice(0, 8)}-${Math.floor(Math.random() * 1e6)}` : null;
}
