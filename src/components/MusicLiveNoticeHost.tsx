'use client';

// ── MusicLiveNoticeHost — the one-time "your music is live" notice (Brief MUS-3 §4) ──────────────
// Mirrors RecapHost / desktopOnboarding: on the first authenticated load, resolve the viewer's uuid
// and show a one-time sheet IF the composer has an approved track whose approval is NEWER than the
// last time we notified them. A TIMESTAMP (profiles.music_live_notified_at), not a boolean, so a
// composer who ships a SECOND album next year is notified again (its approval post-dates the stamp).
// Dismiss stamps now(). Shows once per app launch (sessionStorage). Migration-safe: if the column
// isn't there yet (not run), the read errors → we simply never show (feature off until the column).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { getUserByPrivyId } from '@/lib/userService';
import { supabase } from '@/lib/supabase/client';

const SESSION_KEY = 'scope:music-live-shown'; // evaluate once per app launch

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

/** The composer has an approved track whose approval post-dates the last notice (or no notice yet). */
async function shouldShow(userId: string): Promise<boolean> {
  const { data: t } = await supabase
    .from('tracks').select('approved_at')
    .eq('composer_user_id', userId).eq('status', 'approved').not('approved_at', 'is', null)
    .order('approved_at', { ascending: false }).limit(1).maybeSingle();
  const approvedAt = (t as { approved_at?: string | null } | null)?.approved_at;
  if (!approvedAt) return false;
  const { data: p, error } = await supabase.from('profiles').select('music_live_notified_at').eq('user_id', userId).maybeSingle();
  if (error) return false; // column not migrated yet → feature off (never fires on a pre-migration DB)
  const stamp = (p as { music_live_notified_at?: string | null } | null)?.music_live_notified_at;
  return Date.parse(approvedAt) > (stamp ? Date.parse(stamp) : 0);
}

export default function MusicLiveNoticeHost() {
  const { user, authenticated } = usePrivy();
  const router = useRouter();
  const [uuid, setUuid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!authenticated || !user || startedRef.current) return;
    let alive = true;
    (async () => {
      const u = await getUserByPrivyId(user.id);
      if (!alive || !u) return;
      setUuid(u.id);
      if (startedRef.current) return;
      startedRef.current = true;
      // Evaluate once per app launch (a mid-session approval shouldn't pop mid-browse).
      const shown = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1';
      if (shown) return;
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* private mode */ }
      if (await shouldShow(u.id)) { if (alive) setOpen(true); }
    })();
    return () => { alive = false; };
  }, [authenticated, user]);

  const dismiss = useCallback((go?: boolean) => {
    setOpen(false);
    if (uuid) void supabase.from('profiles').update({ music_live_notified_at: new Date().toISOString() }).eq('user_id', uuid);
    if (go) router.push('/library');
  }, [uuid, router]);

  return (
    <>
      <div onClick={() => dismiss(false)} style={{
        position: 'fixed', inset: 0, zIndex: 560, backgroundColor: 'rgb(var(--canvas-rgb) / 0.85)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.3s ease',
      }} />
      <div data-testid="music-live-notice" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: '30rem', zIndex: 561,
        backgroundColor: 'var(--surface-08)', borderTop: '1px solid rgb(var(--ink-rgb) / 0.08)',
        transform: open ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
        padding: '28px 24px calc(40px + var(--safe-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 36, height: 2, backgroundColor: 'rgb(var(--ink-rgb) / 0.12)' }} />
        </div>
        <p style={{ ...SKB, fontSize: 'var(--fs-16)', color: 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 10px' }}>
          YOUR MUSIC IS LIVE
        </p>
        <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgb(var(--ink-rgb) / 0.6)', lineHeight: 1.6, margin: '0 0 24px' }}>
          Your tracks are approved and live on the Scope library — creators can score their posts with your work now.
        </p>
        <button onClick={() => dismiss(true)} style={{ width: '100%', background: 'var(--ink-100)', border: 'none', cursor: 'pointer', padding: '14px 0', marginBottom: 10 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: 'var(--on-ink)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>VIEW THE LIBRARY</span>
        </button>
        <button onClick={() => dismiss(false)} style={{ width: '100%', background: 'transparent', border: '1px solid rgb(var(--ink-rgb) / 0.12)', cursor: 'pointer', padding: '12px 0' }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgb(var(--ink-rgb) / 0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DISMISS</span>
        </button>
      </div>
    </>
  );
}
