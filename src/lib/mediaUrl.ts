// ── mediaUrl — resolve a stored image to its DISPLAY rendition (NO transform) ──
//
// The app used to build Supabase Image-Transformation URLs (/render/image?width=…).
// That endpoint is metered and its usage scaled with traffic → quota blew. This now
// returns PLAIN public object URLs (which cost nothing): a BAKED rendition when one
// exists, else the master.
//
// Renditions are baked at PUBLISH (uploadImageWithRenditions) and stored ALONGSIDE
// the master as `{masterPath}.{width}.webp` (e.g. `.../abc.jpg.600.webp`). The suffix
// is appended to the FULL master path, so it's reversible — a missing rendition 404s
// and the global <ImageRenditionFallback/> handler strips `.{w}.webp` back to the
// master. No DB change: the URL fully determines the rendition path.
//
// Only post-media IMAGES get renditions. profile-images (avatars, deck covers) are
// already baked small at upload → served as-is. Videos / foreign hosts / already-
// rendition URLs pass through untouched.

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;
const PUBLIC_OBJECT = '/storage/v1/object/public/';
const RENDITION_SUFFIX = /\.(?:600|1600|2560)\.webp$/;

/** The baked display sizes (longest side, WebP). feedImage picks the nearest ≥ the
 *  requested width; the publish bake produces exactly these. Keep the two in sync.
 *  Brief Q1 — 2560 tier added for large viewers (theatre/lightbox stages) so a stage
 *  rendered above 1600px stops upscaling the 1600. Baked ONLY when the master's longest
 *  side ≥ 2560 (renditionsServer guard); backfilled for eligible existing posts. */
export const RENDITION_WIDTHS = [600, 1600, 2560] as const;

/** Brief M11 §1 — the THUMB display class (~200px): retina-safe for a ~90px collage tile
 *  (deck-collage tiles were over-fetching the 600 class by ~6×). Stream posters honour it
 *  exactly (arbitrary ?width= param); baked post-media IMAGES floor at the smallest baked
 *  rendition (600) — those await a small-rendition BACKFILL (not re-baked here). Profile
 *  images (deck covers/avatars) are already small at upload. */
export const THUMB_WIDTH = 200;

/** Map a requested display width → the rendition size to serve (nearest baked ≥ it).
 *  Brief Q1 — CAP at the largest tier instead of falling back to the MASTER: a request
 *  above 2560 now serves the 2560 rendition (a slight downscale) rather than the raw
 *  multi-MB master. So feedImage never serves a master to a stage. (A genuinely-missing
 *  rendition still 404s → the global ImageRenditionFallback strips the suffix — the
 *  transitional safety net until the 2560 backfill completes.) */
function renditionFor(width: number): number {
  for (const w of RENDITION_WIDTHS) if (width <= w) return w;
  return RENDITION_WIDTHS[RENDITION_WIDTHS.length - 1];
}

/**
 * Resolve a stored image URL to the URL to actually load — a baked rendition when
 * applicable, else the master. NEVER a transform URL.
 * @param url      the stored public object URL (or anything — non-images pass through)
 * @param width    target CSS×DPR pixel width (retina-aware — request ~2–3× the CSS width)
 * @param _quality accepted for call-site compatibility; ignored (quality is baked in)
 */
// Brief P1b — Cloudflare Stream thumbnails (…/thumbnails/thumbnail.jpg) DO support live
// sizing params, unlike our baked-rendition images. Size them to the requested display
// width, longest-side (width=height=w + fit=clip = the FULL frame, aspect-maintained, no
// double-crop against the poster's objectFit:cover). CDN-cached per (uid,width) variant.
// NOTE: this is DISPLAY only — the V2e coin-metadata chain returns the RAW thumbnail URL
// (never through here), so minted-forever metadata stays untransformed.
const STREAM_THUMB = /\.cloudflarestream\.com\/[^/]+\/thumbnails\/thumbnail\.(?:jpg|gif)/i;

export function feedImage(url: string | null | undefined, width: number, _quality = 78): string {
  if (!url) return url ?? '';
  if (STREAM_THUMB.test(url)) {
    const w = Math.round(width);
    return `${url.split('?')[0]}?width=${w}&height=${w}&fit=clip`;
  }
  // Foreign hosts / already-transformed URLs lack the object marker → untouched.
  if (!url.includes(PUBLIC_OBJECT)) return url;
  const path = url.split('?')[0];
  // Videos and other non-images never get a rendition.
  if (!IMAGE_EXT.test(path)) return url;
  // Already a rendition (idempotent) → as-is.
  if (RENDITION_SUFFIX.test(path)) return url;
  // Only post-media images are baked into renditions. profile-images (avatars/deck
  // covers) are already baked small at upload → serve the master directly.
  if (!path.includes('/post-media/')) return url;
  // Brief Q1 — renditionFor now CAPS at the top tier (never null), so this never returns
  // the master. A stage requesting >2560 gets the 2560 rendition, not the raw master.
  return `${path}.${renditionFor(width)}.webp`;
}
