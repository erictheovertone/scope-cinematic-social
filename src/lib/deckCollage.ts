// ── DECK COLLAGE BAKE ─────────────────────────────────────────────────────────
// Composes up to 4 of a deck's post thumbnails into ONE small WebP (~600px wide,
// the 4-across display size) client-side via canvas — the load-speed fix: one
// ~50-150KB baked cover per deck instead of N full images composited live.
//
// OOM-safe: each source is fetched then decoded via createImageBitmap with a
// resizeWidth cap (never the full-res image in memory). CORS-fetched blobs decode
// clean (no canvas taint). EVERYTHING is best-effort — any failure returns null
// and the caller falls back to the first post's image / a placeholder.
//
// Composition (mobile has no collage → this is the intended desktop layout):
//   1 → full bleed · 2 → side-by-side · 3 → tall-left + 2 stacked · 4 → 2×2.

import { feedImage } from '@/lib/mediaUrl';
import { uploadImage, updateDeck } from '@/lib/userService';

const OUT_W = 600; // display width for a 4-across cell
const GAP = 3;

type Cell = { x: number; y: number; w: number; h: number };

function cells(n: number, W: number, H: number): Cell[] {
  const g = GAP;
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
  if (n === 2) { const w = (W - g) / 2; return [{ x: 0, y: 0, w, h: H }, { x: w + g, y: 0, w, h: H }]; }
  if (n === 3) {
    const lw = (W - g) / 2, rw = lw, rh = (H - g) / 2;
    return [{ x: 0, y: 0, w: lw, h: H }, { x: lw + g, y: 0, w: rw, h: rh }, { x: lw + g, y: rh + g, w: rw, h: rh }];
  }
  const w = (W - g) / 2, h = (H - g) / 2;
  return [{ x: 0, y: 0, w, h }, { x: w + g, y: 0, w, h }, { x: 0, y: h + g, w, h }, { x: w + g, y: h + g, w, h }];
}

function drawCover(ctx: CanvasRenderingContext2D, bm: ImageBitmap, c: Cell) {
  const scale = Math.max(c.w / bm.width, c.h / bm.height);
  const dw = bm.width * scale, dh = bm.height * scale;
  ctx.drawImage(bm, c.x + (c.w - dw) / 2, c.y + (c.h - dh) / 2, dw, dh);
}

/** Bake the collage → WebP Blob at the given W/H ratio (the user's shared AR).
 *  null on any failure (caller falls back to CSS-crop of a fallback image). */
export async function bakeDeckCollage(thumbUrls: string[], ratio = 1.6): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const OUT_H = Math.max(120, Math.round(OUT_W / (ratio || 1.6)));
  const urls = thumbUrls.filter(Boolean).slice(0, 4);
  if (urls.length === 0) return null;
  try {
    const bitmaps = await Promise.all(urls.map(async (u) => {
      const res = await fetch(feedImage(u, 400), { mode: 'cors' });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const blob = await res.blob();
      // resizeWidth cap = the OOM guard (never hold the full-res decode).
      return await createImageBitmap(blob, { resizeWidth: 400, resizeQuality: 'medium' } as ImageBitmapOptions);
    }));
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W; canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, OUT_W, OUT_H);
    const cs = cells(bitmaps.length, OUT_W, OUT_H);
    bitmaps.forEach((bm, i) => { drawCover(ctx, bm, cs[i]); bm.close?.(); });
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/webp', 0.82));
  } catch (e) {
    console.warn('[deck-collage] bake failed → fallback:', (e as Error)?.message);
    return null;
  }
}

/** Bake + upload + persist deck.thumbnail_url. Returns the new URL, or null. */
export async function bakeAndStoreDeckCover(deckId: string, thumbUrls: string[], privyId?: string, ratio = 1.6): Promise<string | null> {
  const blob = await bakeDeckCollage(thumbUrls, ratio);
  if (!blob) return null;
  try {
    const file = new File([blob], `deck-${deckId}.webp`, { type: 'image/webp' });
    const url = await uploadImage(file, 'profile-images', privyId);
    await updateDeck(deckId, { thumbnail_url: url } as Parameters<typeof updateDeck>[1]);
    return url;
  } catch (e) {
    console.warn('[deck-collage] store failed:', (e as Error)?.message);
    return null;
  }
}
