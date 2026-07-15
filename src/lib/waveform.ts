// ── src/lib/waveform.ts — client-side peak generation + lazy self-heal ───────
// Decode audio in the browser (Web Audio) → ~300 normalized peaks (0–1). Decoded
// PCM is BIG (a 6-min stereo track ≈ 100MB+ decoded), so decodes are SERIALIZED
// through a global queue and each AudioContext is closed immediately — 12 parallel
// batch decodes would OOM; one-at-a-time bounds memory to a single track's PCM.

export const WAVEFORM_PEAKS = 300;

let chain: Promise<unknown> = Promise.resolve();
/** Run `job` after all previously-queued decodes finish (serialize memory use). */
function serialize<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => {});
  return run;
}

function peaksFromBuffer(buf: ArrayBuffer, peakCount: number): Promise<number[]> {
  return serialize(async () => {
    const AC: typeof AudioContext | undefined =
      (typeof window !== "undefined" && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) || undefined;
    if (!AC) return [];
    const ctx = new AC();
    try {
      const audio = await ctx.decodeAudioData(buf.slice(0));
      const ch = audio.getChannelData(0); // first channel is enough for a display wave
      const block = Math.max(1, Math.floor(ch.length / peakCount));
      const peaks: number[] = new Array(peakCount);
      let max = 0;
      for (let i = 0; i < peakCount; i++) {
        let peak = 0;
        const start = i * block;
        for (let j = 0; j < block; j++) { const v = Math.abs(ch[start + j] || 0); if (v > peak) peak = v; }
        peaks[i] = peak;
        if (peak > max) max = peak;
      }
      return max > 0 ? peaks.map((p) => +(p / max).toFixed(3)) : peaks.map(() => 0);
    } catch {
      return [];
    } finally {
      try { await ctx.close(); } catch {}
    }
  });
}

export async function peaksFromFile(file: Blob, peakCount = WAVEFORM_PEAKS): Promise<number[]> {
  return peaksFromBuffer(await file.arrayBuffer(), peakCount);
}

export async function peaksFromUrl(url: string, peakCount = WAVEFORM_PEAKS): Promise<number[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  return peaksFromBuffer(await res.arrayBuffer(), peakCount);
}

// ── Legacy self-heal ─────────────────────────────────────────────────────────
// The first render of a peakless track decodes from file_url and POSTs the peaks
// back (fills only null → idempotent, can't overwrite). Guarded per track id so a
// list of legacy rows doesn't decode the same track twice.
const healing = new Set<string>();
export async function backfillPeaks(trackId: string, fileUrl: string): Promise<number[] | null> {
  if (healing.has(trackId)) return null;
  healing.add(trackId);
  try {
    const peaks = await peaksFromUrl(fileUrl);
    if (peaks.length === 0) return null;
    fetch("/api/music/waveform", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackId, peaks }), keepalive: true,
    }).catch(() => {});
    return peaks;
  } catch {
    return null;
  }
}
