/**
 * navModel — single source of truth for the FINISHING three-tier navigation.
 *
 *   TIER 1  modes        LOOKS · PALETTE · EDIT · FX · HISTORY   (bottom, heavy)
 *   TIER 2  subcategories per mode                               (top, words)
 *   TIER 3  items resolved per (mode, subcategory)               (middle)
 *
 * Adding tools later = editing the EDIT_TOOLS registry below, NOT touching
 * layout. Brief 2 registers the remaining correction tools here and they
 * auto-appear under EDIT's subcategories with zero layout work.
 *
 * Only `crop` (geometry) and `exposure` (slider) are REAL this brief; every
 * other EDIT tool is a disabled "SOON" placeholder so the cascade/filtering is
 * demonstrable. LOOKS / PALETTE / FX resolve to empty/placeholder item sets.
 */

import type { ToolKey } from '@/lib/editor/config';

export type Mode = 'looks' | 'palette' | 'edit' | 'fx' | 'history';

export interface Subcat {
  key: string;
  label: string;
}

export interface ModeDef {
  key: Mode;
  label: string;
  /** [] for HISTORY (no Tier 2) */
  subcats: Subcat[];
}

// On-screen Tier 1 order, left → right. EDIT is the default (centre) mode.
export const MODES: ModeDef[] = [
  {
    key: 'looks', label: 'LOOKS',
    subcats: [
      { key: 'cinema', label: 'CINEMA' },
      { key: 'colorNeg', label: 'COLOR NEG' },
      { key: 'saturated', label: 'SATURATED' },
      { key: 'slide', label: 'SLIDE' },
      { key: 'muted', label: 'MUTED' },
      { key: 'bw', label: 'B&W' },
      { key: 'vintage', label: 'VINTAGE' },
    ],
  },
  {
    key: 'palette', label: 'PALETTE',
    subcats: [
      { key: 'all', label: 'ALL' },
      { key: 'recent', label: 'RECENT' },
      { key: 'mostUsed', label: 'MOST USED' },
    ],
  },
  {
    key: 'edit', label: 'EDIT',
    subcats: [
      { key: 'all', label: 'ALL' },
      { key: 'essential', label: 'ESSENTIAL' },
      { key: 'light', label: 'LIGHT' },
      { key: 'color', label: 'COLOR' },
      { key: 'effects', label: 'EFFECTS' },
    ],
  },
  {
    key: 'fx', label: 'EFFECTS',
    subcats: [
      { key: 'all', label: 'ALL' },
      { key: 'lightFx', label: 'LIGHT FX' },
      { key: 'texture', label: 'TEXTURE' },
    ],
  },
  { key: 'history', label: 'HISTORY', subcats: [] },
];

export const modeDef = (m: Mode): ModeDef =>
  MODES.find((d) => d.key === m) ?? MODES[2];

export const firstSubcat = (m: Mode): string => modeDef(m).subcats[0]?.key ?? '';

// ── EDIT tool registry ──────────────────────────────────────────────────────
// `key` is 'crop' (geometry) or a slider ToolKey. `groups` are the non-ALL
// subcats a tool belongs to (ALL always includes everything). `enabled:false`
// renders as a "SOON" placeholder tile — no panel.
export type EditSubcat = 'essential' | 'light' | 'color' | 'effects';
// Compound tools open their own panel, not a single slider:
//   'wb'        = White Balance (temp + tint sub-sliders, gradient tracks)
//   'grain'     = film-grain stock picker (thumbnails + intensity slider)
//   'splitTone' = per-region hue-tint picker (headers + strength + swatches)
//   'curve'     = draggable 2D curve graph (bakes its own LUT, not the slider model)
export type EditToolKind = 'geometry' | 'slider' | 'wb' | 'grain' | 'splitTone' | 'curve';

export interface EditTool {
  key: ToolKey | 'crop' | 'whiteBalance' | 'curve';
  label: string;
  kind: EditToolKind;
  groups: EditSubcat[];
  enabled: boolean;
  pro?: boolean;
  /** slider behaviour for kind:'slider' */
  sliderType?: 'bi' | 'add';
}

export const EDIT_TOOLS: EditTool[] = [
  // ── FREE, wired (Brief 1 + Brief 2). A tool may belong to multiple subcats. ──
  { key: 'crop', label: 'CROP', kind: 'geometry', groups: ['essential'], enabled: true },
  { key: 'exposure', label: 'EXPOSURE', kind: 'slider', groups: ['essential', 'light'], enabled: true, sliderType: 'bi' },
  { key: 'denoise', label: 'DENOISE', kind: 'slider', groups: ['essential'], enabled: true, sliderType: 'add' },
  { key: 'contrast', label: 'CONTRAST', kind: 'slider', groups: ['essential', 'light'], enabled: true, sliderType: 'bi' },
  { key: 'curve', label: 'CURVES', kind: 'curve', groups: ['light'], enabled: true }, // luma free; R/G/B/HUE Pro per-channel (Brief 7)
  { key: 'saturation', label: 'SATURATION', kind: 'slider', groups: ['essential', 'color'], enabled: true, sliderType: 'bi' },
  { key: 'sharpen', label: 'SHARPEN', kind: 'slider', groups: ['essential', 'effects'], enabled: true, sliderType: 'add' },
  { key: 'fade', label: 'FADE', kind: 'slider', groups: ['light'], enabled: true, sliderType: 'add' },
  { key: 'whiteBalance', label: 'WHITE BALANCE', kind: 'wb', groups: ['color'], enabled: true },
  { key: 'skinTone', label: 'SKIN TONE', kind: 'slider', groups: ['color'], enabled: true, sliderType: 'bi' },
  { key: 'vignette', label: 'VIGNETTE', kind: 'slider', groups: ['effects'], enabled: true, sliderType: 'add' },

  // ── Pro COLOR/DETAIL (Brief 5) — pro:true → generic lock + upsell (Part A). ──
  { key: 'splitTone', label: 'SPLIT TONE', kind: 'splitTone', groups: ['color'], enabled: true, pro: true },
  { key: 'clarity', label: 'CLARITY', kind: 'slider', groups: ['effects'], enabled: true, pro: true, sliderType: 'add' },
  { key: 'blur', label: 'BLUR', kind: 'slider', groups: ['effects'], enabled: true, pro: true, sliderType: 'add' },

  // ── Pro EFFECTS — wired (Brief 3). pro:true → generic lock + upsell (Part A). ──
  { key: 'bloom', label: 'BLOOM', kind: 'slider', groups: ['effects'], enabled: true, pro: true, sliderType: 'add' },
  { key: 'halation', label: 'HALATION', kind: 'slider', groups: ['effects'], enabled: true, pro: true, sliderType: 'add' },
  { key: 'grain', label: 'GRAIN', kind: 'grain', groups: ['effects'], enabled: true, pro: true },
];

/** Resolve EDIT items for a subcategory. 'all' = every edit tool. */
export function editItemsFor(subcat: string): EditTool[] {
  if (subcat === 'all') return EDIT_TOOLS;
  return EDIT_TOOLS.filter((t) => t.groups.includes(subcat as EditSubcat));
}
