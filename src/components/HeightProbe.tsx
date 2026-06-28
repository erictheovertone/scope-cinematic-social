'use client';

// TEMP DEBUG — standalone-PWA short-container probe. Renders the viewport/body/html
// heights on-screen so we can SEE whether the root is shorter than the device screen
// (the cause of the untinted body-black bar below the footer in the PWA). Strip this
// file + its <HeightProbe/> mount in Providers once the numbers are read.

import { useEffect, useState } from 'react';

export default function HeightProbe() {
  const [lines, setLines] = useState<string[]>(['measuring…']);

  useEffect(() => {
    const measure = () => {
      const de = document.documentElement;
      const b = document.body;
      // Read the actual resolved env(safe-area-inset-bottom) in px.
      let insetBottom = 'n/a';
      try {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;bottom:0;left:0;height:env(safe-area-inset-bottom,0px);width:0;';
        document.body.appendChild(probe);
        insetBottom = `${Math.round(probe.getBoundingClientRect().height)}px`;
        probe.remove();
      } catch { /* noop */ }

      setLines([
        'HEIGHT PROBE (TEMP)',
        `screen.height          = ${screen.height}`,
        `window.innerHeight     = ${window.innerHeight}`,
        `outerHeight            = ${window.outerHeight}`,
        `docEl.clientHeight     = ${de.clientHeight}`,
        `visualViewport.height  = ${window.visualViewport ? Math.round(window.visualViewport.height) : 'n/a'}`,
        `body computed height   = ${getComputedStyle(b).height}`,
        `html computed height   = ${getComputedStyle(de).height}`,
        `env(inset-bottom)      = ${insetBottom}`,
        `screen − innerHeight   = ${screen.height - window.innerHeight}`,
      ]);
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    // re-measure shortly after mount (standalone chrome can settle late)
    const t = setTimeout(measure, 400);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 54px)',
        left: 8,
        right: 8,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        color: '#0ff',
        font: '11px/1.5 monospace',
        whiteSpace: 'pre-wrap',
        padding: '8px 10px',
        border: '1px solid #0ff',
        pointerEvents: 'none',
      }}
    >
      {lines.join('\n')}
    </div>
  );
}
