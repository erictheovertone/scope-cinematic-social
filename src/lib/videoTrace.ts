// ── videoTrace — HOME-4 phone-to-server video trace ──────────────────────────────────────────────
// Every dlog() line + the HOME-4 crumbs land in a ring buffer with ms timestamps; while ?debug=video
// is on, the buffer is POSTed to /api/funnel as event 'vdbg' every 3s and flushed on pagehide, as the
// signed-in member. BYTE-INERT when debug is off: pushTrace returns before touching the buffer, and
// the shipper is only started by the overlay when debug is on. No tokens / full URLs in the lines.
import { isVideoDebug } from '@/lib/debugFlags';
import { getAccessToken } from '@privy-io/react-auth';

const SESSION_CAP = 3000; // lines per session (hard stop — never unbounded)
const BATCH_CAP = 200;    // lines per POST
const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';

let buffer: string[] = [];
let sessionCount = 0;
let sentCount = 0;
let t0 = 0;
let timer: number | null = null;
let lastToken: string | null = null; // cached for the synchronous pagehide flush

/** Append one trace line (ms since start + the line). No-op unless video debug is on. */
export function pushTrace(line: string): void {
  if (!isVideoDebug() || sessionCount >= SESSION_CAP) return;
  if (!t0) t0 = Date.now();
  buffer.push(`${Date.now() - t0} ${line}`);
  sessionCount++;
}

async function flush(keepalive = false): Promise<void> {
  if (!buffer.length) return;
  const lines = buffer.splice(0, BATCH_CAP);
  const body = JSON.stringify({ event: 'vdbg', props: { build: BUILD, route: typeof location !== 'undefined' ? location.pathname : '', ua: typeof navigator !== 'undefined' ? navigator.userAgent : '', lines } });
  try {
    let token = lastToken;
    if (!keepalive) { token = await getAccessToken(); lastToken = token; }
    if (!token) { buffer.unshift(...lines); return; } // keep the lines for the next cycle
    await fetch('/api/funnel', { method: 'POST', keepalive, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body });
    sentCount += lines.length;
  } catch { /* drop this batch; instrumentation must never throw into playback */ }
}

/** Start the 3s shipper + pagehide flush (idempotent). Called by the overlay when debug turns on. */
export function startTrace(): void {
  if (timer != null || typeof window === 'undefined') return;
  if (!t0) t0 = Date.now();
  timer = window.setInterval(() => { void flush(false); }, 3000);
  // fetch(keepalive) is sendBeacon with auth headers — survives pagehide and carries the Bearer token.
  window.addEventListener('pagehide', () => { void flush(true); });
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(true); });
  // HOME-4 — webgl context loss/restore from ANY canvas (captures the graded pipeline's canvas without
  // touching the locked gl-react Pipeline). Capture phase since the events don't bubble.
  window.addEventListener('webglcontextlost', () => pushTrace('webglcontextlost'), true);
  window.addEventListener('webglcontextrestored', () => pushTrace('webglcontextrestored'), true);
}

export function traceSentCount(): number { return sentCount; }
