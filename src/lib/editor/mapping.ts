/**
 * mapStop — the single source of truth for stop → shader-input conversion.
 *
 * ALL slider mapping happens here in JS. The UI emits raw STOP values; the
 * shader receives only the final mapped number. Three stages:
 *   1. normalize — by slider type:  add → stop/12 ∈ [0,1],  bi → stop/6 ∈ [−1,1]
 *   2. ease      — shape the response; sign preserved for bi (ease the magnitude)
 *   3. scale     — lerp the eased position into the tool's [min, max]
 *
 * Easing curves (operate on x ∈ [0,1]):
 *   GENTLE : pow(x, 1.6)                       — slow start
 *   MEDIUM : smoothstep-softened near-linear   — gentle S, ~linear
 *   STRONG : 1 − pow(1 − x, 2.2)               — fast then hard plateau
 */

import { TOOL_CONFIG, type ToolKey, type EasingKey } from './config';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function ease(x: number, kind: EasingKey): number {
  const t = clamp01(x);
  switch (kind) {
    case 'GENTLE':
      return Math.pow(t, 1.6);
    case 'STRONG':
      return 1 - Math.pow(1 - t, 2.2);
    case 'MEDIUM':
    default: {
      // near-linear with a soft S — endpoints stay exact (0→0, 1→1)
      const smooth = t * t * (3 - 2 * t);
      return 0.7 * t + 0.3 * smooth;
    }
  }
}

/** Map a tool's STOP value to its final shader input. */
export function mapStop(toolKey: ToolKey, stop: number): number {
  const cfg = TOOL_CONFIG[toolKey];
  if (!cfg) return 0;

  if (cfg.type === 'add') {
    // [0,1] normalized → eased → [min,max]
    const n = clamp01(stop / 12);
    const e = ease(n, cfg.easing);
    return cfg.min + e * (cfg.max - cfg.min);
  }

  // bi: [−1,1] normalized → ease magnitude, keep sign → lerp into [min,max]
  const n = Math.max(-1, Math.min(1, stop / 6));
  const sign = n < 0 ? -1 : 1;
  const easedMag = ease(Math.abs(n), cfg.easing);
  const easedPos = sign * easedMag; // ∈ [−1,1]
  // position −1 → min, 0 → midpoint, +1 → max
  return cfg.min + ((easedPos + 1) / 2) * (cfg.max - cfg.min);
}
