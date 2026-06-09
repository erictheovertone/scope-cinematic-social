/**
 * CORRECTION-stage passes (run before LOOK/LUT): contrast + white balance.
 *
 * Both are cheap point-ops. The UI/JS owns all stop→value mapping (mapStop);
 * shaders receive only the final mapped uniforms.
 */

import { Shaders } from 'gl-react';

export const correctionShaders = Shaders.create({
  // Denoise — light edge-aware BILATERAL filter (photo only). For each pixel a
  // 5×5 neighbourhood is averaged, weighting neighbours by BOTH spatial distance
  // and colour similarity, so flat noisy areas smooth out while real edges (large
  // colour deltas) are preserved. `amt` = mapStop('denoise') ∈ [0, 0.6] sets the
  // range sigma; STRONG easing + the conservative cap keep it short of the waxy
  // "plastic" look. Operates in RGB so luma + chroma noise both drop, no hue shift.
  denoise: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform vec2 resolution;
uniform float amt;          // 0 (off) .. ~0.6 (capped)
void main() {
  vec4 src = texture2D(t, uv);
  if (amt <= 0.0) { gl_FragColor = src; return; }
  vec2 px = 1.0 / max(resolution, vec2(1.0));
  // range sigma grows with amt; spatial sigma fixed (small kernel).
  float rangeSigma = 0.04 + amt * 0.36;       // colour-difference tolerance
  float invR2 = 1.0 / (2.0 * rangeSigma * rangeSigma);
  float invS2 = 1.0 / (2.0 * 1.6 * 1.6);      // spatial falloff (in texels)
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 off = vec2(float(i), float(j));
      vec3 s = texture2D(t, uv + off * px).rgb;
      vec3 d = s - src.rgb;
      float wr = exp(-dot(d, d) * invR2);      // colour-similarity weight
      float ws = exp(-dot(off, off) * invS2);  // spatial weight
      float w = wr * ws;
      sum += s * w;
      wsum += w;
    }
  }
  vec3 filtered = wsum > 0.0 ? sum / wsum : src.rgb;
  // Blend toward the filtered result by amt so low settings stay subtle.
  vec3 o = mix(src.rgb, filtered, clamp(amt / 0.6, 0.0, 1.0));
  gl_FragColor = vec4(o, src.a);
}
`,
  },

  // Contrast — pivot around mid-grey, scale deviation by (1 + amt).
  // amt = mapStop('contrast') ∈ [-0.5, 0.5] (STRONG easing plateaus the top so
  // it never crushes/clips hard).
  contrast: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform float amt;
void main() {
  vec4 c = texture2D(t, uv);
  vec3 o = (c.rgb - 0.5) * (1.0 + amt) + 0.5;
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), c.a);
}
`,
  },

  // Luma curve — remap luminance through a baked 256-LUT (a 256×1 texture), then
  // preserve colour by the RATIO method (scale RGB by Yc/Y) so hue/saturation are
  // unchanged. CORRECTION stage; composes with exposure/contrast.
  curveLuma: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform sampler2D lut;
void main() {
  vec4 c = texture2D(t, uv);
  float Y = clamp(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  float Yc = texture2D(lut, vec2(Y, 0.5)).r;
  float ratio = Y > 0.001 ? Yc / Y : 1.0;
  gl_FragColor = vec4(clamp(c.rgb * ratio, 0.0, 1.0), c.a);
}
`,
  },

  // White balance — subtle correction shifts along two axes:
  //   temp: blue↔amber,  tint: green↔magenta.   Both ∈ [-1, 1] (mapped).
  // Kept gentle (small coefficients) — correction, not a creative cast.
  whiteBalance: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform float temp;
uniform float tint;
void main() {
  vec4 c = texture2D(t, uv);
  vec3 o = c.rgb;
  // temperature: warm (+) adds red, removes blue
  o.r += temp * 0.12;
  o.b -= temp * 0.12;
  // tint: magenta (+) adds red+blue, removes green; green (-) the inverse
  o.r += tint * 0.06;
  o.b += tint * 0.06;
  o.g -= tint * 0.10;
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), c.a);
}
`,
  },
});
