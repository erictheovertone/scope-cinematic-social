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

import { isVideoDebug } from './debugFlags';

const TRAIL_KEY = 'scope:vdbg-trail';
const MAX_CRUMBS = 48;
const MAX_ERRORS = 3;

export type Crumb = { t: number; elapsed: number; step: string; detail?: string; v: number };

type State = {
  startT: number;
  crumbs: Crumb[];
  errors: string[];
  file: Record<string, string | number>;
};

const state: State = { startT: 0, crumbs: [], errors: [], file: {} };
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

// ── Resource probe (installed once, gated) ────────────────────────────────────
type Probe = {
  liveUrls: Set<string>;
  totalUrls: number;
  bigBlobs: Map<string, number>; // objURL → byte size (≥1MB sources = "file copies")
  videos: Set<WeakRef<HTMLVideoElement>>;
  totalVideos: number;
  canvases: Set<WeakRef<HTMLCanvasElement>>;
  totalCanvases: number;
};
let probe: Probe | null = null;

/** Install the pass-through probes. Idempotent; no-op unless ?debug=video. */
export function vdbgInstallProbes(): void {
  if (probe || typeof window === 'undefined' || !isVideoDebug()) return;
  const p: Probe = {
    liveUrls: new Set(), totalUrls: 0, bigBlobs: new Map(),
    videos: new Set(), totalVideos: 0, canvases: new Set(), totalCanvases: 0,
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

/** Full live resource snapshot (overlay + harness dump). */
export function vdbgLiveCounts() {
  const vids = liveVideoEls();
  const canv = liveCanvasEls();
  return {
    videosLive: vids.length, videosTotal: probe?.totalVideos ?? 0,
    urlsLive: probe?.liveUrls.size ?? 0, urlsTotal: probe?.totalUrls ?? 0,
    canvasesLive: canv.length, canvasesTotal: probe?.totalCanvases ?? 0,
    canvasMP: canv.reduce((n, c) => n + (c.width || 0) * (c.height || 0), 0) / 1e6,
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
  state.crumbs.push({ t: now, elapsed: (now - state.startT) / 1000, step, detail, v: vdbgLiveVideoCount() });
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
