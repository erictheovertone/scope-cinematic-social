'use client';

// ── VideoDebugOverlay — Brief V1 / V1b on-device video-path trace ─────────────
// Inert unless ?debug=video (isVideoDebug). Fixed top-left, tiny mono, ≤14 lines,
// pointer-events:none — screenshot-friendly. Shows, for the crop → EDIT & POST
// path: the file facts, a live breadcrumb trail (step · elapsed · live-decoder
// count), live resource counters (object URLs, <video> elements, <canvas> px, big
// in-memory blob copies), the last 3 errors, and — the point of the brief — a
// "LAST STEP BEFORE RELOAD" line recovered from sessionStorage after an iOS tab kill.
//
// All counters come from the debug-GATED pass-through probes in videoDebug.ts
// (installed only while ?debug=video is active), so production (flag off) is
// byte-identical.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { isVideoDebug } from '@/lib/debugFlags';
import {
  subscribeVideoDebug,
  getVideoDebugState,
  readReloadCrumb,
  vdbgInstallProbes,
  vdbgLiveCounts,
  vdbgError,
} from '@/lib/videoDebug';

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';

export default function VideoDebugOverlay() {
  const [on, setOn] = useState(false);
  const [reloadStep, setReloadStep] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const snap = useSyncExternalStore(subscribeVideoDebug, getVideoDebugState, getVideoDebugState);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const active = isVideoDebug();
    setOn(active);
    if (!active) return;
    setReloadStep(readReloadCrumb()); // crash line from a previous (killed) page
    vdbgInstallProbes();

    const onErr = (e: ErrorEvent) => vdbgError(`${e.message}`.slice(0, 80));
    const onRej = (e: PromiseRejectionEvent) => vdbgError(`unhandled: ${String(e.reason?.message ?? e.reason).slice(0, 70)}`);
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    const id = window.setInterval(() => setTick((t) => t + 1), 500); // live resource counters

    // Brief V1 §3 — test-only dump: the harness reads the trace + live resource
    // snapshot through this. Defined only while ?debug=video is active.
    (window as unknown as { __scopeVdbgDump?: () => unknown }).__scopeVdbgDump = () => {
      const s = getVideoDebugState();
      return { crumbs: s.crumbs, file: s.file, errors: s.errors, res: vdbgLiveCounts() };
    };

    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
      window.clearInterval(id);
      try { delete (window as unknown as { __scopeVdbgDump?: () => unknown }).__scopeVdbgDump; } catch { /* ignore */ }
    };
  }, []);

  if (!on) return null;

  const r = vdbgLiveCounts();
  const f = snap.file;
  const nav = typeof window !== 'undefined' ? window.location.pathname : '';

  // Compact breadcrumb tail (fit ≤14 lines): "step+elapsed·vN" tokens, newest last.
  const tail = snap.crumbs.slice(-10).map((c) => `${c.step}+${c.elapsed.toFixed(1)}·v${c.v}`);
  const half = Math.ceil(tail.length / 2);

  const lines: string[] = [];
  if (reloadStep) lines.push(`⚠ LAST STEP BEFORE RELOAD: ${reloadStep}`);
  lines.push(`?debug=video ${BUILD_SHA} @${nav}`);
  lines.push(`file ${f.sizeMB ?? '–'}MB ${f.container ?? '–'} ${f.res ?? '–'} ${f.durationS ?? '–'}s`);
  lines.push(`     fps${f.fps ?? 'n/a'} src:${f.source ?? '–'}`);
  lines.push(`vid  ${r.videosLive} live /${r.videosTotal}   url ${r.urlsLive} live /${r.urlsTotal}`);
  lines.push(`cvs  ${r.canvasesLive} live /${r.canvasesTotal} (${r.canvasMP.toFixed(1)}MP)`);
  lines.push(`copy ${r.bigBlobCount} file-sized blob (${r.bigBlobMB.toFixed(0)}MB held)`);
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
