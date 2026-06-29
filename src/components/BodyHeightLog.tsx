'use client';

// TEMP — decisive viewport diagnostic for the standalone short-window bug.
// body===innerHeight on both phones (797/793) → the WINDOW is short, not the body.
// This readout pins down WHY: is black-translucent live (envTop≈47/59) or inert (envTop≈0)?
// Strip this file + its <BodyHeightLog/> mount in Providers once root-caused.

import { useEffect, useRef, useState } from 'react';

export default function BodyHeightLog() {
  const [t, setT] = useState('measuring…');
  const topRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const px = (n: number) => Math.round(n);
    const m = () => {
      const body = px(parseFloat(getComputedStyle(document.body).height));
      const html = document.documentElement.clientHeight;
      const inner = window.innerHeight;
      const scr = window.screen.height;
      const vv = window.visualViewport ? px(window.visualViewport.height) : 0;
      const envTop = topRef.current ? px(topRef.current.getBoundingClientRect().height) : -1;
      const envBot = botRef.current ? px(botRef.current.getBoundingClientRect().height) : -1;
      const standalone =
        (window.matchMedia('(display-mode: standalone)').matches ? 'S' : '-') +
        // iOS-only legacy flag
        ((navigator as unknown as { standalone?: boolean }).standalone ? 'i' : '-');
      setT(
        `body=${body} html=${html} inner=${inner} vv=${vv} screen=${scr}\n` +
        `envTop=${envTop} envBot=${envBot} mode=${standalone}`
      );
    };
    m();
    const id = setTimeout(m, 400); // standalone chrome can settle late
    window.addEventListener('resize', m);
    window.visualViewport?.addEventListener('resize', m);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', m);
      window.visualViewport?.removeEventListener('resize', m);
    };
  }, []);

  return (
    <>
      {/* env() probes — measured, not displayed. height = the real inset value. */}
      <div ref={topRef} style={{ position: 'fixed', top: 0, left: -9999, width: 1, height: 'env(safe-area-inset-top, 0px)', pointerEvents: 'none' }} />
      <div ref={botRef} style={{ position: 'fixed', top: 0, left: -9999, width: 1, height: 'env(safe-area-inset-bottom, 0px)', pointerEvents: 'none' }} />
      <div
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
          left: 8,
          zIndex: 99999,
          background: 'rgba(0,0,0,0.9)',
          color: '#0f0',
          font: '11px monospace',
          whiteSpace: 'pre',
          lineHeight: 1.35,
          padding: '4px 8px',
          border: '1px solid #0f0',
          pointerEvents: 'none',
        }}
      >
        {t}
      </div>
    </>
  );
}
