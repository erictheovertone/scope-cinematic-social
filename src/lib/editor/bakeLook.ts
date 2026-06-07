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

void DEFAULT_PARAMS; // (kept for reference parity; comparisons are explicit below)

/** True when EditParams carries any non-default look edit (so a bake is needed). */
export function hasLookEdits(p: EditParams): boolean {
  if (p.exposure || p.contrast || p.saturation || p.fade || p.sharpen || p.vignette ||
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

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(container);
  const root = createRoot(container);
  const ref = createRef<CaptureSurface>();

  try {
    root.render(
      React.createElement(Pipeline, {
        source: image,
        params,
        width: w,
        height: h,
        surfaceRef: ref as unknown as React.Ref<unknown>,
        preserve: true,
      }),
    );

    // Allow mount + first draw + any async textures (LUTs are sync; grain pre-warmed).
    await raf(); await raf(); await raf();
    await delay(160);

    const surface = ref.current;
    if (!surface || typeof surface.captureAsBlob !== 'function') {
      throw new Error('bakeLook: surface unavailable (pipeline did not mount)');
    }
    const blob = await surface.captureAsBlob('image/jpeg', 0.92);
    if (!blob) throw new Error('bakeLook: readback produced no image');
    return blob;
  } finally {
    // Defer unmount to avoid React "synchronous unmount during render" warnings.
    setTimeout(() => { try { root.unmount(); } catch { /* noop */ } container.remove(); }, 0);
  }
}
