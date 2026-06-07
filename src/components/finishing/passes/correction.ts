/**
 * CORRECTION-stage passes (run before LOOK/LUT): contrast + white balance.
 *
 * Both are cheap point-ops. The UI/JS owns all stop→value mapping (mapStop);
 * shaders receive only the final mapped uniforms.
 */

import { Shaders } from 'gl-react';

export const correctionShaders = Shaders.create({
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
