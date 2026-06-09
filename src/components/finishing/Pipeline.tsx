"use client";

/**
 * Pipeline — the gl-react WebGL render chain for the finishing suite.
 *
 * A single Surface renders the source (image or video frame) through an
 * ordered, extensible chain of passes:
 *
 *   GEOMETRY → CORRECTION → LOOK/LUT → COLOR → DETAIL → TEXTURE
 *
 * Only CORRECTION→exposure is a real shader this brief; every other stage is a
 * labeled pass-through Node so future tools slot into the correct position
 * without re-ordering. In gl-react the innermost Node runs first, so the JSX is
 * nested with GEOMETRY innermost (source) and TEXTURE outermost (Surface child).
 *
 * gl-react is the LOCKED pipeline library for all editing work. This module is
 * client-only (WebGL) — the dev route imports it via next/dynamic ssr:false.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Node, Shaders } from 'gl-react';
import { Surface } from 'gl-react-dom';
import type { EditParams } from '@/lib/editor/params';
import { mapStop } from '@/lib/editor/mapping';
import { exposureShaders } from './passes/exposure';
import { correctionShaders } from './passes/correction';
import { colorShaders } from './passes/color';
import { detailShaders } from './passes/detail';
import { textureShaders } from './passes/texture';
import { glowShaders } from './passes/glow';
import { GRAIN_ASPECT, grainStockByKey } from './grainStocks';
import { splitTintRgb } from './splitTonePalette';
import { buildCurveLUT, isIdentityChannel } from '@/lib/editor/curveEngine';
import { curveShaders } from './passes/curves';
import { lookShaders } from './passes/look';

// Labeled pass-through used for every not-yet-implemented stage. Sampling the
// input unchanged keeps the chain intact and ordered.
const passthrough = Shaders.create({
  passthrough: {
    frag: `
precision highp float;
varying vec2 uv;
uniform sampler2D t;
void main() { gl_FragColor = texture2D(t, uv); }
`,
  },
});

type Source = HTMLImageElement | HTMLVideoElement;

interface PipelineProps {
  source: Source | null;
  params: EditParams;
  width: number;
  height: number;
  /** Bake-only: ref to the gl-react Surface for offscreen readback (captureAsBlob). */
  surfaceRef?: React.Ref<unknown>;
  /** Bake-only: enable preserveDrawingBuffer so the canvas can be read back. */
  preserve?: boolean;
  /** Active LOOK LUT (2D-tiled canvas + cube size). Applied in the LOOK stage. */
  activeLut?: { canvas: HTMLCanvasElement; size: number } | null;
}

export default function Pipeline({ source, params, width, height, surfaceRef, preserve, activeLut }: PipelineProps) {
  // Drive a redraw every frame while the source is a playing video so the
  // texture re-uploads. Images render once per prop change.
  const [, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
    if (!isVideo) return;
    const loop = () => {
      setTick((t) => (t + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [source]);

  // gl-react 6 (webgltexture-loader-dom) registers texture loaders for string
  // URLs, HTMLCanvasElement and HTMLVideoElement — but NOT a bare
  // HTMLImageElement. Passing a decoded <img> straight into a Node throws
  // "no loader found for value <img>" and the whole chain renders black. So we
  // draw the decoded image onto a canvas (a source the loader DOES accept) once
  // per image; video elements are passed through directly (the RAF loop above
  // re-uploads each frame).
  const texSource = useMemo<HTMLCanvasElement | HTMLVideoElement | null>(() => {
    if (!source) return null;
    const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
    if (isVideo) return source as HTMLVideoElement;
    const img = source as HTMLImageElement;
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null; // not decoded yet — gate render
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas;
  }, [source]);

  // Luma curve → a 256×1 grayscale LUT texture (R=G=B=lut). Null = identity →
  // the curve node is skipped. Rebuilt only when its control points change.
  const lutCanvas = useMemo<HTMLCanvasElement | null>(() => {
    if (isIdentityChannel('luma', params.curves.luma)) return null;
    const lut = buildCurveLUT(params.curves.luma, 256);
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 1;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(256, 1);
    for (let i = 0; i < 256; i++) {
      const v = Math.round(lut[i] * 255);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }, [params.curves.luma]);

  // RGB curves → ONE packed 256×1 RGBA LUT (R=lutR, G=lutG, B=lutB). Null when
  // all three channels are identity. Identity channels pack the identity ramp.
  const rgbLutCanvas = useMemo<HTMLCanvasElement | null>(() => {
    const { r, g, b } = params.curves;
    if (isIdentityChannel('r', r) && isIdentityChannel('g', g) && isIdentityChannel('b', b)) return null;
    const lr = buildCurveLUT(r, 256), lg = buildCurveLUT(g, 256), lb = buildCurveLUT(b, 256);
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 1;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(256, 1);
    for (let i = 0; i < 256; i++) {
      img.data[i * 4] = Math.round(lr[i] * 255);
      img.data[i * 4 + 1] = Math.round(lg[i] * 255);
      img.data[i * 4 + 2] = Math.round(lb[i] * 255);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }, [params.curves.r, params.curves.g, params.curves.b]);

  // Hue curve → 256×1 LUT (R = per-hue saturation adjustment, 0.5 neutral). The
  // graph links endpoints so lut[0]==lut[255] → continuous wrap (no seam at red).
  const hueLutCanvas = useMemo<HTMLCanvasElement | null>(() => {
    if (isIdentityChannel('hue', params.curves.hue)) return null;
    const lut = buildCurveLUT(params.curves.hue, 256);
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 1;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(256, 1);
    for (let i = 0; i < 256; i++) {
      const v = Math.round(lut[i] * 255);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }, [params.curves.hue]);

  if (!texSource || width <= 0 || height <= 0) return null;

  // All stop→value mapping happens in JS (mapStop); shaders read final uniforms.
  const ev = mapStop('exposure', params.exposure);
  const contrast = mapStop('contrast', params.contrast);
  const temp = mapStop('temp', params.whiteBalance.t);
  const tint = mapStop('tint', params.whiteBalance.tint);
  const sat = mapStop('saturation', params.saturation);
  const skin = mapStop('skinTone', params.skinTone);
  const sharp = mapStop('sharpen', params.sharpen);
  const fade = mapStop('fade', params.fade);
  const vig = mapStop('vignette', params.vignette);
  const st = params.splitTone;
  const stShAmt = st.shadowsHue ? mapStop('splitTone', st.shadowsStrength) : 0;
  const stHiAmt = st.highlightsHue ? mapStop('splitTone', st.highlightsStrength) : 0;

  // GEOMETRY (innermost / first) → ... → TEXTURE (outermost / last). Stage order
  // is FIXED. Each stage may chain multiple cheap point-ops.
  // GEOMETRY pass-through: real crop is owned by edit_geometry, not this chain.
  const geometry = <Node shader={passthrough.passthrough} uniforms={{ t: texSource }} />;

  // CORRECTION: denoise (EARLY, photo only) → exposure → contrast → luma curve → white balance.
  // Denoise runs first so it cleans sensor noise BEFORE sharpen (DETAIL) enhances
  // detail and BEFORE grain (TEXTURE) is laid on top. Skipped on video (perf) and
  // when off.
  const isVideoSrc = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
  const denoise = mapStop('denoise', params.denoise);
  const denoised: React.ReactElement = (!isVideoSrc && params.denoise > 0)
    ? <Node shader={correctionShaders.denoise} uniforms={{ t: geometry, amt: denoise, resolution: [width, height] }} />
    : geometry;

  const nExposure = <Node shader={exposureShaders.exposure} uniforms={{ t: denoised, ev }} />;
  const nContrast = <Node shader={correctionShaders.contrast} uniforms={{ t: nExposure, amt: contrast }} />;
  const nCurve: React.ReactElement = lutCanvas
    ? <Node shader={correctionShaders.curveLuma} uniforms={{ t: nContrast, lut: lutCanvas }} />
    : nContrast;
  const correction = <Node shader={correctionShaders.whiteBalance} uniforms={{ t: nCurve, temp, tint }} />;

  // LOOK / LUT — apply the selected .cube look, blended by intensity. Skipped
  // when no look is active / not yet loaded / intensity 0.
  const lutIntensity = mapStop('lutIntensity', params.lutIntensity);
  const look = (activeLut && params.lutId && lutIntensity > 0)
    ? <Node shader={lookShaders.lut} uniforms={{ t: correction, lut: activeLut.canvas, lutSize: activeLut.size, intensity: lutIntensity }} />
    : <Node shader={passthrough.passthrough} uniforms={{ t: correction }} />;

  // COLOR: RGB curves → saturation → skin tone → hue curve → split tone.
  // RGB curves shape colour (own-channel LUTs); luma curve already ran in CORRECTION.
  const nRgb: React.ReactElement = rgbLutCanvas
    ? <Node shader={curveShaders.rgbCurves} uniforms={{ t: look, rgbLut: rgbLutCanvas }} />
    : look;
  const nSat = <Node shader={colorShaders.saturation} uniforms={{ t: nRgb, sat }} />;
  const nSkin = <Node shader={colorShaders.skinTone} uniforms={{ t: nSat, amt: skin }} />;
  const nHue: React.ReactElement = hueLutCanvas
    ? <Node shader={curveShaders.hueCurve} uniforms={{ t: nSkin, hueLut: hueLutCanvas }} />
    : nSkin;
  const color: React.ReactElement = (stShAmt > 0 || stHiAmt > 0)
    ? (
      <Node
        shader={colorShaders.splitTone}
        uniforms={{
          t: nHue,
          shTint: splitTintRgb(st.shadowsHue, 'shadows'),
          shAmt: stShAmt,
          hiTint: splitTintRgb(st.highlightsHue, 'highlights'),
          hiAmt: stHiAmt,
        }}
      />
    )
    : nHue;

  // DETAIL: sharpen → clarity → blur.
  const nSharpen = <Node shader={detailShaders.sharpen} uniforms={{ t: color, amt: sharp, resolution: [width, height] }} />;

  // Clarity — midtone local contrast off a downsampled large-radius blur. Skipped when 0.
  let afterClarity: React.ReactElement = nSharpen;
  if (params.clarity > 0) {
    const cw = Math.max(1, Math.round(width / 4));
    const ch = Math.max(1, Math.round(height / 4));
    const refH = <Node shader={detailShaders.blur} width={cw} height={ch} uniforms={{ t: nSharpen, resolution: [cw, ch], dir: [1, 0], radius: 2.0 }} />;
    const refV = <Node shader={detailShaders.blur} width={cw} height={ch} uniforms={{ t: refH, resolution: [cw, ch], dir: [0, 1], radius: 2.0 }} />;
    afterClarity = <Node shader={detailShaders.clarity} uniforms={{ t: nSharpen, blurred: refV, amt: mapStop('clarity', params.clarity) }} />;
  }

  // Blur — full-frame separable gaussian (H then V). Skipped when 0.
  let detail: React.ReactElement = afterClarity;
  if (params.blur > 0) {
    const radius = mapStop('blur', params.blur) * 6.0; // px offset scale
    const bH = <Node shader={detailShaders.blur} uniforms={{ t: afterClarity, resolution: [width, height], dir: [1, 0], radius }} />;
    detail = <Node shader={detailShaders.blur} uniforms={{ t: bH, resolution: [width, height], dir: [0, 1], radius }} />;
  }

  // TEXTURE (last stage): fade → vignette → glow (bloom/halation) → grain.
  const nFade = <Node shader={textureShaders.fade} uniforms={{ t: detail, amt: fade }} />;
  const nVignette = <Node shader={textureShaders.vignette} uniforms={{ t: nFade, amt: vig }} />;

  // Bloom + Halation share ONE glow engine: threshold + separable blur at ~1/4
  // res (cheap), then a single combine adds both. Skipped entirely when unused.
  const bloom = mapStop('bloom', params.bloom);
  const halation = mapStop('halation', params.halation);
  let glowed: React.ReactElement = nVignette;
  if (params.bloom !== 0 || params.halation !== 0) {
    const dw = Math.max(1, Math.round(width / 4));
    const dh = Math.max(1, Math.round(height / 4));
    const bright = <Node shader={glowShaders.threshold} width={dw} height={dh} uniforms={{ t: nVignette }} />;
    const blurH = <Node shader={glowShaders.blur} width={dw} height={dh} uniforms={{ t: bright, resolution: [dw, dh], dir: [1, 0] }} />;
    const blurV = <Node shader={glowShaders.blur} width={dw} height={dh} uniforms={{ t: blurH, resolution: [dw, dh], dir: [0, 1] }} />;
    glowed = (
      <Node
        shader={glowShaders.combine}
        uniforms={{ t: nVignette, glow: blurV, bloom, halation, tint: [1.0, 0.45, 0.2] }}
      />
    );
  }

  // Grain — REAL film-stock overlay, FINAL texture op (on top of the glow, never
  // blurred). Composited only when a stock is selected with non-zero intensity.
  // gl-react's ImageURLTextureLoader accepts the still's URL string directly.
  // (Video: this previews the still as a static overlay; the moving-grain clip
  //  path is a deliberate follow-up brief, not built here.)
  const grainStock = grainStockByKey(params.grainStock);
  const grainIntensity = mapStop('grain', params.grainIntensity);
  const texture: React.ReactElement = grainStock && params.grainIntensity > 0
    ? (
      <Node
        shader={textureShaders.grain}
        uniforms={{
          t: glowed,
          grainTex: grainStock.file,
          intensity: grainIntensity,
          imgAspect: width / height,
          grainAspect: GRAIN_ASPECT,
        }}
      />
    )
    : glowed;

  return (
    <Surface
      ref={surfaceRef as never}
      width={width}
      height={height}
      webglContextAttributes={preserve ? { preserveDrawingBuffer: true } : undefined}
    >
      {texture}
    </Surface>
  );
}

// Photo bake (Brief 8B) lives in lib/editor/bakeLook.ts: it renders this same
// chain to an OFFSCREEN Surface (preserve=true) at the AR's canonical export
// dims and reads it back via Surface#captureAsBlob. Geometry is applied first by
// editGeometry.bakeImageGeometry, then the baked image runs through here.
