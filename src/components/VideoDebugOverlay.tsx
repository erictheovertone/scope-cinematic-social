'use client';

// ── VideoDebugOverlay — Brief V1/V1e on-device video-path trace ───────────────
// Inert unless the video trace is on (?debug=video OR the 5-tap toggle). Full-width
// (12px gutters), below the status bar, 11px mono, every line wraps, pointer-events
// none (except the ⌃ collapse tab). The crumb trail scrolls inside its own box once it
// outgrows ~40% of the screen, newest crumb always visible. Byte-inert when off: no
// probes, no listeners, no store writes — all gate on isVideoDebug().

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isVideoDebug, VIDEO_DEBUG_CHANGE_EVT } from '@/lib/debugFlags';
import {
  subscribeVideoDebug,
  getVideoDebugState,
  readReloadCrumb,
  vdbgInstallProbes,
  vdbgLiveCounts,
  vdbgError,
  installCrashBreadcrumb,
  readLastError,
  type LastError,
} from '@/lib/videoDebug';

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';

export default function VideoDebugOverlay() {
  const [on, setOn] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [reloadStep, setReloadStep] = useState<string | null>(null);
  const [lastError, setLastError] = useState<LastError | null>(null);
  const [, setTick] = useState(0);
  const trailRef = useRef<HTMLDivElement>(null);

  const snap = useSyncExternalStore(subscribeVideoDebug, getVideoDebugState, getVideoDebugState);

  // Brief P0 — ALWAYS-ON (even with the overlay off): record the last crash so it
  // survives the reload and names itself. Must run regardless of `on`.
  useEffect(() => { installCrashBreadcrumb(); }, []);

  // On/off sync — the 5-tap toggle fires VIDEO_DEBUG_CHANGE_EVT; ?debug=video is read
  // on mount. Re-check on the toggle event + cross-tab storage changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setOn(isVideoDebug());
    sync();
    window.addEventListener(VIDEO_DEBUG_CHANGE_EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(VIDEO_DEBUG_CHANGE_EVT, sync); window.removeEventListener('storage', sync); };
  }, []);

  // Probes + listeners + dump hook installed ONLY while on.
  useEffect(() => {
    if (!on || typeof window === 'undefined') return;
    setReloadStep(readReloadCrumb()); // crash line from a previous (killed) page
    setLastError(readLastError());    // P0 — the last global crash (any route), if any
    vdbgInstallProbes();
    const onErr = (e: ErrorEvent) => vdbgError(`${e.message}`.slice(0, 80));
    const onRej = (e: PromiseRejectionEvent) => vdbgError(`unhandled: ${String(e.reason?.message ?? e.reason).slice(0, 70)}`);
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    const id = window.setInterval(() => { setTick((t) => t + 1); setLastError(readLastError()); }, 500); // live counters + fresh crash record
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
  }, [on]);

  // Keep the newest crumb visible (pointer-events:none → the user can't scroll it).
  useEffect(() => { const el = trailRef.current; if (el) el.scrollTop = el.scrollHeight; });

  if (!on) return null;

  const r = vdbgLiveCounts();
  const f = snap.file;
  const nav = typeof window !== 'undefined' ? window.location.pathname : '';
  const lastCrumb = snap.crumbs.length ? snap.crumbs[snap.crumbs.length - 1] : null;

  const wrap: React.CSSProperties = {
    position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 4px)', left: 12, right: 12,
    zIndex: 2147483647, pointerEvents: 'none',
    font: '11px/1.4 ui-monospace, "SF Mono", monospace', color: '#ffd23f',
  };
  const box: React.CSSProperties = {
    background: 'rgb(var(--black-rgb) / 0.86)', borderRadius: 4, padding: '6px 26px 6px 8px',
    position: 'relative', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere',
  };
  const tab: React.CSSProperties = {
    position: 'absolute', top: 2, right: 2, width: 22, height: 22, pointerEvents: 'auto',
    background: 'rgb(var(--black-rgb) / 0.5)', border: 'none', borderRadius: 3, color: '#ffd23f',
    font: '13px/1 ui-monospace, monospace', cursor: 'pointer', padding: 0,
  };

  if (collapsed) {
    return (
      <div aria-hidden style={wrap}>
        <div style={box}>
          <button style={tab} onClick={() => setCollapsed(false)} aria-label="expand">⌄</button>
          {`video ${lastCrumb ? `${lastCrumb.step}+${lastCrumb.elapsed.toFixed(1)}·v${lastCrumb.v} gl:${lastCrumb.g}` : `idle·v${r.videosLive} gl:${r.glLive}`}`}
        </div>
      </div>
    );
  }

  const header: string[] = [];
  if (reloadStep) header.push(`⚠ LAST STEP BEFORE RELOAD: ${reloadStep}`);
  if (lastError) {
    const ago = Math.max(0, Math.round((Date.now() - lastError.ts) / 1000));
    header.push(`⚠ LAST ERROR BEFORE RELOAD (${ago}s ago @${lastError.route}): ${lastError.msg}`);
    const frame = lastError.stack?.split('\n').map((l) => l.trim()).find((l) => /\.(t|j)sx?|at |chunk/.test(l));
    if (frame) header.push(`   ↳ ${frame.slice(0, 160)}`);
  }
  header.push(`?debug=video ${BUILD_SHA} @${nav}`);
  header.push(`file ${f.sizeMB ?? '–'}MB ${f.container ?? '–'} ${f.res ?? '–'} ${f.durationS ?? '–'}s  fps${f.fps ?? 'n/a'}`);
  header.push(`vid ${r.videosLive} live/${r.videosTotal}  gl ${r.glLive} live/${r.glTotal}  url ${r.urlsLive}/${r.urlsTotal}  cvs ${r.canvasesLive}/${r.canvasesTotal} ${r.canvasMP.toFixed(1)}MP  copy ${r.bigBlobCount}×(${r.bigBlobMB.toFixed(0)}MB)`);
  for (const e of snap.errors) header.push(`err ${e}`);

  const crumbLines = snap.crumbs.map((c) => `${c.step}+${c.elapsed.toFixed(1)}·v${c.v} gl:${c.g}${c.detail ? `(${c.detail})` : ''}`);

  return (
    <div aria-hidden style={wrap}>
      <div style={box}>
        <button style={tab} onClick={() => setCollapsed(true)} aria-label="collapse">⌃</button>
        {header.join('\n')}
        {crumbLines.length > 0 && (
          <div ref={trailRef} style={{ maxHeight: '40vh', overflowY: 'auto', marginTop: 4, borderTop: '1px solid rgb(var(--ink-rgb) / 0.2)', paddingTop: 3 }}>
            {crumbLines.join('\n')}
          </div>
        )}
      </div>
    </div>
  );
}
