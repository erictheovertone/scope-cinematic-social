// ── stillBake — HOME-3.1 Part B: instrumented orchestration around the (UNCHANGED) video still bake ──
//
// The bake MECHANISM (bakeGradedVideoFrame) is not touched — two implementations have failed on Eric's
// phone, so the next change to it must follow evidence. This wraps it to answer the one question nobody
// could see: on a real publish, WHY did the poster bake save nothing? It records the last stage reached
// and emits ONE always-on funnel event (`still_bake`) per video publish, and runs the same bake as a
// DRY RUN (no upload, no row) under video debug so Eric can test without minting a post.
//
// No URLs, no user data in the event.

import { bakeGradedVideoFrame } from '@/lib/editor/bakeLook';
import { bakeImageGeometry, type EditGeometry } from '@/lib/editGeometry';
import { uploadImageWithRenditions } from '@/lib/userService';
import { track } from '@/lib/funnel';
import type { EditParams } from '@/lib/editor/params';

const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';

// The last step the bake reached — reported as `stage` so a failure names where it stopped.
export type StillBakeStage =
  | 'no-preview-el' | 'seek' | 'no-frame' | 'lut' | 'pipeline-mount' | 'capture'
  | 'readback' | 'geometry' | 'upload' | 'done' | 'timeout';

// bakeGradedVideoFrame throws distinct messages; map them to the fine inner stage (we don't change it).
function stageFromError(msg: string, fallback: StillBakeStage): StillBakeStage {
  if (/capture node unavailable/i.test(msg)) return 'pipeline-mount';
  if (/has no frame/i.test(msg)) return 'no-frame';
  if (/LUT load failed/i.test(msg)) return 'lut';
  if (/readback|2D context/i.test(msg)) return 'readback';
  if (/timed out|timeout|Still capture/i.test(msg)) return 'timeout';
  return fallback;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_r, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

export interface StillBakeResult { ok: boolean; posterUrl: string | null; startPosterUrl: string | null; }

/**
 * Bake the hero + start stills from the already-decoded `ev`, record the last stage, and emit the
 * `still_bake` funnel event. When `userId` is null OR `dryRun` is true, nothing is uploaded and no URLs
 * are returned — the bake runs end-to-end (seek → pipeline → capture → readback → geometry) for evidence.
 * NEVER throws — publishing must not be blocked by instrumentation.
 */
export async function bakeStillsInstrumented(opts: {
  ev: HTMLVideoElement | null;
  params: EditParams;
  geometry: EditGeometry;
  exportW: number;
  exportH: number;
  userId: string | null;
  dryRun?: boolean;
  timeoutMs?: number;
}): Promise<StillBakeResult> {
  const { ev, params, geometry, exportW, exportH, userId } = opts;
  const dryRun = !!opts.dryRun;
  const heroT = (params as { heroFrameTime?: number }).heroFrameTime ?? 0;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  let stage: StillBakeStage = 'capture';
  let ok = false;
  let error = '';
  let posterUrl: string | null = null;
  let startPosterUrl: string | null = null;

  const emit = () => {
    const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    void track('still_bake', {
      ok, stage, error: error.slice(0, 200), ms, build: BUILD, heroT, dryRun,
      hadPreviewEl: !!ev,
      videoW: ev?.videoWidth ?? 0,
      videoH: ev?.videoHeight ?? 0,
      readyState: ev?.readyState ?? -1,
      paused: ev?.paused ?? null,
    });
  };

  if (!ev) { stage = 'no-preview-el'; error = 'no live EDIT preview element'; emit(); return { ok: false, posterUrl: null, startPosterUrl: null }; }

  try {
    await withTimeout((async () => {
      const bakeOne = async (timeSec: number): Promise<string | null> => {
        stage = 'capture'; // bakeGradedVideoFrame owns seek→lut→pipeline-mount→capture→readback; its throw refines this
        const fullBlob = await bakeGradedVideoFrame(ev, params, timeSec);
        stage = 'geometry';
        const framed = await bakeImageGeometry(new File([fullBlob], 'frame.jpg', { type: 'image/jpeg' }), geometry, exportW, exportH);
        if (dryRun || !userId) return null; // dry run / no account → prove the bake, upload nothing
        stage = 'upload';
        return uploadImageWithRenditions(framed, 'post-media', userId);
      };
      posterUrl = await bakeOne(heroT);                        // hero → poster_url
      startPosterUrl = heroT === 0 ? posterUrl : await bakeOne(0); // start(0) → start_poster_url (== hero when heroT 0)
      stage = 'done';
      ok = true;
    })(), opts.timeoutMs ?? 25_000, 'Still capture');
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    ok = false;
    stage = stageFromError(error, stage);
  }

  emit();
  return { ok, posterUrl: dryRun ? null : posterUrl, startPosterUrl: dryRun ? null : startPosterUrl };
}
