/**
 * EditGeometry — the additive, re-editable geometry record for a post.
 *
 * Stored in the new nullable `posts.edit_geometry` jsonb column. It NEVER
 * replaces `layout_id`, which remains the only aspect-ratio source of truth.
 * Posts created before this feature have no edit_geometry and render exactly
 * as before (all AR reads still go through layout_id / aspectRatio.ts).
 *
 * Geometry is affine only this round — crop + straighten + rotate. `skew` is
 * carried in the schema (always neutral {x:0,y:0}) so the data model is
 * forward-compatible, but it is NOT baked or applied yet.
 *
 * ── SKEW / WebGL boundary ───────────────────────────────────────────────
 * Skew is a perspective (non-affine) transform and cannot be baked with a
 * plain 2D canvas or expressed as a simple CSS transform that survives the
 * crop. When skew goes live it adopts a gl-react WebGL pipeline, shipping in
 * the same build as the first color tool. Until then skew stays inert.
 */

export interface EditGeometry {
  /** AR == the chosen layout_id (canonical AR id). */
  ar: string;
  /** Crop window as fractions of the (rotate-oriented) source, 0..1. */
  crop: { x: number; y: number; w: number; h: number };
  /** Continuous straighten, degrees, -45..45. */
  straighten: number;
  /** Orthogonal rotate, one of 0 | 90 | 180 | 270. */
  rotate: number;
  /** Deferred — always { x: 0, y: 0 } this round. */
  skew: { x: number; y: number };
}

/** Neutral geometry for a given AR with a full-frame crop. */
export function neutralGeometry(ar: string): EditGeometry {
  return { ar, crop: { x: 0, y: 0, w: 1, h: 1 }, straighten: 0, rotate: 0, skew: { x: 0, y: 0 } };
}

/** True when geometry is a plain crop (no straighten/rotate) — the legacy path. */
export function isPlainCrop(g: EditGeometry): boolean {
  return g.straighten === 0 && (g.rotate % 360) === 0;
}

/**
 * Cover-scale factor so rotating a crop window by `deg` never exposes empty
 * corners. `arW`/`arH` are the crop window's own width/height ratio.
 */
export function rotateCoverScale(deg: number, arW: number, arH: number): number {
  const r = Math.abs((deg * Math.PI) / 180);
  const c = Math.cos(r), s = Math.sin(r);
  const sx = (arW * c + arH * s) / arW;
  const sy = (arW * s + arH * c) / arH;
  return Math.max(sx, sy);
}

/**
 * Bake an image File to a JPEG at the AR's canonical export dims, applying the
 * affine geometry (rotate → straighten → crop). Falls back to the original
 * file on any failure so uploads never hang.
 *
 * Regression-safe: when geometry isPlainCrop, this reduces to exactly the old
 * crop-rect → canvas draw (same source rect, same AR), so existing-style posts
 * bake identically (display is AR-driven, so canonical dims are equivalent).
 */
export async function bakeImageGeometry(
  file: File,
  geom: EditGeometry,
  exportW: number,
  exportH: number,
): Promise<File> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const nW = img.naturalWidth;
        const nH = img.naturalHeight;
        const rot = ((geom.rotate % 360) + 360) % 360;

        // Oriented source dims after the 90° rotate.
        const oW = rot === 90 || rot === 270 ? nH : nW;
        const oH = rot === 90 || rot === 270 ? nW : nH;

        // Crop window in oriented space (px).
        const cw = geom.crop.w * oW;
        const ch = geom.crop.h * oH;
        const ccx = (geom.crop.x + geom.crop.w / 2) * oW;
        const ccy = (geom.crop.y + geom.crop.h / 2) * oH;

        const canvas = document.createElement('canvas');
        canvas.width = exportW;
        canvas.height = exportH;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, exportW, exportH);

        // Map the oriented crop window onto the full canvas.
        ctx.translate(exportW / 2, exportH / 2);
        ctx.scale(exportW / cw, exportH / ch);

        // Straighten rotation about the crop centre, with cover-scale.
        if (geom.straighten !== 0) {
          const cover = rotateCoverScale(geom.straighten, cw, ch);
          ctx.scale(cover, cover);
          ctx.rotate((geom.straighten * Math.PI) / 180);
        }

        // Move to oriented crop centre.
        ctx.translate(-ccx, -ccy);

        // Apply the 90° orientation, then draw the source at natural origin.
        if (rot !== 0) {
          ctx.translate(oW / 2, oH / 2);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.translate(-nW / 2, -nH / 2);
        }
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          const base = file.name.replace(/\.[^.]+$/, '');
          resolve(new File([blob], `${base}-cropped.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.9);
      } catch { resolve(file); }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

/**
 * Inline styles to spread onto the media element of an AR-framed,
 * overflow-hidden crop container (the crop preview, and video playback — no
 * re-encode). The container must be sized to the AR with overflow hidden.
 *
 * Technique: the media keeps its natural AR (`height:auto`) and is widened so
 * the crop window's width fills the frame (`width = 100/cropW%`), then
 * translated so the crop window's top-left aligns to the frame. Because the
 * crop is AR-locked to the frame, the crop window's height fills the frame
 * exactly — no object-fit double-crop. rotate/straighten are layered on for
 * completeness (exact for the no-rotate case the crop tool produces by
 * default; approximate when combined with an off-centre crop).
 */
export function geometryMediaStyle(geom: EditGeometry): React.CSSProperties {
  const rot = ((geom.rotate % 360) + 360) % 360;
  const w = geom.crop.w > 0 ? geom.crop.w : 1;
  const tx = -geom.crop.x * 100;
  const ty = -geom.crop.y * 100;
  const spin = rot + geom.straighten;
  const cover = geom.straighten !== 0
    ? rotateCoverScale(geom.straighten, geom.crop.w, geom.crop.h)
    : 1;
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: `${100 / w}%`,
    height: 'auto',
    transformOrigin: 'center center',
    transform:
      `translate(${tx}%, ${ty}%)` +
      (spin !== 0 ? ` rotate(${spin}deg)` : '') +
      (cover !== 1 ? ` scale(${cover})` : ''),
  };
}
