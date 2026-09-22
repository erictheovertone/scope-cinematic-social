'use client';
// ── ThemeSync — Brief T1-4a ───────────────────────────────────────────────────
// App-wide 'system' tracker: when the stored preference is 'system', follow the OS
// prefers-color-scheme live (no reload). The pre-paint script in <head> already set the
// initial theme; this only keeps it in sync while the app is open. The listener is always
// mounted and no-ops unless the current preference is 'system', so a runtime toggle to/from
// system needs no re-subscription. useTheme()'s MutationObserver picks up applyTheme() → UI
// re-renders. Renders nothing.

import { useEffect } from 'react';
import { getStoredPref, applyTheme, systemTheme } from '@/lib/theme';

export default function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onSys = () => { if (getStoredPref() === 'system') applyTheme(mq.matches ? 'light' : 'dark'); };
    mq.addEventListener('change', onSys);
    if (getStoredPref() === 'system') applyTheme(systemTheme()); // reconcile once on mount
    return () => mq.removeEventListener('change', onSys);
  }, []);
  return null;
}
