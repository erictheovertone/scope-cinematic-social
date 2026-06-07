/**
 * DETAIL-stage passes: sharpen (unsharp mask), blur (separable gaussian),
 * clarity (midtone local contrast off a downsampled blur reference).
 */

import { Shaders } from 'gl-react';

export const detailShaders = Shaders.create({
  sharpen: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform vec2 resolution;
uniform float amt;
void main() {
  vec4 c = texture2D(t, uv);
  vec2 px = 1.0 / max(resolution, vec2(1.0));
  vec3 blur = (
    texture2D(t, uv + vec2(px.x, 0.0)).rgb +
    texture2D(t, uv - vec2(px.x, 0.0)).rgb +
    texture2D(t, uv + vec2(0.0, px.y)).rgb +
    texture2D(t, uv - vec2(0.0, px.y)).rgb
  ) * 0.25;
  vec3 o = c.rgb + (c.rgb - blur) * amt;
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), c.a);
}
`,
  },

  // Separable gaussian (9-tap). `dir` = (1,0) H / (0,1) V; `radius` scales the
  // texel offsets (px). Used full-res by the BLUR tool and downsampled as the
  // CLARITY reference blur.
  blur: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform vec2 resolution;
uniform vec2 dir;
uniform float radius;
void main() {
  vec2 px = (dir / max(resolution, vec2(1.0))) * radius;
  vec3 sum = texture2D(t, uv).rgb * 0.227027;
  sum += (texture2D(t, uv + px * 1.0).rgb + texture2D(t, uv - px * 1.0).rgb) * 0.194595;
  sum += (texture2D(t, uv + px * 2.0).rgb + texture2D(t, uv - px * 2.0).rgb) * 0.121622;
  sum += (texture2D(t, uv + px * 3.0).rgb + texture2D(t, uv - px * 3.0).rgb) * 0.054054;
  sum += (texture2D(t, uv + px * 4.0).rgb + texture2D(t, uv - px * 4.0).rgb) * 0.016216;
  gl_FragColor = vec4(sum, texture2D(t, uv).a);
}
`,
  },

  // Clarity — midtone LOCAL contrast. `blurred` is a large-radius (downsampled)
  // blur of the same input; we add the luma detail (base − blurred) back, weighted
  // toward the midtones so the toe/shoulder don't crunch. amt is conservatively
  // capped (STRONG easing) to avoid the HDR halo look.
  clarity: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;        // base
uniform sampler2D blurred;  // large-radius reference
uniform float amt;
void main() {
  vec4 base = texture2D(t, uv);
  float lb = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  float lr = dot(texture2D(blurred, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
  float detail = lb - lr;                 // local contrast
  float midW = 1.0 - abs(2.0 * lb - 1.0); // peak at mid-grey, 0 at black/white
  vec3 o = base.rgb + detail * amt * midW * 2.0;
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), base.a);
}
`,
  },
});
