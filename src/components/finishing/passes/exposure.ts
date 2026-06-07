/**
 * Exposure — the one real color pass for the scaffolding brief.
 *
 * Lives in the CORRECTION stage of the pipeline. Correct exposure must operate
 * in LINEAR light: we linearize the sRGB-encoded source, multiply by 2^ev, then
 * re-encode. Multiplying gamma-encoded values directly would be wrong.
 *
 * `ev` is the final mapped number from mapStop("exposure", params.exposure) —
 * a value in stops (≈ −1.5..+1.5). The shader does exp2(ev) to get the linear
 * gain. The UI/JS owns all stop→ev mapping; the shader only multiplies.
 */

import { Shaders } from 'gl-react';

export const exposureShaders = Shaders.create({
  exposure: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform float ev;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSRGB(vec3 c)   { return pow(c, vec3(1.0 / 2.2)); }

void main() {
  vec4 src = texture2D(t, uv);
  vec3 lin = toLinear(src.rgb);
  lin *= exp2(ev);                         // multiply linear RGB by 2^ev
  gl_FragColor = vec4(toSRGB(clamp(lin, 0.0, 1.0)), src.a);
}
`,
  },
});
