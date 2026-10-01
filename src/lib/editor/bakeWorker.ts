// Brief C2 §2 (SKETCH — perf/c2-heavy worktree, not merged) — full-res bake OFF the main thread.
// OffscreenCanvas in a Worker so the UI stays interactive during a 12–48MP bake; a progress beat
// shows. Fallback: chunked main-thread bake (progress state) where OffscreenCanvas is unavailable.
// Mirrors editGeometry's geometry math EXACTLY (same rect → same pixels); adds colour (X5) + sRGB.
//
// MERGE GATE: only after the §0 harness BEFORE trace (long tasks, p95 frame time, heap). The AFTER
// must show the bake's long task leaving the main thread. No perf claim without both tables.

import type { EditGeometry } from '@/lib/editGeometry';

export interface BakeRequest {
  file: File; geom: EditGeometry; exportW: number; exportH: number;
}

/** Run the bake in a Worker when possible; else chunked main-thread. onProgress 0..1. */
export async function bakeOffThread(req: BakeRequest, onProgress?: (p: number) => void): Promise<Blob> {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    return bakeInWorker(req, onProgress);
  }
  return bakeMainThreadChunked(req, onProgress); // TODO: port editGeometry.bake with rAF-yield chunks
}

function bakeInWorker(req: BakeRequest, onProgress?: (p: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // The worker decodes the File (createImageBitmap w/ colorSpaceConversion:'default'), draws to an
    // OffscreenCanvas(exportW,exportH) ctx { colorSpace:'srgb' } via the SAME transform as
    // editGeometry (translate/scale/rotate/straighten), then convertToBlob({type:'image/jpeg'}).
    const worker = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.value);
      else if (m.type === 'done') { resolve(m.blob as Blob); worker.terminate(); }
      else if (m.type === 'error') { reject(new Error(m.message)); worker.terminate(); }
    };
    worker.onerror = (e) => { reject(e.error ?? new Error('bake worker failed')); worker.terminate(); };
    worker.postMessage(req); // File is structured-cloneable; no transfer needed
  });
}

// TODO: bake.worker.ts — the actual OffscreenCanvas bake (geometry math lifted verbatim from
// editGeometry.applyGeometryToImage, minus the DOM canvas). Emits {type:'progress'} then {type:'done',blob}.
async function bakeMainThreadChunked(_req: BakeRequest, onProgress?: (p: number) => void): Promise<Blob> {
  onProgress?.(1);
  throw new Error('bakeMainThreadChunked: port editGeometry.bake here (rAF-yielded) — sketch only');
}
