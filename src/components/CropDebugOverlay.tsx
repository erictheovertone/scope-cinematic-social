'use client';
// ── CropDebugOverlay — Brief C1a §0 ───────────────────────────────────────────
// Renders the captured [crop] open / [crop] next lines ON SCREEN (Eric screenshots them in the
// iOS PWA where the console isn't reachable). Same gate + change-event as ViewportDebug. Fixed,
// top-anchored, wraps; z above the crop modal. Inert unless ?debug=crop / the persisted flag.

import { useEffect, useState } from 'react';
import { cropDebugOn, getCropTrace, CROP_DEBUG_EVT } from '@/lib/cropDebug';

export default function CropDebugOverlay() {
  const [, setTick] = useState(0);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => { setOn(cropDebugOn()); setTick((t) => t + 1); };
    sync();
    window.addEventListener(CROP_DEBUG_EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(CROP_DEBUG_EVT, sync); window.removeEventListener('storage', sync); };
  }, []);

  if (!on) return null;
  const lines = getCropTrace();

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', top: 'calc(4px + env(safe-area-inset-top, 0px))', left: 4, right: 4,
        zIndex: 2147483647,
        background: 'rgb(var(--black-rgb) / 0.9)', color: '#39ff88',
        font: '9px/1.4 ui-monospace, "SF Mono", monospace',
        padding: '6px 8px', borderRadius: 3, pointerEvents: 'none',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', letterSpacing: 0,
      }}
    >
      {lines.length ? lines.join('\n') : '[crop] waiting — open the cropper…'}
    </div>
  );
}
