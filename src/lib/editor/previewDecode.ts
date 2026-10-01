// Brief C2 §2 (SKETCH — perf/c2-heavy worktree, not merged) — import→crop interactive < 500ms.
// Decode the picked file to a CAPPED working preview (≤2048px long edge) via createImageBitmap,
// which scales DURING decode so the full-res buffer (190MB @48MP) is never materialized on the main
// thread. The full-res file is NOT touched again until bake (see bakeWorker). Keep X5 colour.
//
// WIRE-IN: CropTool + FinishingStep take `preview: ImageBitmap` for display; the original File is
// retained only for the final bake. Measure import→interactive against the 12MP fixture before merge.

const PREVIEW_MAX = 2048;

export interface WorkingPreview {
  bitmap: ImageBitmap;   // ≤2048 long edge, colour-managed
  naturalW: number;      // ORIGINAL pixel dims (for the bake rect math)
  naturalH: number;
  file: File;            // kept for the full-res bake only
}

/** Decode a capped, colour-managed preview without ever holding the full-res bitmap. */
export async function decodeWorkingPreview(file: File): Promise<WorkingPreview> {
  // Read the natural dims cheaply first (so crop rect math uses the TRUE source size, not the cap).
  const { w, h } = await readNaturalSize(file);
  const long = Math.max(w, h);
  const opts: ImageBitmapOptions = { colorSpaceConversion: 'default', resizeQuality: 'high' };
  if (long > PREVIEW_MAX) {
    if (w >= h) opts.resizeWidth = PREVIEW_MAX; else opts.resizeHeight = PREVIEW_MAX;
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, opts); }
  catch { bitmap = await createImageBitmap(file, { colorSpaceConversion: 'default' }); } // older engines
  return { bitmap, naturalW: w, naturalH: h, file };
}

/** Natural size via a throwaway bitmap at 1px? No — use the cheap ImageDecoder/HTMLImage path. */
async function readNaturalSize(file: File): Promise<{ w: number; h: number }> {
  // createImageBitmap at a tiny resize still parses the header for dims but not the full raster.
  const probe = await createImageBitmap(file, { resizeWidth: 1 }).catch(() => null);
  if (probe) { /* resize loses ratio-source dims; fall through to the reliable path below */ probe.close?.(); }
  // Reliable: decode the header via an <img> (object URL), read naturalWidth/Height, revoke.
  return await new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
