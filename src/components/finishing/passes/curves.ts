/**
 * Curve-application passes for the Pro channels (Brief 7) — COLOR stage.
 *
 *   rgbCurves : per-channel LUTs applied to their OWN channel (meant to shift
 *               colour — e.g. red-shadows down → teal shadows). The three LUTs
 *               are packed into ONE 256×1 RGBA texture: column i = (lutR, lutG,
 *               lutB), so sampling at the pixel's own channel value reads that
 *               channel's LUT.  R'=lutR[R], G'=lutG[G], B'=lutB[B].
 *   hueCurve  : X=hue (wrapping). The hue LUT is an ADJUSTMENT (0.5 = neutral);
 *               (lut−0.5)·2 boosts/cuts SATURATION for that hue band (hue-vs-sat).
 *
 * The luma curve stays in CORRECTION (ratio method, Brief 6) — unchanged.
 */

import { Shaders } from 'gl-react';

export const curveShaders = Shaders.create({
  rgbCurves: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform sampler2D rgbLut; // packed: .r=lutR, .g=lutG, .b=lutB
void main() {
  vec4 c = texture2D(t, uv);
  float r = texture2D(rgbLut, vec2(clamp(c.r, 0.0, 1.0), 0.5)).r;
  float g = texture2D(rgbLut, vec2(clamp(c.g, 0.0, 1.0), 0.5)).g;
  float b = texture2D(rgbLut, vec2(clamp(c.b, 0.0, 1.0), 0.5)).b;
  gl_FragColor = vec4(r, g, b, c.a);
}
`,
  },

  hueCurve: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform sampler2D hueLut; // .r = saturation adjustment (0.5 neutral) by hue

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 c = texture2D(t, uv);
  vec3 hsv = rgb2hsv(c.rgb);
  // hue wraps: sample the LUT at fract(hue); endpoints are linked so no seam.
  float adj = texture2D(hueLut, vec2(fract(hsv.x), 0.5)).r;
  float delta = (adj - 0.5) * 2.0;            // [-1,1]
  hsv.y = clamp(hsv.y * (1.0 + delta * 0.8), 0.0, 1.0);
  gl_FragColor = vec4(hsv2rgb(hsv), c.a);
}
`,
  },
});
