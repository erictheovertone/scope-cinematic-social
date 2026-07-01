// ── mediaUrl — the ONE place transform (resize/WebP) URLs are built ──────────
//
// Feed/grid/lightbox request DISPLAY-sized WebP via Supabase Image Transformations
// (render/image endpoint) instead of the full-res original. Originals in storage are
// untouched (the finishing suite / future server-bake still read them). Transformed
// URLs are CDN-cacheable (max-age=31536000), preserving media fix #1.
//
// Passes through UNCHANGED: videos, non-Supabase URLs, and already-transformed URLs —
// so it's safe to call anywhere; only real Supabase image objects get rewritten.

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;
const PUBLIC_OBJECT = '/storage/v1/object/public/';

/**
 * Rewrite a Supabase public IMAGE object URL to a resized WebP transform URL.
 * @param url  the stored public object URL (or anything — non-images pass through)
 * @param width  target pixel width (retina-aware: request ~2–3× the CSS width)
 * @param quality  1–100 (default 78)
 */
export function feedImage(url: string | null | undefined, width: number, quality = 78): string {
  if (!url) return url ?? '';
  // Only Supabase public OBJECT URLs are transformable; render/image URLs & foreign
  // hosts already lack this marker → pass through untouched.
  if (!url.includes(PUBLIC_OBJECT)) return url;
  // Video (or any non-image) must never hit the image transform endpoint.
  const path = url.split('?')[0];
  if (!IMAGE_EXT.test(path)) return url;

  const transformed = url.split('?')[0].replace(PUBLIC_OBJECT, '/storage/v1/render/image/public/');
  // resize=contain: width-only transforms otherwise keep the ORIGINAL height (distorting the
  // aspect → the normalized crop render lands zoomed/off). contain scales proportionally, so
  // getCropStyle (untouched) gets a right-aspect image and renders the crop exactly as full-res.
  return `${transformed}?width=${width}&quality=${quality}&format=webp&resize=contain`;
}
