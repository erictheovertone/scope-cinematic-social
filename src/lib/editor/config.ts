/**
 * TOOL_CONFIG — the per-tool tuning table that drives the shared slider model.
 *
 * Each slider tool maps a STOP value through one of three easing curves into a
 * final [min, max] range (see mapping.ts). `type` selects the slider/normalize
 * behaviour: "bi" = bidirectional (rest at centre, −6..+6), "add" = additive
 * (rest at left, 0..12).
 *
 * Values are tuning knobs and will be tweaked per-tool as each ships; the
 * STRUCTURE is what this brief locks in. Only `exposure` is wired now.
 */

export type EasingKey = 'GENTLE' | 'MEDIUM' | 'STRONG';

/** UI/mapping tool identifiers. Not all map 1:1 to EditParams fields — white
 *  balance is two tracks (temp/tint) over one EditParams.whiteBalance object. */
export type ToolKey =
  | 'exposure'
  | 'contrast'
  | 'saturation'
  | 'temp'
  | 'tint'
  | 'fade'
  | 'sharpen'
  | 'vignette'
  | 'skinTone'
  | 'clarity'
  | 'bloom'
  | 'halation'
  | 'grain'
  | 'blur'
  | 'hsTone'
  | 'splitTone'
  | 'lutIntensity';

export interface ToolSpec {
  type: 'bi' | 'add';
  easing: EasingKey;
  /** final mapped range the eased stop is scaled into */
  min: number;
  max: number;
}

export const TOOL_CONFIG: Record<ToolKey, ToolSpec> = {
  // ── CORRECTION / FREE (Brief 2) — type + easing are structural; ranges tune ──
  exposure:   { type: 'bi',  easing: 'MEDIUM', min: -1.5, max: 1.5 },  // stops
  contrast:   { type: 'bi',  easing: 'STRONG', min: -0.5, max: 0.5 },  // pivot scale, plateaus
  saturation: { type: 'bi',  easing: 'STRONG', min: -1.0, max: 0.6 },  // ASYMMETRIC: full grey ↓, capped ↑
  temp:       { type: 'bi',  easing: 'MEDIUM', min: -1.0, max: 1.0 },  // blue↔amber (WB sub-slider)
  tint:       { type: 'bi',  easing: 'MEDIUM', min: -1.0, max: 1.0 },  // green↔magenta (WB sub-slider)
  fade:       { type: 'add', easing: 'GENTLE', min: 0.0,  max: 0.4 },  // lift blacks
  sharpen:    { type: 'add', easing: 'STRONG', min: 0.0,  max: 1.2 },  // unsharp, capped short of haloing
  vignette:   { type: 'add', easing: 'GENTLE', min: 0.0,  max: 0.9 },  // edge darkening
  skinTone:   { type: 'bi',  easing: 'MEDIUM', min: -1.0, max: 1.0 },  // hue-band targeted

  // ── Pro (Briefs 3 + 5) ──
  clarity:    { type: 'add', easing: 'STRONG', min: 0.0,  max: 0.6 },  // midtone local contrast, capped short of crunch
  bloom:      { type: 'add', easing: 'MEDIUM', min: 0.0,  max: 1.0 },  // glow intensity (neutral)
  halation:   { type: 'add', easing: 'MEDIUM', min: 0.0,  max: 1.0 },  // glow intensity (red-orange tint)
  grain:      { type: 'add', easing: 'MEDIUM', min: 0.0,  max: 1.0 },  // grain overlay intensity
  blur:       { type: 'add', easing: 'GENTLE', min: 0.0,  max: 1.0 },  // gaussian radius (scaled to px in JS)
  hsTone:     { type: 'bi',  easing: 'MEDIUM', min: -1.0, max: 1.0 },  // dormant (H/S Tone consolidated into Split Tone)
  splitTone:  { type: 'add', easing: 'MEDIUM', min: 0.0,  max: 0.7 },  // per-region tint strength

  // ── LOOK / LUT ──
  lutIntensity: { type: 'add', easing: 'MEDIUM', min: 0.0, max: 1.0 },
};
