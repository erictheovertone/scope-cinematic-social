/**
 * COLOR-stage passes (after LOOK/LUT): saturation + skin tone.
 */

import { Shaders } from 'gl-react';

export const colorShaders = Shaders.create({
  // Saturation — lerp toward/away from luma. sat = mapStop('saturation') ∈
  // [-1, 0.6] (ASYMMETRIC): -1 → full grayscale, +0.6 caps over-saturation.
  saturation: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform float sat;
void main() {
  vec4 c = texture2D(t, uv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 o = mix(vec3(l), c.rgb, 1.0 + sat);
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), c.a);
}
`,
  },

  // Skin tone — targets ONLY the orange-ish skin hue band (light→deep), with a
  // feathered weight so it never hard-clips into non-skin colours. amt ∈ [-1,1]:
  // negative pulls skin back/cooler, positive warms/enriches. Conservative.
  skinTone: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform float amt;

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
  float hueDeg = hsv.x * 360.0;
  // distance to skin centre (~25°), hue-wrapped
  float d = abs(hueDeg - 25.0);
  d = min(d, 360.0 - d);
  // feathered band weight; require some saturation so greys aren't touched
  float w = (1.0 - smoothstep(20.0, 45.0, d)) * smoothstep(0.05, 0.15, hsv.y);
  hsv.y = clamp(hsv.y + amt * 0.18 * w, 0.0, 1.0);   // enrich / desaturate
  hsv.x = fract(hsv.x + (amt * 4.0 / 360.0) * w);     // ±4° warm/cool within band
  hsv.z = clamp(hsv.z + amt * 0.04 * w, 0.0, 1.0);    // slight luma
  gl_FragColor = vec4(hsv2rgb(hsv), c.a);
}
`,
  },

  // Split Tone — tints SHADOWS and HIGHLIGHTS independently toward chosen hues.
  // `shTint`/`hiTint` are the region tint colours (saturated for shadows, pastel
  // for highlights — computed in JS from the palette). Weighted by (1−luma) for
  // shadows, luma for highlights, scaled by each region's mapped strength. The
  // push is toward (tint − grey) so it can't wash to a solid colour — an accent.
  splitTone: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform vec3 shTint;
uniform float shAmt;
uniform vec3 hiTint;
uniform float hiAmt;
void main() {
  vec4 c = texture2D(t, uv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float sW = (1.0 - l) * shAmt; // shadow region weight
  float hW = l * hiAmt;         // highlight region weight
  vec3 o = c.rgb
    + (shTint - vec3(0.5)) * sW
    + (hiTint - vec3(0.5)) * hW;
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), c.a);
}
`,
  },
});
