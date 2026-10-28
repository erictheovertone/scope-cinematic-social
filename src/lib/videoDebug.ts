// ── videoDebug — ?debug=video breadcrumb + resource trace (Brief V1 / V1b) ────
// DEBUG-ONLY. Every exported fn is a no-op unless isVideoDebug() is true, so with
// the flag OFF this module touches NOTHING in the video path (zero behaviour
// change — the V1 landmine). It is a passive recorder: the create flow calls
// vdbg()/vdbgFile() at each step; the resource probes (object-URL / <video> /
// <canvas> counters) are installed here, gated, as pure pass-throughs; the
// VideoDebugOverlay renders the panel.
//
// Crash detection: the breadcrumb trail is mirrored to sessionStorage on every
// step with clean:false. A real navigation out of the flow calls vdbgMarkNav() →
// clean:true. iOS kills a tab silently under video-decode pressure WITHOUT firing
// unload, so after such a kill the stored trail is still clean:false — the overlay
// reads it on the next load and prints "LAST STEP BEFORE RELOAD: <step>".
//
// V1b: each crumb is stamped with the LIVE <video> count (the decoder count) at
// that moment, so Eric's screenshot shows the wait by name AND how many decoders
// were alive when it stalled.
//
// V3 §7: each crumb also carries the live WebGL-context count (g → `gl:<n>`), counted by a gated
// pass-through on HTMLCanvasElement.prototype.getContext; a context stops counting once lost.

import { isVideoDebug } from './debugFlags';

const TRAIL_KEY = 'scope:vdbg-trail';
const MAX_CRUMBS = 48;
const MAX_ERRORS = 3;

export type Crumb = { t: number; elapsed: number; step: string; detail?: string; v: number; g: number };

type State = {
  startT: number;
  crumbs: Crumb[];
  errors: string[];
  file: Record<string, string | number>;
};

const state: State = { startT: 0, crumbs: [], errors: [], file: {} };
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

// ── Global crash breadcrumb (Brief P0) ────────────────────────────────────────
// The ONE always-on part of this module. The rest no-ops unless ?debug=video, but a
// crash that kills the tab happens with the overlay OFF — so this records the LAST
// error + route to localStorage unconditionally, and the overlay (once enabled) shows
// "LAST ERROR BEFORE RELOAD" on ANY route. So the next crash names itself. It is
// passive (addEventListener, never replaces window.onerror), never preventDefault's
// (normal error handling still runs), never throws, and writes a tiny truncated record.
const LAST_ERROR_KEY = 'scope.debug.lastError';

export type LastError = { msg: string; src?: string; line?: number; col?: number; stack?: string; route: string; ts: number };

let crashInstalled = false;

/** Install the always-on crash recorder. Idempotent; safe to call on every mount. */
export function installCrashBreadcrumb(): void {
  if (crashInstalled || typeof window === 'undefined') return;
  crashInstalled = true;
  const write = (msg: string, extra: Partial<LastError>) => {
    try {
      const rec: LastError = { msg: String(msg).slice(0, 300), route: window.location?.pathname ?? '', ts: Date.now(), ...extra };
      if (rec.stack) rec.stack = rec.stack.slice(0, 800);
      localStorage.setItem(LAST_ERROR_KEY, JSON.stringify(rec));
    } catch { /* storage disabled / quota — best-effort */ }
  };
  try {
    window.addEventListener('error', (e: ErrorEvent) => {
      write(e.message || 'error', { src: e.filename, line: e.lineno, col: e.colno, stack: (e.error as Error | undefined)?.stack });
    });
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
      const r = e.reason as (Error & { message?: string }) | undefined;
      write(`unhandledrejection: ${r?.message ?? String(r)}`, { stack: r?.stack });
    });
  } catch { /* listeners unavailable — ignore */ }
}

/** The last recorded crash (any route), or null. */
export function readLastError(): LastError | null {
  try { const s = localStorage.getItem(LAST_ERROR_KEY); return s ? (JSON.parse(s) as LastError) : null; }
  catch { return null; }
}

/** Clear the recorded crash (after it's been read/acted on). */
export function clearLastError(): void {
  try { localStorage.removeItem(LAST_ERROR_KEY); } catch { /* ignore */ }
}

// ── Resource probe (installed once, gated) ────────────────────────────────────
type Probe = {
  liveUrls: Set<string>;
  totalUrls: number;
  bigBlobs: Map<string, number>; // objURL → byte size (≥1MB sources = "file copies")
  videos: Set<WeakRef<HTMLVideoElement>>;
  totalVideos: number;
  canvases: Set<WeakRef<HTMLCanvasElement>>;
  totalCanvases: number;
  gls: Set<WeakRef<WebGLRenderingContext>>;
  totalGls: number;
};
let probe: Probe | null = null;

/** Install the pass-through probes. Idempotent; no-op unless ?debug=video. */
export function vdbgInstallProbes(): void {
  if (probe || typeof window === 'undefined' || !isVideoDebug()) return;
  const p: Probe = {
    liveUrls: new Set(), totalUrls: 0, bigBlobs: new Map(),
    videos: new Set(), totalVideos: 0, canvases: new Set(), totalCanvases: 0,
    gls: new Set(), totalGls: 0,
  };
  probe = p;
  try {
    const origCreate = URL.createObjectURL.bind(URL);
    const origRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = ((obj: Blob | MediaSource) => {
      const url = origCreate(obj as Blob);
      try {
        p.liveUrls.add(url); p.totalUrls++;
        const size = (obj as Blob)?.size ?? 0;
        if (size >= 1024 * 1024) p.bigBlobs.set(url, size);
      } catch { /* ignore */ }
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => {
      try { p.liveUrls.delete(url); p.bigBlobs.delete(url); } catch { /* ignore */ }
      return origRevoke(url);
    }) as typeof URL.revokeObjectURL;

    const origCE = document.createElement.bind(document);
    document.createElement = ((tag: string, opts?: ElementCreationOptions) => {
      const el = origCE(tag as 'div', opts);
      try {
        const t = String(tag).toLowerCase();
        if (t === 'video') { p.videos.add(new WeakRef(el as unknown as HTMLVideoElement)); p.totalVideos++; }
        else if (t === 'canvas') { p.canvases.add(new WeakRef(el as unknown as HTMLCanvasElement)); p.totalCanvases++; }
      } catch { /* ignore */ }
      return el;
    }) as typeof document.createElement;

    // V3 §7 — WebGL contexts (gl-react Surfaces + the photo bake). getContext returns the SAME
    // context on repeat calls, so de-dupe by identity.
    const origGC = HTMLCanvasElement.prototype.getContext;
    const seen = new WeakSet<object>();
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
      const ctx = (origGC as (t: string, a?: unknown) => RenderingContext | null).call(this, type, attrs);
      try {
        if (ctx && /webgl/i.test(type) && !seen.has(ctx)) { seen.add(ctx); p.gls.add(new WeakRef(ctx as WebGLRenderingContext)); p.totalGls++; }
      } catch { /* ignore */ }
      return ctx;
    } as typeof HTMLCanvasElement.prototype.getContext;
  } catch { /* frozen globals — counters stay at 0 */ }
}

// A video counts as a live DECODER while it is actively loading or has decoded at
// least metadata — networkState LOADING (2), or readyState ≥ HAVE_METADATA (1). A
// torn-down one-shot (removeAttribute('src') + load() → networkState EMPTY 0,
// readyState 0) has released its decoder even though the JS object lingers until GC,
// so it is NOT counted. This reflects real decoder pressure — including a crop
// preview stuck LOADING (networkState 2), the exact device starvation.
function liveVideoEls(): HTMLVideoElement[] {
  if (!probe) return [];
  const out: HTMLVideoElement[] = [];
  for (const ref of probe.videos) {
    const v = ref.deref();
    if (!v) { probe.videos.delete(ref); continue; }
    if (v.networkState === 2 /* LOADING */ || v.readyState >= 1 /* HAVE_METADATA+ */) out.push(v);
  }
  return out;
}
function liveCanvasEls(): HTMLCanvasElement[] {
  if (!probe) return [];
  const out: HTMLCanvasElement[] = [];
  for (const ref of probe.canvases) { const c = ref.deref(); if (c) out.push(c); else probe.canvases.delete(ref); }
  return out;
}

/** The decoder count = live <video> elements right now (detached ones included). */
export function vdbgLiveVideoCount(): number { return liveVideoEls().length; }

/** V3 §7 — live WebGL contexts (not lost, not collected). */
export function vdbgLiveGlCount(): number {
  if (!probe) return 0;
  let n = 0;
  for (const ref of probe.gls) {
    const g = ref.deref();
    if (!g) { probe.gls.delete(ref); continue; }
    if (!g.isContextLost()) n++;
  }
  return n;
}

/** Full live resource snapshot (overlay + harness dump). */
export function vdbgLiveCounts() {
  const vids = liveVideoEls();
  const canv = liveCanvasEls();
  return {
    videosLive: vids.length, videosTotal: probe?.totalVideos ?? 0,
    urlsLive: probe?.liveUrls.size ?? 0, urlsTotal: probe?.totalUrls ?? 0,
    canvasesLive: canv.length, canvasesTotal: probe?.totalCanvases ?? 0,
    canvasMP: canv.reduce((n, c) => n + (c.width || 0) * (c.height || 0), 0) / 1e6,
    glLive: vdbgLiveGlCount(), glTotal: probe?.totalGls ?? 0,
    bigBlobCount: probe?.bigBlobs.size ?? 0,
    bigBlobMB: probe ? [...probe.bigBlobs.values()].reduce((n, b) => n + b, 0) / (1024 * 1024) : 0,
  };
}

/** Subscribe (useSyncExternalStore). Returns an unsubscribe fn. */
export function subscribeVideoDebug(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export function getVideoDebugState(): State { return state; }

/** Record one pipeline step (stamped with the live decoder count). No-op unless on. */
export function vdbg(step: string, detail?: string): void {
  if (!isVideoDebug()) return;
  const now = Date.now();
  if (!state.startT) state.startT = now;
  state.crumbs.push({ t: now, elapsed: (now - state.startT) / 1000, step, detail, v: vdbgLiveVideoCount(), g: vdbgLiveGlCount() });
  if (state.crumbs.length > MAX_CRUMBS) state.crumbs.shift();
  persistTrail(step, false);
  emit();
}

/** Merge file facts (size/container/resolution/duration/fps/source). No-op unless on. */
export function vdbgFile(facts: Record<string, string | number>): void {
  if (!isVideoDebug()) return;
  Object.assign(state.file, facts);
  emit();
}

/** Record an error line (overlay also captures window.onerror itself). */
export function vdbgError(msg: string): void {
  if (!isVideoDebug()) return;
  state.errors.push(msg);
  while (state.errors.length > MAX_ERRORS) state.errors.shift();
  emit();
}

/** Mark a NORMAL navigation out of the flow — the trail ended cleanly (no kill). */
export function vdbgMarkNav(where: string): void {
  if (!isVideoDebug()) return;
  persistTrail(`nav:${where}`, true);
}

/** Reset the in-memory trace for a fresh pick (keeps the sessionStorage trail). */
export function vdbgReset(): void {
  if (!isVideoDebug()) return;
  state.startT = 0;
  state.crumbs = [];
  state.errors = [];
  state.file = {};
  emit();
}

function persistTrail(last: string, clean: boolean): void {
  try {
    sessionStorage.setItem(TRAIL_KEY, JSON.stringify({ clean, last, at: Date.now() }));
  } catch { /* ignore — private mode / disabled storage */ }
}

/**
 * Read the crash breadcrumb left by a PREVIOUS page that never navigated away
 * (an iOS silent tab kill). Returns the last step, or null if the last recorded
 * trail ended in a clean navigation. Clears the flag so the line shows once.
 */
export function readReloadCrumb(): string | null {
  try {
    const raw = sessionStorage.getItem(TRAIL_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { clean?: boolean; last?: string };
    sessionStorage.removeItem(TRAIL_KEY); // consume so the line prints once per reload
    if (j && j.clean === false && typeof j.last === 'string') return j.last;
  } catch { /* ignore */ }
  return null;
}
