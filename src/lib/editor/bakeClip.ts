"use client";

/**
 * bakeClip — render a short (3–5s) window of the GRADED video to a canvas and
 * record it (canvas.captureStream + MediaRecorder) into a tiny MUTED clip. This
 * is the autoplay material: tiles/feed loop this plain <video> — no live pipeline,
 * no full-video download. Cheap because it's short + muted + modest resolution.
 *
 * NOT a full transcode (that would be intractable client-side). Best-effort: any
 * failure returns null so publishing is never blocked (the surface falls back to
 * the graded poster).
 */

import React, { createRef } from "react";
import { createRoot } from "react-dom/client";
import Pipeline from "@/components/finishing/Pipeline";
import type { EditParams } from "./params";
import { lookById } from "@/components/finishing/looksCatalog";
import { ensureLut } from "./lut";

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const CLIP_LEN_DEFAULT = 4;   // seconds (3–5s band)
const CLIP_MAX_DIM = 720;     // autoplay clips loop in tiles, never fullscreen

/** Codec/container preference: MP4/H.264 first (Safari records it; newer Chrome
 *  too → iOS can play clips baked anywhere), then WebM. Returns null if MediaRecorder
 *  is unavailable. The observed support is logged so the matrix can be reported. */
export function pickClipMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const prefs = [
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const supported = prefs.filter((m) => MediaRecorder.isTypeSupported?.(m));
  console.log("[bakeClip] MediaRecorder supported mimeTypes:", supported);
  return supported[0] ?? null;
}

/** Auto-choose the clip window when the creator didn't pick one: anchor at the
 *  hero frame if it leaves room for the full clip, else a randomized start clamped
 *  so the whole clip fits and never begins in the final seconds. */
export function autoClipStart(duration: number, clipLen: number, heroFrameTime?: number | null): number {
  const maxStart = Math.max(0, duration - clipLen);
  if (heroFrameTime != null && heroFrameTime >= 0) return Math.min(heroFrameTime, maxStart);
  return Math.random() * maxStart;
}

interface CaptureSurface { /* gl-react Surface ref — only used to confirm mount */ }

export interface BakedClip { blob: Blob; mimeType: string; ext: "mp4" | "webm" }

/**
 * Record `clipLen` seconds of `videoUrl` (graded with `params`) starting at
 * `windowStart` (or auto if omitted). Returns null on any failure.
 */
export async function bakeAutoplayClip(
  videoUrl: string,
  params: EditParams,
  opts: { windowStart?: number; clipLen?: number; heroFrameTime?: number | null } = {},
): Promise<BakedClip | null> {
  if (typeof document === "undefined") return null;
  const mimeType = pickClipMime();
  if (!mimeType) { console.warn("[bakeClip] MediaRecorder unavailable — no clip"); return null; }

  let video: HTMLVideoElement | null = null;
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  // Hoisted to function scope so the finally can stop the capture stream + recorder
  // (they were const-scoped inside the try → unreachable for teardown = the leak).
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  try {
    // 1. Decode the video.
    video = document.createElement("video");
    video.crossOrigin = "anonymous"; video.muted = true; video.playsInline = true; video.preload = "auto";
    video.src = videoUrl;
    await new Promise<void>((res, rej) => {
      video!.onloadeddata = () => res();
      video!.onerror = () => rej(new Error("bakeClip: video decode failed"));
    });
    const vw = video.videoWidth, vh = video.videoHeight;
    const duration = isFinite(video.duration) ? video.duration : 0;
    if (!vw || !vh || !duration) throw new Error("bakeClip: missing video dims/duration");

    const clipLen = Math.min(opts.clipLen ?? CLIP_LEN_DEFAULT, Math.max(1, duration));
    const windowStart = Math.min(
      Math.max(opts.windowStart ?? autoClipStart(duration, clipLen, opts.heroFrameTime), 0),
      Math.max(0, duration - clipLen),
    );

    const scale = Math.min(1, CLIP_MAX_DIM / Math.max(vw, vh));
    const w = Math.max(2, Math.round(vw * scale)), h = Math.max(2, Math.round(vh * scale));

    // 2. Load the LOOK LUT so the recorded frames carry it.
    let activeLut: { canvas: HTMLCanvasElement; size: number } | null = null;
    if (params.lutId) {
      const look = lookById(params.lutId);
      if (look) { const e = await ensureLut(look.id, look.file); activeLut = { canvas: e.canvas, size: e.parsed.size }; }
    }

    // 3. Mount the pipeline offscreen (preserve=true so the canvas is captureable).
    container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
    document.body.appendChild(container);
    root = createRoot(container);
    const ref = createRef<CaptureSurface>();
    root.render(
      React.createElement(Pipeline, {
        source: video, params, width: w, height: h, preserve: true, activeLut,
        surfaceRef: ref as unknown as React.Ref<unknown>,
      }),
    );
    await raf(); await raf(); await delay(120);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) throw new Error("bakeClip: pipeline canvas not found");

    // 4. Seek to the window start and play (drives the pipeline's per-frame redraw).
    await new Promise<void>((res) => { video!.onseeked = () => res(); video!.currentTime = windowStart; });
    await video.play().catch(() => {});
    await raf(); await raf(); // let a graded frame land before recording (no black head)

    // 5. Record.
    stream = (canvas as unknown as { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    const rec = recorder; // non-null local — the function-scoped `recorder` loses narrowing inside the callbacks below
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
    rec.start();
    await delay(clipLen * 1000 + 80);
    rec.stop();
    await stopped;

    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) throw new Error("bakeClip: recorder produced no data");
    const ext: "mp4" | "webm" = mimeType.includes("mp4") ? "mp4" : "webm";
    console.log("[bakeClip] clip baked:", { mimeType, ext, bytes: blob.size, windowStart, clipLen, w, h });
    return { blob, mimeType, ext };
  } catch (e) {
    console.warn("[bakeClip] failed (post will use poster for autoplay):", e);
    return null;
  } finally {
    // Teardown runs AFTER the blob is captured + returned above, so the clip is never
    // truncated. Every step is independently try/caught so cleanup can't throw and lose
    // the result. (videoUrl is the CALLER's media object URL — never revoked here.)
    // B. Fully release the MediaRecorder: stop if still recording, then drop handlers so
    //    their closures (which retain the canvas/video) can be GC'd.
    try {
      if (recorder) {
        if (recorder.state !== "inactive") recorder.stop();
        recorder.ondataavailable = null;
        recorder.onstop = null;
      }
    } catch { /* noop */ }
    // A. Stop the canvas capture-stream tracks — the core fix (releases the stream).
    try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    // C. Release the <video> + its decoder: pause, drop the source, and load() to abort
    //    any pending fetch/decode (frees the decoder more reliably than src='' on iOS).
    try { if (video) { video.pause(); video.removeAttribute("src"); video.load(); } } catch { /* noop */ }
    if (root && container) {
      const r = root, c = container;
      setTimeout(() => { try { r.unmount(); } catch { /* noop */ } c.remove(); }, 0);
    }
  }
}
