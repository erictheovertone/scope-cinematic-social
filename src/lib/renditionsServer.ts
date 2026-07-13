// ── renditionsServer — bake display renditions with sharp (SERVER ONLY) ───────
//
// The publish path used a CLIENT canvas.toBlob('image/webp') to bake renditions.
// On devices without canvas-WebP encode (notably some iOS), toBlob SILENTLY falls
// back to PNG — so the stored "renditions" were huge PNGs (a 109KB JPEG master
// became a 557KB PNG "1600"), making the feed SLOWER than the master. sharp
// encodes real WebP everywhere. This module is imported by the /api/renditions
// route and the backfill script — NEVER by client code (it would bundle sharp).

import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RENDITION_WIDTHS } from './mediaUrl';

const PUBLIC_MARKER = '/storage/v1/object/public/';
// Long-cache immutable (unique filenames). NOTE: the project currently serves
// public objects as `no-cache` regardless — set here so it's correct if/when the
// serving layer honors it (see the audit note).
const CACHE = 'public, max-age=31536000, immutable';

/** master public URL → { bucket, path } (path has no query, no leading slash). */
function parsePublicUrl(url: string): { bucket: string; path: string } | null {
  const i = url.indexOf(PUBLIC_MARKER);
  if (i === -1) return null;
  const rest = url.slice(i + PUBLIC_MARKER.length).split('?')[0];
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

/**
 * Bake `{master}.600.webp` / `.1600.webp` from a master image URL and upload them
 * ALONGSIDE the master (the exact paths feedImage derives). Real WebP, quality 78,
 * never upscaled past the source. Idempotent (upsert). Returns per-size results.
 */
export async function bakeRenditionsFromUrl(
  supabase: SupabaseClient,
  masterUrl: string,
): Promise<{ width: number; ok: boolean; bytes?: number; error?: string }[]> {
  const parsed = parsePublicUrl(masterUrl);
  if (!parsed) return RENDITION_WIDTHS.map((w) => ({ width: w, ok: false, error: 'not a public object url' }));
  const { bucket, path } = parsed;

  const res = await fetch(masterUrl);
  if (!res.ok) return RENDITION_WIDTHS.map((w) => ({ width: w, ok: false, error: `fetch master ${res.status}` }));
  const input = Buffer.from(await res.arrayBuffer());

  const out: { width: number; ok: boolean; bytes?: number; error?: string }[] = [];
  for (const w of RENDITION_WIDTHS) {
    try {
      const webp = await sharp(input)
        .rotate() // honor EXIF orientation before resize
        .resize({ width: w, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 78 })
        .toBuffer();
      const { error } = await supabase.storage.from(bucket).upload(`${path}.${w}.webp`, webp, {
        upsert: true, contentType: 'image/webp', cacheControl: CACHE,
      });
      if (error) out.push({ width: w, ok: false, error: error.message });
      else out.push({ width: w, ok: true, bytes: webp.length });
    } catch (e) {
      out.push({ width: w, ok: false, error: (e as Error).message });
    }
  }
  return out;
}
