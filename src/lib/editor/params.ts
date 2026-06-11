/**
 * EditParams — THE saved edit.
 *
 * This flat object IS the entire stored edit for the finishing suite. It holds
 * slider STOP values (and a couple of ids), NEVER pixels. The render pipeline
 * maps these stops to shader inputs at draw time (see mapping.ts); baking reads
 * the same params. Geometry (crop/straighten/rotate) is NOT here — it lives in
 * the existing `edit_geometry` model and is owned by CropTool.
 *
 * Only `exposure` is wired in this scaffolding brief; every other field exists
 * so the store is complete and future tools are purely additive.
 */

import type { Curves } from './curveEngine';
import { makeIdentityCurves } from './curveEngine';

export interface WhiteBalance {
  /** temperature stop, bi −6..+6 (cool ↔ warm) */
  t: number;
  /** tint stop, bi −6..+6 (green ↔ magenta) */
  tint: number;
}

/**
 * Split Tone — tints SHADOWS and HIGHLIGHTS independently toward a chosen hue
 * (Brief 5, consolidated). Each region has a hue key (from the split-tone
 * palette, or null = none) and an additive strength stop 0..12.
 */
export interface SplitTone {
  shadowsHue: string | null;
  shadowsStrength: number;
  highlightsHue: string | null;
  highlightsStrength: number;
}

export interface EditParams {
  // ── CORRECTION (free) ──
  exposure: number;        // bi, stop −6..+6  (the one wired pass)
  denoise: number;         // add, stop 0..12 (edge-aware bilateral, photo only)
  contrast: number;        // bi, stop −6..+6
  saturation: number;      // bi, stop −6..+6
  whiteBalance: WhiteBalance;
  fade: number;            // add, stop 0..12 (lifted blacks)
  sharpen: number;         // add, stop 0..12
  vignette: number;        // bi, stop −6..+6 (darken ↔ lighten edges)
  skinTone: number;        // bi, stop −6..+6

  // ── Pro ──
  clarity: number;         // add, stop 0..12 (midtone local contrast)
  bloom: number;           // add, stop 0..12
  halation: number;        // add, stop 0..12
  // ── Grain — real film-stock picker (Brief 4). Just-parameters, no pixels. ──
  grainStock: string | null; // selected GRAIN_STOCKS key, or null = no grain
  grainIntensity: number;    // add, stop 0..12 (overlay blend strength)
  blur: number;            // add, stop 0..12 (gaussian)
  splitTone: SplitTone;    // tonal colour tint (shadows/highlights, hue palette)

  // ── CURVES (Brief 6 luma + Brief 7 R/G/B/HUE) — control points; LUTs derived ──
  curves: Curves;

  // ── LOOK / LUT ──
  lutId: string | null;    // selected Look LUT id, or null
  lutIntensity: number;    // add, stop 0..12 (default 0 = no LUT applied)

  // ── VIDEO ── the paused timestamp the creator graded from (the "hero frame").
  // Metadata only — never read by the pipeline. Becomes the POSTER frame at
  // publish (separate brief). Seconds; 0 = first frame (default).
  heroFrameTime?: number;
}

/** Rest state — a neutral edit identical to the untouched source. */
export const DEFAULT_PARAMS: EditParams = {
  exposure: 0,
  denoise: 0,
  contrast: 0,
  saturation: 0,
  whiteBalance: { t: 0, tint: 0 },
  fade: 0,
  sharpen: 0,
  vignette: 0,
  skinTone: 0,

  clarity: 0,
  bloom: 0,
  halation: 0,
  grainStock: null,
  grainIntensity: 0,
  blur: 0,
  splitTone: { shadowsHue: null, shadowsStrength: 0, highlightsHue: null, highlightsStrength: 0 },

  curves: makeIdentityCurves(),

  lutId: null,
  lutIntensity: 0,

  heroFrameTime: 0,
};
