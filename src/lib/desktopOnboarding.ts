// ── DESKTOP ONBOARDING — the seen-once flag ───────────────────────────────────
// Mobile has NO explicit onboarding-seen flag: it gates on "profile.username
// exists" (setup-complete). The desktop EXPLAINER is a distinct first-contact
// beat that must show once even to mobile-onboarded users — so it needs its own
// flag. profiles.desktop_onboarded (SQL for Eric) with a localStorage fallback
// so it works pre-migration and offline.

import { supabase } from '@/lib/supabase/client';

const LS_KEY = (userId: string) => `scope:desktopOnboarded:${userId}`;

export async function hasSeenDesktopExplainer(userId: string): Promise<boolean> {
  // localStorage is a best-effort fast-path only. It must never throw (Safari
  // private mode throws on access) — and it's NOT the source of truth: it
  // doesn't survive across devices/browsers/incognito. The profiles column is.
  try { if (typeof window !== 'undefined' && localStorage.getItem(LS_KEY(userId)) === '1') return true; } catch { /* storage blocked → fall through to the column */ }
  try {
    const { data, error } = await supabase.from('profiles').select('desktop_onboarded').eq('user_id', userId).maybeSingle();
    if (error) return false; // column missing pre-migration → treat as unseen (localStorage still gates repeats in-session)
    return !!(data as { desktop_onboarded?: boolean } | null)?.desktop_onboarded;
  } catch { return false; }
}

export async function markDesktopExplainerSeen(userId: string): Promise<void> {
  // Durable store = the profiles column (survives across devices). localStorage
  // is a best-effort mirror; guard it so a throwing/disabled store can never
  // block the column write that follows.
  try { if (typeof window !== 'undefined') localStorage.setItem(LS_KEY(userId), '1'); } catch { /* private mode / disabled — the column carries it */ }
  try {
    const { error } = await supabase.from('profiles').update({ desktop_onboarded: true }).eq('user_id', userId);
    if (error) console.warn('[desktop-onboarding] flag write failed (migration pending?):', error.message);
  } catch { /* localStorage carries it in-session */ }
}
