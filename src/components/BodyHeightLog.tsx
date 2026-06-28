'use client';

// TEMP — one-line verification for the standalone short-container fix. body computed
// height must now read ~844 (= screen.height), not 797. That number IS the test.
// Strip this file + its <BodyHeightLog/> mount in Providers once confirmed.

import { useEffect, useState } from 'react';

export default function BodyHeightLog() {
  const [t, setT] = useState('measuring…');
  useEffect(() => {
    const m = () =>
      setT(`body=${getComputedStyle(document.body).height}  screen=${screen.height}  inner=${window.innerHeight}`);
    m();
    const id = setTimeout(m, 400); // standalone chrome can settle late
    window.addEventListener('resize', m);
    return () => { clearTimeout(id); window.removeEventListener('resize', m); };
  }, []);
  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
        left: 8,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.9)',
        color: '#0f0',
        font: '11px monospace',
        padding: '4px 8px',
        border: '1px solid #0f0',
        pointerEvents: 'none',
      }}
    >
      {t}
    </div>
  );
}
