/**
 * Category + tool listing for the finishing dock (UI only).
 *
 * Tools beyond `exposure` are listed so the rail is representative, but every
 * one is `enabled: false` ("SOON") this brief — they render disabled, never as
 * fake panels. `pro: true` marks tools that will route through the Upsell
 * (useUpsell().showUpsell) in a later brief — not wired here.
 *
 * Category names are a deliberately-open UI decision (see brief notes); this is
 * a reasonable first cut grouped by pipeline stage.
 */

import type { ToolKey } from '@/lib/editor/config';

export type CategoryId = 'correction' | 'color' | 'detail' | 'texture' | 'looks';

export interface Category {
  id: CategoryId;
  label: string;
}

export interface Tool {
  key: ToolKey;
  label: string;
  category: CategoryId;
  /** slider behaviour, mirrors TOOL_CONFIG.type */
  type: 'bi' | 'add';
  pro?: boolean;
  /** only exposure is wired in this scaffolding brief */
  enabled?: boolean;
}

export const CATEGORIES: Category[] = [
  { id: 'correction', label: 'CORRECTION' },
  { id: 'color', label: 'COLOR' },
  { id: 'detail', label: 'DETAIL' },
  { id: 'texture', label: 'TEXTURE' },
  { id: 'looks', label: 'LOOKS' },
];

export const TOOLS: Tool[] = [
  // CORRECTION
  { key: 'exposure', label: 'EXPOSURE', category: 'correction', type: 'bi', enabled: true },
  { key: 'contrast', label: 'CONTRAST', category: 'correction', type: 'bi' },
  { key: 'fade', label: 'FADE', category: 'correction', type: 'add' },

  // COLOR
  { key: 'saturation', label: 'SATURATION', category: 'color', type: 'bi' },
  { key: 'temp', label: 'TEMP', category: 'color', type: 'bi' },
  { key: 'tint', label: 'TINT', category: 'color', type: 'bi' },
  { key: 'skinTone', label: 'SKIN TONE', category: 'color', type: 'bi' },

  // DETAIL
  { key: 'sharpen', label: 'SHARPEN', category: 'detail', type: 'add' },
  { key: 'clarity', label: 'CLARITY', category: 'detail', type: 'bi', pro: true },
  { key: 'blur', label: 'BLUR', category: 'detail', type: 'add', pro: true },

  // TEXTURE
  { key: 'vignette', label: 'VIGNETTE', category: 'texture', type: 'bi' },
  { key: 'grain', label: 'GRAIN', category: 'texture', type: 'add', pro: true },
  { key: 'bloom', label: 'BLOOM', category: 'texture', type: 'add', pro: true },
  { key: 'halation', label: 'HALATION', category: 'texture', type: 'add', pro: true },

  // LOOKS
  { key: 'lutIntensity', label: 'LOOK', category: 'looks', type: 'add', pro: true },
];

export const toolsForCategory = (cat: CategoryId): Tool[] =>
  TOOLS.filter((t) => t.category === cat);
