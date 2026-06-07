/**
 * TEXTURE-stage passes (finishing): fade + vignette.
 */

import { Shaders } from 'gl-react';

export const textureShaders = Shaders.create({
  // Fade — lift the black point toward grey (raise shadow floor), which also
  // gently reduces contrast. amt = mapStop('fade') ∈ [0, 0.4].
  fade: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform float amt;
void main() {
  vec4 c = texture2D(t, uv);
  vec3 o = c.rgb * (1.0 - amt) + amt; // [0,1] → [amt,1]
  gl_FragColor = vec4(o, c.a);
}
`,
  },

  // Vignette — smooth radial darkening toward the frame edges. amt =
  // mapStop('vignette') ∈ [0, 0.9].
  vignette: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform float amt;
void main() {
  vec4 c = texture2D(t, uv);
  vec2 d = uv - 0.5;
  float r = length(d) * 1.41421356; // 0 centre … ~1 corner
  float v = 1.0 - amt * smoothstep(0.35, 1.0, r);
  gl_FragColor = vec4(c.rgb * v, c.a);
}
`,
  },

  // Grain — REAL film-stock overlay (Brief 4, replaces the procedural noise).
  // The selected scanned still (grain-on-grey) is OVERLAY-blended over the
  // finished image: mid-grey (0.5) is a no-op, so only the grain structure comes
  // through. The still is cover-scaled preserving its native aspect (no warp);
  // `intensity` mixes between no-grain and full overlay. FINAL texture op.
  grain: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;          // pipeline result
uniform sampler2D grainTex;   // selected film-grain still
uniform float intensity;      // 0..1 blend strength
uniform float imgAspect;      // render width/height
uniform float grainAspect;    // still native aspect

float overlay1(float b, float g) {
  return b < 0.5 ? (2.0 * b * g) : (1.0 - 2.0 * (1.0 - b) * (1.0 - g));
}

void main() {
  vec4 base = texture2D(t, uv);
  // Cover the frame with the grain still, preserving its aspect (centre-crop, no stretch).
  vec2 guv = uv;
  if (imgAspect > grainAspect) {
    float s = grainAspect / imgAspect;
    guv.y = (uv.y - 0.5) * s + 0.5;
  } else {
    float s = imgAspect / grainAspect;
    guv.x = (uv.x - 0.5) * s + 0.5;
  }
  vec3 g = texture2D(grainTex, guv).rgb;
  vec3 ov = vec3(overlay1(base.r, g.r), overlay1(base.g, g.g), overlay1(base.b, g.b));
  vec3 o = mix(base.rgb, ov, intensity);
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), base.a);
}
`,
  },
});
