'use client';

// TEMP DEBUG — on-screen bake/budget diagnostics overlay (Web Inspector not
// cooperating on-device). Strip this whole file + its <DebugOverlay/> mount in
// Providers + every window.__dbg?.() call in bakeLook.ts / renderBudget.ts in one
// pass once the publish crash is diagnosed.

import { useEffect } from 'react';

declare global {
  interface Window {
    __dbg?: (msg: string) => void;
  }
}

export default function DebugOverlay() {
  useEffect(() => {
    window.__dbg = (msg: string) => {
      const el = document.getElementById('__dbg');
      if (el) {
        el.textContent = (
          new Date().toISOString().slice(11, 19) + ' ' + msg + '\n' + (el.textContent || '')
        ).slice(0, 2000);
      }
    };
    return () => { try { delete window.__dbg; } catch { /* noop */ } };
  }, []);

  return (
    <div
      id="__dbg"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.85)', color: '#0f0', font: '10px monospace',
        whiteSpace: 'pre-wrap', maxHeight: '40vh', overflow: 'auto',
        pointerEvents: 'none', padding: '4px',
      }}
    />
  );
}
