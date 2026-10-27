// ── debugFlags — URL/gesture-gated production diagnostics (Brief P2c / V1e) ───
// Production is silent by default. Turn the video trace on with ?debug=video (works in
// Safari, persists for the tab via sessionStorage) OR the 5-tap gesture on the Discover
// title (persists across PWA relaunch via localStorage — V1e). Byte-inert when off: the
// probes, listeners and store writes all gate on isVideoDebug().

const KEY = 'scope:debug-video';        // sessionStorage — ?debug=video for this tab
const LS_KEY = 'scope.debug.video';     // localStorage — the 5-tap toggle (survives PWA relaunch)
const CHANGE_EVT = 'scope:debug-video-change';
export const VIDEO_DEBUG_CHANGE_EVT = CHANGE_EVT;

/** True when the video trace is on (query flag, tab session, or the persisted toggle). */
export function isVideoDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const s = window.location.search || '';
    if (/(?:^|[?&])debug=video=off(?:&|$)/.test(s)) {
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
      return false;
    }
    if (/(?:^|[?&])debug=video(?:&|$)/.test(s)) { try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ } return true; }
    if (sessionStorage.getItem(KEY) === '1') return true;
    try { if (localStorage.getItem(LS_KEY) === '1') return true; } catch { /* ignore */ }
    return false;
  } catch {
    return false;
  }
}

/** V1e — 5-tap gesture toggle. Flips the persisted flag; a 6th 5-tap turns it back off. */
export function toggleVideoDebug(): void {
  try {
    const cur = localStorage.getItem(LS_KEY) === '1';
    if (cur) localStorage.removeItem(LS_KEY); else localStorage.setItem(LS_KEY, '1');
  } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVT)); } catch { /* ignore */ }
}
