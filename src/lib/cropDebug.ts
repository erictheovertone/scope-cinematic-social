'use client';
// ── cropDebug — Brief C1/C1a: on-screen + console crop trace ───────────────────
// Gated by ?debug=crop in the URL OR a persisted localStorage flag (same mechanism as
// ViewportDebug, so it survives an iOS-standalone relaunch where the query string can't be
// typed). CropTool pushes [crop] open / [crop] next lines here; CropDebugOverlay renders the
// most recent few on screen (Eric screenshots them), and each is also console.log'd.

const LS_KEY = 'scope:debug-crop';
const CHANGE_EVT = 'scope:debug-crop-change';
const MAX = 8;

let lines: string[] = [];

export function cropDebugOn(): boolean {
  if (typeof window === 'undefined') return false;
  if (/(?:^|[?&])debug=crop(?:&|$)/.test(window.location.search)) return true;
  try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
}

/** 5-tap toggle target (mirrors toggleViewportDebug) — persists so the PWA can enable it. */
export function toggleCropDebug() {
  try {
    if (localStorage.getItem(LS_KEY) === '1') localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, '1');
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(CHANGE_EVT));
}

export function pushCropTrace(line: string) {
  if (!cropDebugOn()) return;
  // eslint-disable-next-line no-console
  console.log(line);
  lines = [...lines, line].slice(-MAX);
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVT)); } catch { /* ignore */ }
}

export function getCropTrace(): string[] { return lines; }
export function clearCropTrace() { lines = []; try { window.dispatchEvent(new CustomEvent(CHANGE_EVT)); } catch { /* ignore */ } }
export const CROP_DEBUG_EVT = CHANGE_EVT;
