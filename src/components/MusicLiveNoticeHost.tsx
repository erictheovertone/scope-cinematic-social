'use client';

// ── MusicLiveNoticeHost — the one-time "your music is live" notice (Brief MUS-3 §4 / MUS-3a) ──────
// On the first authenticated load, ask the SERVER whether to show the one-time sheet. The decision
// AND the stamp live in /api/music/live-notice: the composer has an approved track whose approval is
// NEWER than profiles.music_live_notified_at → it stamps now() (service role) and returns show:true
// exactly once. A TIMESTAMP not a boolean, so a second album next year notifies again. Shows once per
// app launch (sessionStorage).
//   MUS-3a — the stamp used to be a CLIENT-side supabase.update() under the anon key, which RLS
//   silently rejected (Privy auth ≠ a Supabase session) while the public read still fired the sheet —
//   so it showed on every login. The write is now server-side by the resolved uuid, read back + logged.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';

const SESSION_KEY = 'scope:music-live-shown'; // evaluate once per app launch

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function MusicLiveNoticeHost() {
  const { authenticated, getAccessToken } = usePrivy();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // UI-1 — render/exit-delay gate: mounted ONLY while opening, open, or animating out, so the common
  // "no approved music" case keeps nothing in the DOM — while the slide in/out is preserved.
  // `render` = in the DOM; `visible` = at the resting position (drives transform/opacity).
  const [render, setRender] = useState(false);
  const [visible, setVisible] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!authenticated || startedRef.current) return;
    startedRef.current = true; // once per app launch, even across auth re-renders
    let alive = true;
    (async () => {
      // Evaluate once per app launch (a mid-session approval shouldn't pop mid-browse).
      const shown = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1';
      if (shown) return;
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* private mode */ }
      try {
        const token = await getAccessToken();
        if (!token || !alive) return;
        // The server decides AND stamps on show (MUS-3a) — the client only renders the result.
        const res = await fetch('/api/music/live-notice', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!res.ok) return;
        const j = (await res.json()) as { show?: boolean };
        if (alive && j?.show) setOpen(true);
      } catch { /* network / private mode → simply don't show this launch */ }
    })();
    return () => { alive = false; };
  }, [authenticated, getAccessToken]);

  // The stamp is written server-side on SHOW (MUS-3a), so closing just dismisses + optionally routes.
  const dismiss = useCallback((go?: boolean) => {
    setOpen(false);
    if (go) router.push('/library');
  }, [router]);

  // Open → mount, then (after the first paint) animate to the resting position. Close → animate out,
  // then unmount once the 0.4s transform has finished. Not in the DOM at rest.
  useEffect(() => {
    if (open) {
      setRender(true);
      // Two frames: the browser paints the translateY(100%) start before we flip to 0 → real slide-in.
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setRender(false), 450); // > the 0.4s transform → unmount after exit
    return () => clearTimeout(t);
  }, [open]);

  if (!render) return null;

  return (
    <>
      <div onClick={() => dismiss(false)} style={{
        position: 'fixed', inset: 0, zIndex: 560, backgroundColor: 'rgb(var(--canvas-rgb) / 0.85)',
        opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.3s ease',
      }} />
      <div data-testid="music-live-notice" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: '30rem', zIndex: 561,
        backgroundColor: 'var(--surface-08)', borderTop: '1px solid rgb(var(--ink-rgb) / 0.08)',
        transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
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
