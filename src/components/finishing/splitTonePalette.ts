/**
 * Split-tone hue palette (Brief 5, consolidated).
 *
 * Six hues, rendered TWO ways so the swatch previews how strongly each region
 * takes the tint:
 *   SHADOWS    → saturated (shadows hold tint strongly)
 *   HIGHLIGHTS → muted / pastel (highlights take tint gently)
 * The applied shader tint matches the region's rendering.
 */

export type SplitRegion = 'shadows' | 'highlights';

export interface SplitHue {
  key: string;
  h: number; // degrees
}

export const SPLIT_HUES: SplitHue[] = [
  { key: 'red', h: 0 },
  { key: 'orange', h: 30 },
  { key: 'yellow', h: 50 },
  { key: 'green', h: 130 },
  { key: 'blue', h: 210 },
  { key: 'purple', h: 280 },
];

export const splitHueByKey = (key: string | null): SplitHue | undefined =>
  key ? SPLIT_HUES.find((x) => x.key === key) : undefined;

// Per-region saturation/lightness — saturated shadows, pastel highlights.
const SL: Record<SplitRegion, { s: number; l: number }> = {
  shadows: { s: 70, l: 55 },
  highlights: { s: 45, l: 78 },
};

/** CSS color for a swatch / preview. */
export function splitCss(h: number, region: SplitRegion): string {
  const { s, l } = SL[region];
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// HSL → RGB (0..1) for the shader uniform.
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/** Shader tint RGB (0..1) for a region's selected hue key. */
export function splitTintRgb(key: string | null, region: SplitRegion): [number, number, number] {
  const hue = splitHueByKey(key);
  if (!hue) return [0.5, 0.5, 0.5]; // neutral = no push (amt is also 0 when null)
  const { s, l } = SL[region];
  return hslToRgb(hue.h, s, l);
}
