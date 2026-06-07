/**
 * Glow engine — ONE mechanism shared by Bloom and Halation (TEXTURE stage).
 *
 *   threshold → blur (separable gaussian, run at downsampled res) → combine
 *
 * The bright-pass + blur are computed ONCE; the combine adds both contributions
 * over the original:
 *   bloom    = blurred glow × white      (neutral highlight bloom)
 *   halation = blurred glow × red-orange (film halo from light scattering back
 *              through the film base)
 * So bloom and halation are two UI tools driving one blur stack — never two
 * separate stacks. The blur runs at ~1/4 resolution (set via the Node's FBO
 * size in Pipeline); the glow is low-frequency so the upsample is invisible and
 * it stays real-time on mobile/video.
 */

import { Shaders } from 'gl-react';

export const glowShaders = Shaders.create({
  // Isolate highlights above a soft luminance knee; carry their colour through.
  threshold: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
void main() {
  vec3 c = texture2D(t, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = clamp((l - 0.7) / 0.3, 0.0, 1.0); // 0 below 0.7 → 1 at white
  gl_FragColor = vec4(c * knee, 1.0);
}
`,
  },

  // Separable gaussian — `dir` is (1,0) for H, (0,1) for V. 9-tap, widened.
  blur: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform vec2 resolution;
uniform vec2 dir;
void main() {
  vec2 px = (dir / max(resolution, vec2(1.0))) * 1.5;
  vec3 sum = texture2D(t, uv).rgb * 0.227027;
  sum += (texture2D(t, uv + px * 1.0).rgb + texture2D(t, uv - px * 1.0).rgb) * 0.194595;
  sum += (texture2D(t, uv + px * 2.0).rgb + texture2D(t, uv - px * 2.0).rgb) * 0.121622;
  sum += (texture2D(t, uv + px * 3.0).rgb + texture2D(t, uv - px * 3.0).rgb) * 0.054054;
  sum += (texture2D(t, uv + px * 4.0).rgb + texture2D(t, uv - px * 4.0).rgb) * 0.016216;
  gl_FragColor = vec4(sum, 1.0);
}
`,
  },

  // Add bloom (neutral) + halation (tinted) glow over the original. Full-res.
  combine: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;     // original
uniform sampler2D glow;  // blurred bright mask (upsampled)
uniform float bloom;     // mapped intensity
uniform float halation;  // mapped intensity
uniform vec3 tint;       // film red-orange
void main() {
  vec4 base = texture2D(t, uv);
  vec3 g = texture2D(glow, uv).rgb;
  vec3 add = g * (bloom * vec3(1.0) + halation * tint);
  gl_FragColor = vec4(min(base.rgb + add, vec3(1.0)), base.a);
}
`,
  },
});
