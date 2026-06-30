'use client';

// ── RecapHost — resolves the user, fetches /api/recap, mounts the recap sheet ─
//
// Stage 2: NO show-on-entry logic and NO settings toggle yet (that's Stage 3).
// DEV TRIGGER for device testing: open the sheet by either
//   • navigating to any page with ?recap=1, or
//   • dispatching window 'scope:open-recap'.
// It resolves the viewer's Supabase UUID (posts.user_id) + handle, fetches the
// real recap, and shows the sheet.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getUserByPrivyId, getProfile } from '@/lib/userService';
import type { Recap } from '@/lib/economy/recap';
import WhileYouWereAwaySheet from '@/components/WhileYouWereAwaySheet';

export default function RecapHost() {
  const { user, authenticated } = usePrivy();
  const [uuid, setUuid] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [recap, setRecap] = useState<Recap | null>(null);
  const [open, setOpen] = useState(false);

  // Resolve UUID + handle once authenticated.
  useEffect(() => {
    if (!authenticated || !user) return;
    let alive = true;
    (async () => {
      const u = await getUserByPrivyId(user.id);
      if (!alive || !u) return;
      setUuid(u.id);
      const prof = await getProfile(u.id);
      if (alive) setUsername(prof?.username ?? '');
    })();
    return () => { alive = false; };
  }, [authenticated, user]);

  const trigger = useCallback(async () => {
    if (!uuid) return;
    try {
      const res = await fetch(`/api/recap?userId=${uuid}`);
      if (!res.ok) { console.error('[recap] HTTP', res.status); return; }
      const data = (await res.json()) as Recap;
      setRecap(data);
      setOpen(true);
    } catch (err) {
      console.error('[recap] fetch failed', err);
    }
  }, [uuid]);

  // Dev trigger A: custom event (URL-independent).
  useEffect(() => {
    const onEvt = () => { void trigger(); };
    window.addEventListener('scope:open-recap', onEvt);
    return () => window.removeEventListener('scope:open-recap', onEvt);
  }, [trigger]);

  // Dev trigger B: ?recap=1. LATCH the intent on first mount — before any redirect
  // can strip the query — then fire once uuid resolves. Reading the param late (in the
  // uuid-gated effect) was the bug: the param was already gone by then.
  const wantRecapRef = useRef(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('recap') === '1') {
      wantRecapRef.current = true;
    }
  }, []);
  useEffect(() => {
    if (uuid && wantRecapRef.current) { wantRecapRef.current = false; void trigger(); }
  }, [uuid, trigger]);

  return (
    <WhileYouWereAwaySheet
      visible={open}
      recap={recap}
      username={username}
      onClose={() => setOpen(false)}
    />
  );
}
