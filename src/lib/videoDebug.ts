// ── videoDebug — ?debug=video breadcrumb + resource trace (Brief V1) ──────────
// DEBUG-ONLY. Every exported fn is a no-op unless isVideoDebug() is true, so with
// the flag OFF this module touches NOTHING in the video path (zero behaviour
// change — the V1 landmine). It is a passive recorder: the create flow calls
// vdbg()/vdbgFile() at each step; the VideoDebugOverlay installs the resource
// probes (object-URL / <video> / <canvas> counters) and renders the panel.
//
// Crash detection (the whole point): the breadcrumb trail is mirrored to
// sessionStorage on every step with clean:false. A real navigation out of the
// flow calls vdbgMarkNav() → clean:true. iOS kills a tab silently under video
// decode pressure WITHOUT firing unload, so after such a kill the stored trail
// is still clean:false — the overlay reads it on the next load and prints
// "LAST STEP BEFORE RELOAD: <step>".

import { isVideoDebug } from './debugFlags';

const TRAIL_KEY = 'scope:vdbg-trail';
const MAX_CRUMBS = 48;
const MAX_ERRORS = 3;

export type Crumb = { t: number; elapsed: number; step: string; detail?: string };

type State = {
  startT: number;
  crumbs: Crumb[];
  errors: string[];
  file: Record<string, string | number>;
};

const state: State = { startT: 0, crumbs: [], errors: [], file: {} };
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

/** Subscribe (useSyncExternalStore). Returns an unsubscribe fn. */
export function subscribeVideoDebug(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export function getVideoDebugState(): State { return state; }

/** Record one pipeline step. No-op unless ?debug=video. */
export function vdbg(step: string, detail?: string): void {
  if (!isVideoDebug()) return;
  const now = Date.now();
  if (!state.startT) state.startT = now;
  state.crumbs.push({ t: now, elapsed: (now - state.startT) / 1000, step, detail });
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
    // Consume it either way so the line prints once per reload.
    sessionStorage.removeItem(TRAIL_KEY);
    if (j && j.clean === false && typeof j.last === 'string') return j.last;
  } catch { /* ignore */ }
  return null;
}
