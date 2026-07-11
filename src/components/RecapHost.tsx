'use client';

// ── RecapHost — show-on-entry orchestration for WHILE YOU WERE AWAY ───────────
//
// On the first authenticated load (cold launch), resolves the viewer's Supabase
// uuid + profile, then PREFETCHES /api/recap in the background (overlaps with feed
// load → instant render, no spinner). Shows the sheet on entry only if: setting ON,
// recap.hasActivity, away ≥ MIN_AWAY, and not already shown this session. Dismiss
// resets profiles.last_seen_at (the canonical reset — the user has actually seen it),
// so the next recap starts fresh. CustomEvent 'scope:open-recap' is a manual re-trigger.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getUserByPrivyId, getProfile, setLastSeen } from '@/lib/userService';
import type { Recap } from '@/lib/economy/recap';
import WhileYouWereAwaySheet from '@/components/WhileYouWereAwaySheet';

const MIN_AWAY_MS = 6 * 60 * 60 * 1000;        // 6h — don't pop on quick re-opens
const SESSION_KEY = 'scope:recap-shown';        // show ONCE per app launch (sessionStorage)

export default function RecapHost() {
  const { user, authenticated } = usePrivy();
  const [uuid, setUuid] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [recap, setRecap] = useState<Recap | null>(null);
  const [open, setOpen] = useState(false);

  const startedRef = useRef(false);             // prefetch ONCE per app session
  const showRecapRef = useRef(true);            // setting (default ON)
  const lastSeenRef = useRef<string | null>(null);

  const fetchRecap = useCallback(async (id: string): Promise<Recap | null> => {
    try {
      const res = await fetch(`/api/recap?userId=${id}`);
      if (!res.ok) { console.error('[recap] HTTP', res.status); return null; }
      return (await res.json()) as Recap;
    } catch (err) {
      console.error('[recap] fetch failed', err);
      return null;
    }
  }, []);

  // First authenticated load → resolve user + profile, then prefetch + maybe show. The
  // startedRef guard makes this run once per app session (RecapHost is mounted once in the
  // provider tree, so it survives route changes / foreground flips → no re-show).
  useEffect(() => {
    if (!authenticated || !user || startedRef.current) return;
    let alive = true;
    (async () => {
      const u = await getUserByPrivyId(user.id);
      if (!alive || !u) return;
      setUuid(u.id);
      const prof = await getProfile(u.id);
      if (!alive) return;
      setUsername(prof?.username ?? '');
      showRecapRef.current = prof?.show_recap !== false;       // default ON (null/undefined)
      lastSeenRef.current = prof?.last_seen_at ?? null;

      // Setting OFF → skip the prefetch entirely (saves the call); manual event still works.
      if (!showRecapRef.current || startedRef.current) return;
      startedRef.current = true;

      const data = await fetchRecap(u.id);
      if (!alive || !data) return;
      setRecap(data);

      // SHOW-ON-ENTRY gate — evaluate the away condition ONCE per app launch. We
      // consume the session flag the MOMENT we evaluate (not only when we show), so a
      // mid-session remount, a refetch, or a fresh mint that flips hasActivity (a mint
      // is *current*-session activity, not "while you were away") can never re-pop it.
      const shownThisSession = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1';
      if (shownThisSession) return;
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* private mode */ }
      const awayEnough = !lastSeenRef.current || Date.now() - Date.parse(lastSeenRef.current) > MIN_AWAY_MS;
      if (data.hasActivity && awayEnough) {
        setOpen(true);
      }
    })();
    return () => { alive = false; };
  }, [authenticated, user, fetchRecap]);

  // Manual / dev re-trigger — always shows (bypasses session + MIN_AWAY gates), fetches if
  // we don't already have data. Works even when the setting is OFF (for testing).
  useEffect(() => {
    const onEvt = async () => {
      if (!uuid) return;
      const data = recap ?? (await fetchRecap(uuid));
      if (data) { setRecap(data); setOpen(true); }
    };
    window.addEventListener('scope:open-recap', onEvt as EventListener);
    return () => window.removeEventListener('scope:open-recap', onEvt as EventListener);
  }, [uuid, recap, fetchRecap]);

  // Dismiss (ENTER / backdrop) → reset the recap cutoff to now so the next recap is fresh.
  const handleClose = useCallback(() => {
    setOpen(false);
    if (uuid) { void setLastSeen(uuid); lastSeenRef.current = new Date().toISOString(); }
  }, [uuid]);

  return (
    <WhileYouWereAwaySheet
      visible={open}
      recap={recap}
      username={username}
      onClose={handleClose}
    />
  );
}
