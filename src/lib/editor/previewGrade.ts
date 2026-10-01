// Brief C2 §2 (SKETCH — perf/c2-heavy worktree, not merged) — finishing grade on the PREVIEW
// bitmap, never full-res, so sliders move at 60fps. The existing Pipeline.tsx already runs a WebGL
// grade; this formalizes that it binds the ≤2048 WorkingPreview texture (not the original file) and
// that slider input is ref+rAF (no React state per pointermove). The full-res grade happens ONCE at
// bake (bakeWorker), applying the SAME look params.
//
// MERGE GATE: after the §0 harness BEFORE trace — p95 frame time during a scripted slider drag.

import type { WorkingPreview } from './previewDecode';

export interface GradeParams { exposure: number; contrast: number; saturation: number; temp: number; tint: number; /* …LUT ref */ }

export interface PreviewGrader {
  /** Re-render the preview with the latest params. Called from a rAF loop, NOT per pointermove. */
  render(params: GradeParams): void;
  /** The <canvas> element to mount in the finishing stage. */
  canvas: HTMLCanvasElement;
  dispose(): void;
}

/** Bind the capped preview to the WebGL grader (reuses Pipeline's program). Zero full-res touch. */
export function createPreviewGrader(preview: WorkingPreview): PreviewGrader {
  // TODO: lift Pipeline.tsx's GL program here, texImage2D the preview.bitmap (already colour-managed,
  // ≤2048), and expose render(params) that only updates uniforms (no re-upload). Slider handler:
  //   onInput → paramsRef.current = next; if(!raf) raf = rAF(() => { raf=0; grader.render(paramsRef.current) })
  // so input coalesces to one GL draw per frame.
  throw new Error('createPreviewGrader: lift Pipeline GL program here — sketch only');
}

/** The SAME params drive the bake (bakeWorker) at full res — one look, two resolutions. */
export type { GradeParams as BakeGradeParams };
