/**
 * LOOK-stage pass — apply a .cube LUT (the creative look), blended by intensity.
 *
 * The LUT is a 2D-tiled texture (N blue-slices tiled horizontally, (N*N)×N).
 * Trilinear = bilinear within a slice (texture LINEAR filtering on red/green) +
 * a manual lerp between the two bracketing blue slices. Runs AFTER corrections/
 * curves (LOOK stage) — the LUT encodes the LOOK, not correction. `intensity`
 * mixes original↔looked (0..1).
 */

import { Shaders } from 'gl-react';

export const lookShaders = Shaders.create({
  lut: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform sampler2D lut;
uniform float lutSize;
uniform float intensity;

vec3 sampleLUT(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  float sz = lutSize;
  float texW = sz * sz;
  float blue = c.b * (sz - 1.0);
  float z0 = floor(blue);
  float z1 = min(z0 + 1.0, sz - 1.0);
  float fz = blue - z0;
  // gl-react uploads textures with UNPACK_FLIP_Y_WEBGL=1 (keeps photos upright),
  // which flips this LUT's GREEN axis (rows). Compensate by sampling 1 - v, so
  // green is read from the correct row (identity LUT → identity out).
  float v = 1.0 - (c.g * (sz - 1.0) + 0.5) / sz;
  float u0 = (z0 * sz + c.r * (sz - 1.0) + 0.5) / texW;
  float u1 = (z1 * sz + c.r * (sz - 1.0) + 0.5) / texW;
  vec3 s0 = texture2D(lut, vec2(u0, v)).rgb;
  vec3 s1 = texture2D(lut, vec2(u1, v)).rgb;
  return mix(s0, s1, fz);
}

void main() {
  vec4 src = texture2D(t, uv);
  vec3 looked = sampleLUT(src.rgb);
  gl_FragColor = vec4(mix(src.rgb, looked, clamp(intensity, 0.0, 1.0)), src.a);
}
`,
  },
});
