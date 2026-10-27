'use client';

// ── VideoDebugOverlay — Brief V1 on-device video-path trace ───────────────────
// Inert unless ?debug=video (isVideoDebug). Fixed top-left, tiny mono, ≤14 lines,
// pointer-events:none — screenshot-friendly. Shows, for the EDIT & POST + finishing
// path: the file facts, a live breadcrumb trail (step · elapsed), live resource
// counters (object URLs, <video> elements, <canvas> allocations + px, big in-memory
// blob copies), the last 3 errors, and — the point of the brief — a
// "LAST STEP BEFORE RELOAD" line recovered from sessionStorage after an iOS tab kill.
//
// The resource counters come from passive, debug-GATED pass-through probes on
// URL.createObjectURL / revokeObjectURL / document.createElement. They are installed
// ONLY while ?debug=video is active and only ever observe (call through to the real
// impl, record, return its result), so production (flag off) is byte-identical.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isVideoDebug } from '@/lib/debugFlags';
import {
  subscribeVideoDebug,
  getVideoDebugState,
  readReloadCrumb,
} from '@/lib/videoDebug';

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';

// ── Resource probes (installed once, gated) ───────────────────────────────────
type Probe = {
  liveUrls: Set<string>;
  totalUrls: number;
  bigBlobs: Map<string, number>; // objURL → byte size (≥1MB sources = "file copies")
  videos: Set<WeakRef<HTMLVideoElement>>;
  totalVideos: number;
  canvases: Set<WeakRef<HTMLCanvasElement>>;
  totalCanvases: number;
  fps: number | null;
};
const PROBE_KEY = '__scopeVideoProbe__';

function getProbe(): Probe | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, Probe>;
  if (w[PROBE_KEY]) return w[PROBE_KEY];
  if (!isVideoDebug()) return null;

  const probe: Probe = {
    liveUrls: new Set(), totalUrls: 0, bigBlobs: new Map(),
    videos: new Set(), totalVideos: 0, canvases: new Set(), totalCanvases: 0, fps: null,
  };
  w[PROBE_KEY] = probe;

  // Install the pass-through probes. Wrapped: if a UA has frozen URL/document, the
  // overlay simply shows no counters rather than throwing (never breaks the page).
  try {
    // createObjectURL / revokeObjectURL — count live URLs + big (≥1MB) blob sources.
    const origCreate = URL.createObjectURL.bind(URL);
    const origRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = ((obj: Blob | MediaSource) => {
      const url = origCreate(obj as Blob);
      try {
        probe.liveUrls.add(url);
        probe.totalUrls++;
        const size = (obj as Blob)?.size ?? 0;
        if (size >= 1024 * 1024) probe.bigBlobs.set(url, size);
      } catch { /* ignore */ }
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => {
      try { probe.liveUrls.delete(url); probe.bigBlobs.delete(url); } catch { /* ignore */ }
      return origRevoke(url);
    }) as typeof URL.revokeObjectURL;

    // createElement — WeakRef-track <video>/<canvas> so we can count LIVE ones.
    const origCE = document.createElement.bind(document);
    document.createElement = ((tag: string, opts?: ElementCreationOptions) => {
      const el = origCE(tag as 'div', opts);
      try {
        const t = String(tag).toLowerCase();
        if (t === 'video') { probe.videos.add(new WeakRef(el as unknown as HTMLVideoElement)); probe.totalVideos++; }
        else if (t === 'canvas') { probe.canvases.add(new WeakRef(el as unknown as HTMLCanvasElement)); probe.totalCanvases++; }
      } catch { /* ignore */ }
      return el;
    }) as typeof document.createElement;
  } catch { /* frozen globals — counters stay at 0 */ }

  return probe;
}

// Count still-alive refs (deref !== undefined); prune dead ones. GC timing is
// approximate but the "how many live right now" signal is what matters.
function liveVideos(probe: Probe): HTMLVideoElement[] {
  const out: HTMLVideoElement[] = [];
  for (const ref of probe.videos) { const v = ref.deref(); if (v) out.push(v); else probe.videos.delete(ref); }
  return out;
}
function liveCanvases(probe: Probe): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (const ref of probe.canvases) { const c = ref.deref(); if (c) out.push(c); else probe.canvases.delete(ref); }
  return out;
}

export default function VideoDebugOverlay() {
  const [on, setOn] = useState(false);
  const [reloadStep, setReloadStep] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const fpsLatched = useRef(false);

  // Snapshot the breadcrumb store.
  const snap = useSyncExternalStore(subscribeVideoDebug, getVideoDebugState, getVideoDebugState);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const active = isVideoDebug();
    setOn(active);
    if (!active) return;
    setReloadStep(readReloadCrumb()); // crash line from a previous (killed) page
    getProbe(); // install probes

    // window error capture → last 3.
    const onErr = (e: ErrorEvent) => { import('@/lib/videoDebug').then((m) => m.vdbgError(`${e.message}`.slice(0, 80))); };
    const onRej = (e: PromiseRejectionEvent) => { import('@/lib/videoDebug').then((m) => m.vdbgError(`unhandled: ${String(e.reason?.message ?? e.reason).slice(0, 70)}`)); };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    const id = window.setInterval(() => setTick((t) => t + 1), 500); // live resource counters

    // Brief V1 §3 — test-only dump: the harness reads the trace + live resource
    // snapshot through this. Only defined while ?debug=video is active (same gate
    // as the overlay), so it is never present in a normal production session.
    (window as unknown as { __scopeVdbgDump?: () => unknown }).__scopeVdbgDump = () => {
      const s = getVideoDebugState();
      const p = getProbe();
      const live = p ? liveVideos(p) : [];
      const canv = p ? liveCanvases(p) : [];
      return {
        crumbs: s.crumbs,
        file: s.file,
        errors: s.errors,
        res: {
          videosLive: live.length, videosTotal: p?.totalVideos ?? 0,
          urlsLive: p?.liveUrls.size ?? 0, urlsTotal: p?.totalUrls ?? 0,
          canvasesLive: canv.length, canvasesTotal: p?.totalCanvases ?? 0,
          canvasMP: canv.reduce((n, c) => n + (c.width || 0) * (c.height || 0), 0) / 1e6,
          bigBlobCount: p?.bigBlobs.size ?? 0,
          bigBlobMB: p ? [...p.bigBlobs.values()].reduce((n, b) => n + b, 0) / (1024 * 1024) : 0,
        },
      };
    };

    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
      window.clearInterval(id);
      try { delete (window as unknown as { __scopeVdbgDump?: () => unknown }).__scopeVdbgDump; } catch { /* ignore */ }
    };
  }, []);

  if (!on) return null;
  const probe = getProbe();

  // Live resource reads.
  let vids: HTMLVideoElement[] = [], cvs: HTMLCanvasElement[] = [], urlLive = 0, urlTotal = 0;
  let cvsPx = 0, copyCount = 0, copyMB = 0, fps: number | null = null;
  if (probe) {
    vids = liveVideos(probe);
    cvs = liveCanvases(probe);
    urlLive = probe.liveUrls.size; urlTotal = probe.totalUrls;
    cvsPx = cvs.reduce((n, c) => n + (c.width || 0) * (c.height || 0), 0);
    copyCount = probe.bigBlobs.size;
    copyMB = [...probe.bigBlobs.values()].reduce((n, b) => n + b, 0) / (1024 * 1024);
    // Best-effort source fps via requestVideoFrameCallback on a playing video (latched once).
    if (!fpsLatched.current) {
      const v = vids.find((x) => !x.paused && 'requestVideoFrameCallback' in x) as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, md: { mediaTime: number; presentedFrames: number }) => void) => void }) | undefined;
      if (v?.requestVideoFrameCallback) {
        fpsLatched.current = true;
        let f0 = -1, t0 = 0;
        const sample = (_now: number, md: { mediaTime: number; presentedFrames: number }) => {
          if (f0 < 0) { f0 = md.presentedFrames; t0 = md.mediaTime; v.requestVideoFrameCallback!(sample); return; }
          const df = md.presentedFrames - f0, dt = md.mediaTime - t0;
          if (dt > 0.15 && probe) probe.fps = Math.round((df / dt) * 10) / 10;
        };
        v.requestVideoFrameCallback(sample);
      }
    }
    fps = probe.fps;
  }

  const f = snap.file;
  const nav = typeof window !== 'undefined' ? window.location.pathname : '';

  // Compact breadcrumb tail (fit ≤14 lines): "step+elapsed" tokens, newest last.
  const tail = snap.crumbs.slice(-10).map((c) => `${c.step}+${c.elapsed.toFixed(1)}`);
  const half = Math.ceil(tail.length / 2);

  const lines: string[] = [];
  if (reloadStep) lines.push(`⚠ LAST STEP BEFORE RELOAD: ${reloadStep}`);
  lines.push(`?debug=video ${BUILD_SHA} @${nav}`);
  lines.push(`file ${f.sizeMB ?? '–'}MB ${f.container ?? '–'} ${f.res ?? '–'} ${f.durationS ?? '–'}s`);
  lines.push(`     fps${fps ?? (f.fps ?? 'n/a')} src:${f.source ?? '–'}`);
  lines.push(`vid  ${vids.length} live /${probe?.totalVideos ?? 0}   url ${urlLive} live /${urlTotal}`);
  lines.push(`cvs  ${cvs.length} live /${probe?.totalCanvases ?? 0} (${(cvsPx / 1e6).toFixed(1)}MP)`);
  lines.push(`copy ${copyCount} file-sized blob (${copyMB.toFixed(0)}MB held)`);
  if (snap.errors.length) for (const e of snap.errors) lines.push(`err ${e}`);
  if (tail.length) {
    lines.push(tail.slice(0, half).join(' '));
    if (tail.length > half) lines.push(tail.slice(half).join(' '));
  }

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', top: 4, left: 4, zIndex: 2147483647,
        background: 'rgb(var(--black-rgb) / 0.86)', color: '#ffd23f',
        font: '9px/1.35 ui-monospace, "SF Mono", monospace',
        padding: '6px 8px', borderRadius: 3, pointerEvents: 'none',
        whiteSpace: 'pre', letterSpacing: 0, maxWidth: '96vw',
      }}
    >
      {lines.slice(0, 14).join('\n')}
    </div>
  );
}
