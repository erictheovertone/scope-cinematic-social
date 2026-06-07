/**
 * CurveEngine — reusable graph/spline/LUT machinery for the CURVE tool.
 *
 * Axis-agnostic by design: it operates on normalised control points (x,y ∈ [0,1])
 * and bakes a 256-entry LUT via a MONOTONIC cubic spline. The luma curve is the
 * first instance; a later brief instantiates the SAME engine for R/G/B channels
 * (three LUTs) and a Hue axis (X=hue) with only new axis configs + a different
 * apply step in the shader — no rewrite of the spline/LUT here.
 *
 * State is stored as control points (not the baked LUT); the LUT is derived.
 */

export interface CurvePoint {
  x: number; // input  ∈ [0,1]
  y: number; // output ∈ [0,1]
}

// ── Channels (Brief 7) ──────────────────────────────────────────────────────
// The SAME engine drives every channel; channels differ only by axis meaning,
// neutral shape, wrap, colour, and Pro gating — NOT by graph/spline/LUT code.
export type CurveChannel = 'luma' | 'r' | 'g' | 'b' | 'hue';

export interface ChannelConfig {
  key: CurveChannel;
  label: string;
  pro: boolean;
  xLabel: string;
  yLabel: string;
  /** identity shape: 'diagonal' (out = in) or 'flat' (neutral adjustment at 0.5) */
  neutral: 'diagonal' | 'flat';
  /** hue wraps at 0/360 — the graph links the two endpoints' Y for continuity */
  wrap: boolean;
  /** curve line colour (legible on black) */
  line: string;
}

export const CHANNELS: ChannelConfig[] = [
  { key: 'luma', label: 'LUMA', pro: false, xLabel: 'INPUT', yLabel: 'OUTPUT', neutral: 'diagonal', wrap: false, line: '#FF0000' },
  { key: 'r',    label: 'R',    pro: true,  xLabel: 'INPUT', yLabel: 'OUTPUT', neutral: 'diagonal', wrap: false, line: '#FF5252' },
  { key: 'g',    label: 'G',    pro: true,  xLabel: 'INPUT', yLabel: 'OUTPUT', neutral: 'diagonal', wrap: false, line: '#3DDC6B' },
  { key: 'b',    label: 'B',    pro: true,  xLabel: 'INPUT', yLabel: 'OUTPUT', neutral: 'diagonal', wrap: false, line: '#4D8DFF' },
  { key: 'hue',  label: 'HUE',  pro: true,  xLabel: 'HUE',   yLabel: 'SAT',    neutral: 'flat',     wrap: true,  line: '#FF0000' },
];

export const channelConfig = (c: CurveChannel): ChannelConfig =>
  CHANNELS.find((x) => x.key === c) ?? CHANNELS[0];

/** Per-channel control points (just-parameters; LUTs are derived). */
export interface Curves {
  luma: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
  hue: CurvePoint[];
}

/** Neutral points for a channel: diagonal (out=in) or flat adjustment at 0.5. */
export function identityCurve(channel: CurveChannel): CurvePoint[] {
  return channelConfig(channel).neutral === 'flat'
    ? [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]
    : [{ x: 0, y: 0 }, { x: 1, y: 1 }];
}

export function makeIdentityCurves(): Curves {
  return { luma: identityCurve('luma'), r: identityCurve('r'), g: identityCurve('g'), b: identityCurve('b'), hue: identityCurve('hue') };
}

/** True when a channel's curve is its untouched identity (the two endpoints). */
export function isIdentityChannel(channel: CurveChannel, points: CurvePoint[]): boolean {
  if (points.length !== 2) return false;
  const s = [...points].sort((a, b) => a.x - b.x);
  const id = identityCurve(channel);
  return s[0].x === id[0].x && s[0].y === id[0].y && s[1].x === id[1].x && s[1].y === id[1].y;
}

/**
 * Bake control points into a `size`-entry LUT (default 256) via a Fritsch–Carlson
 * monotone Hermite spline. Monotonicity is REQUIRED — it prevents overshoot that
 * would invert tones. Output clamped to [0,1]. Cheap; rebuild on every change.
 */
export function buildCurveLUT(points: CurvePoint[], size = 256): number[] {
  const lut = new Array<number>(size);
  const pts = [...points].sort((a, b) => a.x - b.x);
  const n = pts.length;
  if (n < 2) {
    for (let i = 0; i < size; i++) lut[i] = i / (size - 1);
    return lut;
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);

  // Secant slopes between consecutive points.
  const d = new Array<number>(n - 1);
  for (let k = 0; k < n - 1; k++) {
    const dx = xs[k + 1] - xs[k];
    d[k] = dx > 1e-6 ? (ys[k + 1] - ys[k]) / dx : 0;
  }

  // Initial tangents (average of adjacent secants; one-sided at the ends).
  const m = new Array<number>(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = (d[k - 1] + d[k]) / 2;

  // Fritsch–Carlson monotonicity adjustment.
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
    } else {
      const a = m[k] / d[k];
      const b = m[k + 1] / d[k];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[k] = tau * a * d[k];
        m[k + 1] = tau * b * d[k];
      }
    }
  }

  // Sample the Hermite spline into the LUT.
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1);
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]) k++;
    const h = xs[k + 1] - xs[k];
    const t = h > 1e-6 ? (x - xs[k]) / h : 0;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const y = h00 * ys[k] + h10 * h * m[k] + h01 * ys[k + 1] + h11 * h * m[k + 1];
    lut[i] = Math.min(1, Math.max(0, y));
  }
  return lut;
}
