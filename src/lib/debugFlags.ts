// ── debugFlags — URL-gated production diagnostics (Brief P2c) ─────────────────
// Same shape as ViewportDebug's ?debug=viewport: a URL flag that, once seen, PERSISTS for
// the tab session (sessionStorage), so it survives client navigations without being pinned
// to NODE_ENV. Production is silent by default; append ?debug=video to turn the video
// traces on. Clear it with ?debug=video=off (or just close the tab).

const KEY = 'scope:debug-video';

/** True when ?debug=video is (or has been, this session) present. Client-only; false on SSR. */
export function isVideoDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const s = window.location.search || '';
    if (/(?:^|[?&])debug=video=off(?:&|$)/.test(s)) { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } return false; }
    if (/(?:^|[?&])debug=video(?:&|$)/.test(s)) { try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ } return true; }
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
