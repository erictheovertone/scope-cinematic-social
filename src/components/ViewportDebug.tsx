'use client';

// ── ViewportDebug — Brief W2-1b temporary on-device viewport readout ──────────
// Gated by ?debug=viewport in the URL (inert otherwise). Fixed top-left, tiny mono.
// Names the bottom-bar culprit from the RUNNING values:
//   innerHeight 797 + dvh true + shell bottom == innerHeight → the webview itself is
//     small (baked meta/manifest) → PWA reinstall path.
//   innerHeight 844 + shell bottom 797 → a layout link still clamps to the old basis
//     → fix THAT named element (bar delta > 0).
//   build != the just-shipped commit → delivery problem (deploy/cache), not CSS.
// Reads window.location.search directly (no useSearchParams → no Suspense need).

import { useEffect, useState } from 'react';

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';

function h(el: Element | null): number | null {
  if (!el) return null;
  const v = parseFloat(getComputedStyle(el).height);
  return Number.isFinite(v) ? Math.round(v) : null;
}

export default function ViewportDebug() {
  const [on, setOn] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!/(?:^|[?&])debug=viewport(?:&|$)/.test(window.location.search)) return;
    setOn(true);
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('resize', bump);
    window.visualViewport?.addEventListener('resize', bump);
    window.visualViewport?.addEventListener('scroll', bump);
    const id = window.setInterval(bump, 500); // catch URL-bar show/hide + late layout
    return () => {
      window.removeEventListener('resize', bump);
      window.visualViewport?.removeEventListener('resize', bump);
      window.visualViewport?.removeEventListener('scroll', bump);
      window.clearInterval(id);
    };
  }, []);

  if (!on) return null;

  const ih = window.innerHeight;
  const shellEl = document.querySelector('.screen-min') || document.querySelector('.app-shell');
  const shellBottom = shellEl ? Math.round(shellEl.getBoundingClientRect().bottom) : null;
  const barDelta = shellBottom != null ? ih - shellBottom : null;
  const dvhOk = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('height', '100dvh');

  const rows: [string, string | number | null][] = [
    ['build', BUILD_SHA],
    ['innerHeight', ih],
    ['docEl.clientH', document.documentElement.clientHeight],
    ['visualVP.h', window.visualViewport ? Math.round(window.visualViewport.height) : 'n/a'],
    ['screen.h', window.screen?.height ?? 'n/a'],
    ['html h', h(document.documentElement)],
    ['body h', h(document.body)],
    ['.app-shell h', h(document.querySelector('.app-shell'))],
    ['.screen-min h', h(document.querySelector('.screen-min'))],
    ['shell rect.bottom', shellBottom],
    ['BAR delta ih−btm', barDelta],
    ['100dvh supported', String(dvhOk)],
    ['standalone', String((window.navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true)],
  ];

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', top: 4, left: 4, zIndex: 2147483647,
        background: 'rgba(0,0,0,0.86)', color: '#39ff88',
        font: '9px/1.35 ui-monospace, "SF Mono", monospace',
        padding: '6px 8px', borderRadius: 3, pointerEvents: 'none',
        whiteSpace: 'pre', letterSpacing: 0,
      }}
    >
      {rows.map(([k, v]) => `${k.padEnd(17)} ${v}`).join('\n')}
    </div>
  );
}
