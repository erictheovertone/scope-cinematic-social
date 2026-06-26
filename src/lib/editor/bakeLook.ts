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

interface CaptureSurface {
  captureAsBlob: (type?: string, quality?: number) => Promise<Blob | null>;
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

  // MEMORY CAP (iOS crash fix). The finishing chain renders ~10 full-size
  // framebuffers + a preserveDrawingBuffer through ONE WebGL Surface; at the
  // cinematic export width (4096) that GPU peak exceeds the iOS WebKit per-context
  // budget → WebContent process killed → app crash. Cap the RENDER TARGET width on
  // constrained/mobile clients (desktop keeps 4096). The cap is on the Surface size
  // ONLY — input texture, look math and node chain are unchanged. Aspect ratio is
  // preserved EXACTLY (uniform scale), so the upload/display path is identical, just
  // fewer pixels. No gl context exists yet here (the Surface mounts below), so the
  // platform/pointer heuristics decide.
  const maxW = getMaxBakeWidth();
  let renderW = w;
  let renderH = h;
  if (w > maxW) {
    const scale = maxW / w;
    renderW = Math.round(w * scale);
    renderH = Math.round(h * scale); // keep the AR exact
  }
  // TEMP DIAGNOSTIC (strip after on-device crash is diagnosed): confirm the cap engaged.
  console.log('[BAKE] getMaxBakeWidth=', maxW, 'requested w×h=', w, h,
              '→ renderW×H=', renderW, renderH);

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(container);
  const root = createRoot(container);
  const ref = createRef<CaptureSurface>();

  try {
    console.log('[BAKE] starting render', renderW, renderH); // TEMP DIAGNOSTIC
    root.render(
      React.createElement(Pipeline, {
        source: image,
        params,
        width: renderW,
        height: renderH,
        surfaceRef: ref as unknown as React.Ref<unknown>,
        preserve: true,
        activeLut,
      }),
    );

    // Allow mount + first draw + any async textures (LUTs are sync; grain pre-warmed).
    await raf(); await raf(); await raf();
    await delay(160);

    // TEMP DIAGNOSTIC: surface a GPU context kill (iOS WebContent OOM) instead of
    // dying silently — print something the on-device inspector can catch.
    const canvasEl = container.querySelector('canvas') as HTMLCanvasElement | null;
    canvasEl?.addEventListener('webglcontextlost', (e) => {
      console.error('[BAKE] WEBGL CONTEXT LOST', e);
    });

    const surface = ref.current;
    if (!surface || typeof surface.captureAsBlob !== 'function') {
      throw new Error('bakeLook: surface unavailable (pipeline did not mount)');
    }
    const blob = await surface.captureAsBlob('image/jpeg', 0.92);
    if (!blob) throw new Error('bakeLook: readback produced no image');
    return blob;
  } catch (err) {
    console.error('[BAKE] render failed:', err); // TEMP DIAGNOSTIC
    throw err; // GATE B preserved — publish still aborts on a bake failure.
  } finally {
    // SYNCHRONOUS WebGL teardown (iOS-critical). Readback (captureAsBlob) has already
    // completed above, so this NEVER changes the baked pixels. Each bakeLook spins up a
    // fresh gl-react Surface = a WebGL context; iOS caps active contexts (~8–16), and a
    // deferred/GC'd release lets them pile up (the palette bakes are serialized, but a
    // serialized chain still stacks contexts if each isn't freed before the next starts).
    // Free the GPU context NOW via WEBGL_lose_context so at most ONE is alive at a time.
    // The DOM unmount stays deferred (avoids React's "unmount during render" warning) —
    // the context is already lost, so nothing GPU-heavy is held in the meantime.
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
 * captureAsBlob) at thumbnail scale (~480px wide, source aspect preserved). For a
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
