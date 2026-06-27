"use client";

/**
 * bakeLook — render the FINISHING pipeline OFFSCREEN at export dims and read the
 * result back as a JPEG (Brief 8B, photos only). Runs the SAME Pipeline + the
 * post's EditParams as the live preview, so the baked output matches the editor
 * (GATE A). STRICT: throws on any failure so publish can abort rather than
 * silently upload an un-graded image (GATE B).
 *
 * Sequence at publish: editGeometry.bakeImageGeometry (2D crop/straighten/rotate)
 * → decode that JPEG → bakeLook(image, params, exportW, exportH) → upload.
 */

import React, { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import Pipeline from '@/components/finishing/Pipeline';
import { DEFAULT_PARAMS, type EditParams } from './params';
import { CHANNELS, isIdentityChannel } from './curveEngine';
import { grainStockByKey } from '@/components/finishing/grainStocks';
import { lookById } from '@/components/finishing/looksCatalog';
import { ensureLut } from './lut';
import { getMaxBakeWidth } from './renderBudget';

void DEFAULT_PARAMS; // (kept for reference parity; comparisons are explicit below)

/** True when EditParams carries any non-default look edit (so a bake is needed). */
export function hasLookEdits(p: EditParams): boolean {
  if (p.exposure || p.denoise || p.contrast || p.saturation || p.fade || p.sharpen || p.vignette ||
      p.skinTone || p.clarity || p.bloom || p.halation || p.blur) return true;
  if (p.whiteBalance.t || p.whiteBalance.tint) return true;
  if (p.grainStock && p.grainIntensity > 0) return true;
  const st = p.splitTone;
  if ((st.shadowsHue && st.shadowsStrength > 0) || (st.highlightsHue && st.highlightsStrength > 0)) return true;
  if (CHANNELS.some((c) => !isIdentityChannel(c.key, p.curves[c.key]))) return true;
  if (p.lutId) return true;
  return false;
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// A gl-react child Node ref — its capture() reads from the node's OWN FBO (the full
// pipeline output), which survives the iOS present clear (unlike the root/default buffer).
interface CaptureNode {
  capture: (x?: number, y?: number, w?: number, h?: number) => { data: Uint8Array; shape: number[] };
}

/** Decode a File into a fully-ready HTMLImageElement (for the texture source). */
export function decodeImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bakeLook: source decode failed')); };
    img.src = url;
  });
}

/**
 * Render `image` through the pipeline with `params` at `w×h` offscreen and return
 * a JPEG Blob. Throws on any failure (GATE B).
 */
export async function bakeLook(image: HTMLImageElement, params: EditParams, w: number, h: number): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('bakeLook: not in a browser');

  // Pre-warm the grain stock so its texture is cached before the pipeline
  // requests it (otherwise the first capture could miss the async grain — GATE A).
  if (params.grainStock) {
    const stock = grainStockByKey(params.grainStock);
    if (stock) {
      const gi = new Image();
      gi.crossOrigin = 'anonymous';
      gi.src = stock.file;
      await gi.decode().catch(() => { /* fall through; bake still waits below */ });
    }
  }

  // Load the active LOOK LUT so the bake includes it (parsed synchronously into
  // a 2D-tiled canvas the Pipeline samples).
  let activeLut: { canvas: HTMLCanvasElement; size: number } | null = null;
  if (params.lutId) {
    const look = lookById(params.lutId);
    if (look) {
      try {
        const entry = await ensureLut(look.id, look.file);
        activeLut = { canvas: entry.canvas, size: entry.parsed.size };
      } catch (e) { throw new Error(`bakeLook: LUT load failed for ${params.lutId}: ${(e as Error).message}`); }
    }
  }

  // MEMORY CAP (iOS crash fix). The finishing chain renders the look through ONE WebGL
  // Surface; at the cinematic export width (4096) the GPU peak exceeds the iOS WebKit
  // per-context budget → WebContent process killed. Cap the RENDER TARGET width on
  // constrained/mobile clients (desktop keeps 4096). Aspect ratio is preserved exactly,
  // so the upload/display path is identical — just fewer pixels.
  const maxW = getMaxBakeWidth();
  let renderW = w;
  let renderH = h;
  if (w > maxW) {
    const scale = maxW / w;
    renderW = Math.round(w * scale);
    renderH = Math.round(h * scale); // keep the AR exact
  }

  const container = document.createElement('div');
  // Offscreen, position:absolute (NOT fixed — a fixed offscreen surface composites
  // unreliably under the standalone body-lock on iOS).
  container.style.cssText = 'position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(container);
  const root = createRoot(container);
  const captureRef = createRef<CaptureNode>(); // child-FBO node for the readback

  try {
    root.render(
      React.createElement(Pipeline, {
        source: image,
        params,
        width: renderW,
        height: renderH,
        captureRef: captureRef as unknown as React.Ref<unknown>,
        // preserveDrawingBuffer MUST stay false: true hard-kills the Surface mount on iOS
        // WebKit (the publish crash). We read the rendered pixels back from a child node's
        // own FBO (render-to-texture) instead — see the readback below.
        preserve: false,
        activeLut,
      }),
    );

    // Allow mount + first draw + any async textures (LUTs are sync; grain pre-warmed).
    await raf(); await raf(); await raf();
    await delay(160);

    // READBACK from the CHILD node's OWN FBO (render-to-texture). The gl-react ROOT node
    // has no framebuffer (it renders to the default buffer, which iOS clears after present
    // → black). Pipeline wraps the full pipeline as a CHILD under an outer passthrough
    // root, so captureRef points at a node that owns an FBO holding the complete output;
    // its capture() reads from THAT FBO and survives the present clear. preserve stays
    // false. pixelRatio:1 on the bake Surface → the FBO is exactly renderW×renderH.
    const node = captureRef.current;
    if (!node || typeof node.capture !== 'function') {
      throw new Error('bakeLook: capture node unavailable (pipeline did not mount)');
    }
    const captured = node.capture(); // ndarray-like { data, shape:[w,h,4] }
    const cw = captured.shape[0]; // width
    const ch = captured.shape[1]; // height
    const raw = captured.data;    // raw RGBA, bottom-up rows ([h][w][4] row-major)

    // Flip vertical (GL is bottom-up → top-down) into a full-res canvas...
    const full = document.createElement('canvas');
    full.width = cw;
    full.height = ch;
    const fctx = full.getContext('2d');
    if (!fctx) throw new Error('bakeLook: 2D context unavailable for readback encode');
    const fImg = fctx.createImageData(cw, ch);
    const rowBytes = cw * 4;
    for (let y = 0; y < ch; y++) {
      const srcStart = (ch - 1 - y) * rowBytes; // bottom-up → top-down
      fImg.data.set(raw.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
    }
    fctx.putImageData(fImg, 0, 0);

    // ...then downscale to the capped renderW×renderH (predictable output size across
    // device pixelRatios; honors the cap regardless of DPR).
    const out = document.createElement('canvas');
    out.width = renderW;
    out.height = renderH;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('bakeLook: 2D context unavailable for downscale');
    octx.drawImage(full, 0, 0, renderW, renderH);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('bakeLook: readback produced no image');
    return blob;
  } finally {
    // SYNCHRONOUS WebGL teardown (iOS-critical). Readback has already completed above, so
    // this NEVER changes the baked pixels. Each bakeLook spins up a fresh gl-react Surface
    // = a WebGL context; iOS caps active contexts (~8–16) and a deferred/GC'd release lets
    // them pile up. Free the GPU context NOW via WEBGL_lose_context so at most ONE is alive
    // at a time. The DOM unmount stays deferred (avoids React's "unmount during render"
    // warning) — the context is already lost, so nothing GPU-heavy is held meanwhile.
    try {
      const canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
      const gl = (canvas && (
        canvas.getContext('webgl') ||
        canvas.getContext('webgl2') ||
        canvas.getContext('experimental-webgl')
      )) as WebGLRenderingContext | null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { /* teardown must never mask the bake result */ }
    setTimeout(() => { try { root.unmount(); } catch { /* noop */ } container.remove(); }, 0);
  }
}

/**
 * captureLookThumb — a small JPEG of the CURRENT source frame with `params`
 * applied, for the PALETTE tile (memory anchor). Reuses bakeLook (same pipeline +
 * readback) at thumbnail scale (~480px wide, source aspect preserved). For a
 * VIDEO source it snapshots the current frame to a still first, then bakes it.
 * Returns null on any failure — the thumbnail is an enhancement, never a save
 * dependency, so the caller must keep saving regardless.
 */
const THUMB_W = 480;
export async function captureLookThumb(
  source: HTMLImageElement | HTMLVideoElement,
  params: EditParams,
): Promise<Blob | null> {
  try {
    if (typeof document === 'undefined' || !source) return null;
    const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
    const sw = isVideo ? source.videoWidth : (source as HTMLImageElement).naturalWidth;
    const sh = isVideo ? source.videoHeight : (source as HTMLImageElement).naturalHeight;
    if (!sw || !sh) return null;

    // bakeLook textures an HTMLImageElement; a video's current frame is snapshotted
    // to a still so the same pipeline path produces the looked thumbnail.
    let image: HTMLImageElement;
    if (isVideo) {
      const cv = document.createElement('canvas');
      cv.width = sw; cv.height = sh;
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(source as CanvasImageSource, 0, 0, sw, sh);
      image = new Image();
      image.src = cv.toDataURL('image/jpeg', 0.9);
      await image.decode().catch(() => { /* fall through; bakeLook waits on its own draw */ });
    } else {
      image = source as HTMLImageElement;
    }

    const w = THUMB_W;
    const h = Math.max(1, Math.round((THUMB_W * sh) / sw));
    return await bakeLook(image, params, w, h);
  } catch (e) {
    console.warn('[captureLookThumb] failed:', e);
    return null;
  }
}
