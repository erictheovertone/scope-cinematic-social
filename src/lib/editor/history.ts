/**
 * Edit-history events (Brief: real history). One SETTLED event per tool change —
 * the editor logs through a single common path (FinishingShell) so every tool
 * (existing + future) populates the ripple with no bespoke wiring. Display-only;
 * undo/redo is a later brief.
 */

import type { EditParams } from './params';
import { CHANNELS, isIdentityChannel } from './curveEngine';

export interface HistoryEvent {
  id: string;
  toolKey: string;  // reuse the tool's rail icon (IconKey)
  label: string;
  value: string;    // short value summary
}

const newId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const fmt = (v: number, signed: boolean) => `${signed && v > 0 ? '+' : ''}${v.toFixed(1)}`;

// Slider tool key → its EditParams scalar (mirrors FinishingShell.sliderValue).
function sliderVal(p: EditParams, key: string): number {
  switch (key) {
    case 'exposure': return p.exposure;
    case 'denoise': return p.denoise;
    case 'contrast': return p.contrast;
    case 'saturation': return p.saturation;
    case 'fade': return p.fade;
    case 'sharpen': return p.sharpen;
    case 'vignette': return p.vignette;
    case 'skinTone': return p.skinTone;
    case 'bloom': return p.bloom;
    case 'halation': return p.halation;
    case 'clarity': return p.clarity;
    case 'blur': return p.blur;
    default: return 0;
  }
}

interface ToolLike { key: string; label: string; kind: string; sliderType?: 'bi' | 'add'; }

/** Did this tool's param(s) change between two EditParams snapshots? */
export function toolChanged(tool: ToolLike, a: EditParams, b: EditParams): boolean {
  switch (tool.kind) {
    case 'wb': return a.whiteBalance.t !== b.whiteBalance.t || a.whiteBalance.tint !== b.whiteBalance.tint;
    case 'grain': return a.grainStock !== b.grainStock || a.grainIntensity !== b.grainIntensity;
    case 'splitTone': return JSON.stringify(a.splitTone) !== JSON.stringify(b.splitTone);
    case 'curve': return JSON.stringify(a.curves) !== JSON.stringify(b.curves);
    default: return sliderVal(a, tool.key) !== sliderVal(b, tool.key);
  }
}

/** Short label + value summary for a settled tool change. */
export function describeTool(tool: ToolLike, p: EditParams): { label: string; value: string } {
  switch (tool.kind) {
    case 'wb':
      return { label: 'WHITE BALANCE', value: `${fmt(p.whiteBalance.t, true)} / ${fmt(p.whiteBalance.tint, true)}` };
    case 'grain':
      return { label: 'GRAIN', value: p.grainStock ? `ON ${Math.round(p.grainIntensity)}` : 'OFF' };
    case 'splitTone': {
      const s = p.splitTone;
      const parts: string[] = [];
      if (s.shadowsHue) parts.push(`SH ${s.shadowsHue.toUpperCase()}`);
      if (s.highlightsHue) parts.push(`HI ${s.highlightsHue.toUpperCase()}`);
      return { label: 'SPLIT TONE', value: parts.join(' · ') || 'OFF' };
    }
    case 'curve': {
      const ch = CHANNELS.filter((c) => !isIdentityChannel(c.key, p.curves[c.key])).map((c) => c.label);
      return { label: 'CURVES', value: ch.join(' ') || 'RESET' };
    }
    default:
      return { label: tool.label, value: fmt(sliderVal(p, tool.key), tool.sliderType === 'bi') };
  }
}

export function makeEvent(toolKey: string, label: string, value: string): HistoryEvent {
  return { id: newId(), toolKey, label, value };
}
