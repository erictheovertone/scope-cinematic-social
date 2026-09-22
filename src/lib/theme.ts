// ── theme — Brief T1-4a: the ONE source of truth for the appearance setting ───
// localStorage 'scope.theme' ∈ 'dark' | 'light' | 'system' (absent = 'dark'; Scope's default is
// dark, System is opt-in). Resolve → an APPLIED theme → data-theme="dark|light" on <html> — the
// SAME attribute the Stage 2 light block and useTheme() (MutationObserver) key on. No second
// store, no DB column (Stage 4b owns the profile field + cross-device sync).

export type ThemeMode = 'dark' | 'light';         // an APPLIED theme
export type ThemePref = 'dark' | 'light' | 'system'; // the stored PREFERENCE

export const THEME_KEY = 'scope.theme';
const CANVAS = { dark: '#050505', light: '#E5E1DB' } as const; // theme-color = the canvas ground

export function getStoredPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'system' || v === 'dark') return v;
  } catch { /* private mode / disabled storage */ }
  return 'dark';
}

export function systemTheme(): ThemeMode {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

export function resolvePref(pref: ThemePref): ThemeMode {
  return pref === 'system' ? systemTheme() : pref;
}

/** Apply an already-resolved theme to <html>: the data-theme attribute (drives the CSS), the
 *  native color-scheme (form controls / scrollbars), and the theme-color meta = the canvas
 *  ground (so the Android/desktop chrome and — where honoured — the iOS status bar follow). */
export function applyTheme(applied: ThemeMode): void {
  const el = document.documentElement;
  el.setAttribute('data-theme', applied);
  el.style.colorScheme = applied;
  let m = document.querySelector('meta[name="theme-color"]');
  if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); document.head.appendChild(m); }
  m.setAttribute('content', CANVAS[applied]);
}

/** Persist a preference and apply it immediately (no reload). Broadcasts so any live
 *  system-listener re-evaluates. */
export function setThemePref(pref: ThemePref): void {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* ignore */ }
  applyTheme(resolvePref(pref));
  try { window.dispatchEvent(new CustomEvent('scope:theme-pref')); } catch { /* ignore */ }
}

/** Gate for the preview control: NEXT_PUBLIC_THEME_PREVIEW_USERNAMES (comma list; '*' = everyone;
 *  absent = hidden). Baked at build (NEXT_PUBLIC) — ungating later is an env change, not code. */
export function themePreviewAllowed(username: string | null | undefined): boolean {
  const raw = process.env.NEXT_PUBLIC_THEME_PREVIEW_USERNAMES;
  if (!raw) return false;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes('*')) return true;
  return !!username && list.includes(username);
}
