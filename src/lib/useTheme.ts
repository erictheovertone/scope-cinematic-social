'use client';
// ── useTheme — Brief T1-3 ─────────────────────────────────────────────────────
// The current theme ('dark' | 'light'), read from <html data-theme> and kept in sync
// REACTIVELY (a MutationObserver on the attribute), so a Stage-4 runtime toggle swaps
// theme-aware assets without a reload. SSR-safe: 'dark' on the server / first paint (the
// default), then syncs on mount — no hydration mismatch (the attribute is applied before
// paint by the Stage-4 no-FOUC script).

import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

function read(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('dark'); // 'dark' on SSR/first paint → no mismatch
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setTheme(read());
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}
