'use client';
// ── AppearanceRow — Brief T1-4a §3 ────────────────────────────────────────────
// The ONE shared appearance control, rendered in BOTH Settings twins (mobile Preferences +
// DesktopSettings) — no fork. Dark · Light · System, built on the house LedgerCard. Selected
// state is the ink-opacity ladder (full ink vs 40%) — no accent colour, no red. Switching is
// instant (setThemePref writes localStorage + applies data-theme, no reload). Self-gating:
// renders nothing unless the resolved username is allowlisted (NEXT_PUBLIC_THEME_PREVIEW_USERNAMES).

import { useEffect, useState } from 'react';
import { LedgerCard } from '@/components/Ledger';
import { getStoredPref, setThemePref, themePreviewAllowed, type ThemePref } from '@/lib/theme';

const MONO: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const OPTIONS: { pref: ThemePref; label: string }[] = [
  { pref: 'dark', label: 'Dark' },
  { pref: 'light', label: 'Light' },
  { pref: 'system', label: 'System' },
];

export default function AppearanceRow({ username }: { username: string | null | undefined }) {
  const [pref, setPref] = useState<ThemePref>('dark');
  useEffect(() => { setPref(getStoredPref()); }, []);

  if (!themePreviewAllowed(username)) return null;

  const choose = (p: ThemePref) => { setPref(p); setThemePref(p); };

  return (
    <LedgerCard style={{ padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ ...MONO, fontSize: 'var(--fs-11)', color: 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Appearance
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex' }}>
          {OPTIONS.map((o) => {
            const sel = pref === o.pref;
            return (
              <button
                key={o.pref}
                onClick={() => choose(o.pref)}
                aria-pressed={sel}
                style={{
                  ...MONO, fontSize: 'var(--fs-11)', padding: '6px 11px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: sel ? 'var(--ink-100)' : 'rgb(var(--ink-rgb) / 0.4)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  transition: 'color 160ms ease',
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </LedgerCard>
  );
}
