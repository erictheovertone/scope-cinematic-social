'use client';
// ── "You're following <name>" — the landing note after an Arrival sign-up (Brief ARR-1) ───────
// Shown on /profile/[username] when the URL carries ?arrived=1 (set by the arrival intent's
// destination); fades after 4s and strips the param so a reload doesn't replay it.
import { useEffect, useState } from 'react';

export default function ArrivedNote({ username }: { username: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('arrived') !== '1') return;
    setShow(true);
    url.searchParams.delete('arrived');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    const id = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div role="status" style={{ position: 'fixed', top: 'calc(var(--safe-top, 0px) + 64px)', left: 20, right: 20, zIndex: 60, border: '1px solid var(--ink-100)', background: 'var(--canvas)', color: 'var(--ink-100)', padding: '10px 14px', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-display)' }}>
      <span>You&apos;re following {username.toLowerCase()}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgb(var(--ink-rgb) / 0.5)' }}>Scope</span>
    </div>
  );
}
