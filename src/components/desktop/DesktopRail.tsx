'use client';
// ── DESKTOP RAIL — the 71px global left rail (every desktop surface except
// theatre / full takeovers, which set data-suite-open → the rail stands down
// like the mobile footer does). Desktop-only chrome; the mobile footer is
// untouched. Icons are v1 equivalents of the app's nav set (Eric exports
// finals later): home / create / notifications / wallet / profile.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { motion, useReducedMotion } from 'framer-motion';
import { getInbox } from '@/lib/dm';

const RAIL_W = 71;
const ACTIVE_BAR = '#f20d0d';
const ACTIVE_GRAD = 'linear-gradient(225deg, rgba(242,13,13,0.12) 18%, rgba(203,195,195,0.12) 105%)';

const st = { stroke: 'rgba(255,255,255,0.85)', strokeWidth: 1.5, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

// BOTTOM-UP order (Eric): HOME bottommost → PROFILE → WALLET → SETTINGS →
// CREATE → NOTIFICATIONS topmost. Rendered top-to-bottom = reversed.
const ICONS: { key: string; href: string; label: string; match: (p: string) => boolean; glyph: React.ReactNode }[] = [
  {
    key: 'notifications', href: '/profile/notifications', label: 'Notifications', match: (p) => p.startsWith('/profile/notifications'),
    glyph: <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16z" {...st} /><path d="M10 20.5a2 2 0 0 0 4 0" {...st} /></svg>,
  },
  {
    key: 'create', href: '/create', label: 'Create', match: (p) => p.startsWith('/create'),
    glyph: <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" {...st} /></svg>,
  },
  {
    key: 'settings', href: '/profile/preferences', label: 'Settings', match: (p) => p.startsWith('/profile/preferences'),
    glyph: <svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" {...st} /></svg>,
  },
  {
    key: 'wallet', href: '/wallet', label: 'Wallet', match: (p) => p.startsWith('/wallet'),
    glyph: <svg width="20" height="20" viewBox="0 0 24 24"><rect x="3.5" y="6.5" width="17" height="12" rx="1" {...st} /><path d="M15 12.5h3" {...st} /></svg>,
  },
  {
    // BETWEEN wallet and profile in the array → reads bottom-up as …PROFILE → DM →
    // WALLET… Same squared speech-bubble glyph as the mobile pill icon.
    key: 'dm', href: '/dm', label: 'Messages', match: (p) => p === '/dm' || p.startsWith('/dm/'),
    glyph: <svg width="20" height="20" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...st} /></svg>,
  },
  {
    key: 'profile', href: '/profile', label: 'Profile', match: (p) => p === '/profile' || (p.startsWith('/profile/') && !p.startsWith('/profile/notifications') && !p.startsWith('/profile/preferences')),
    glyph: <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5" {...st} /><path d="M5 20c1.4-3.4 4-5 7-5s5.6 1.6 7 5" {...st} /></svg>,
  },
  {
    key: 'home', href: '/', label: 'Home', match: (p) => p === '/',
    glyph: <svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 10.5L12 4l8 6.5V20h-5.5v-5h-5v5H4z" {...st} /></svg>,
  },
];

export default function DesktopRail() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const reduced = !!useReducedMotion();
  const { user } = usePrivy();
  // DM unread badge — refetched on route change and on 'scope:dm-updated' (the
  // desktop DM surface is master-detail, so reading a thread doesn't change the
  // route; it fires the event to clear the badge).
  const [dmUnread, setDmUnread] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    const load = () => getInbox(user.id)
      .then((cs) => setDmUnread(cs.reduce((n, c) => n + c.unreadCount, 0)))
      .catch(() => {});
    load();
    window.addEventListener('scope:dm-updated', load);
    return () => window.removeEventListener('scope:dm-updated', load);
  }, [user?.id, pathname]);
  // Takeover standdown — the same attribute mechanism as BottomToolbar.
  const [takeover, setTakeover] = useState(false);
  useEffect(() => {
    const sync = () => setTakeover(!!document.documentElement.dataset.suiteOpen);
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-suite-open'] });
    window.addEventListener('scope:takeover-change', sync);
    return () => { mo.disconnect(); window.removeEventListener('scope:takeover-change', sync); };
  }, []);
  if (takeover) return null;

  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: RAIL_W, zIndex: 80,
        background: '#000', borderRight: '0.25px solid rgba(255,255,255,0.35)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
    >
      {/* The ONE Scope logomark. On the home feed it opens VIEWING MODES (the
          feed listens for this event); elsewhere it navigates Home (the bottom
          rail also has a Home glyph). */}
      <button
        onClick={() => { if (pathname === '/') window.dispatchEvent(new CustomEvent('scope:open-viewing-modes')); else router.push('/'); }}
        aria-label={pathname === '/' ? 'Viewing modes' : 'Home'}
        style={{ display: 'block', padding: '18px 0 26px', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <img src="/logomark-plain-white.png" alt="Scope" style={{ width: 41, height: 26, objectFit: 'contain', display: 'block' }} />
      </button>
      {/* BOTTOM-ANCHORED icon stack (the frame's rhythm); the active marker is
          ONE shared element that SLIDES between rows (layoutId), icons
          crossfade as it arrives. Reduced-motion: instant. */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', width: '100%', paddingBottom: 'max(18px, env(safe-area-inset-bottom, 0px))' }}>
        {ICONS.map((ic) => {
          const active = ic.match(pathname);
          return (
            <Link
              key={ic.key}
              href={ic.href}
              aria-label={ic.label}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', height: 56,
              }}
            >
              {active && (
                <motion.span
                  layoutId="rail-active"
                  transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 750, damping: 46 }} /* ~180ms snap, quick decel */
                  style={{ position: 'absolute', inset: 0, background: ACTIVE_GRAD, borderLeft: `3px solid ${ACTIVE_BAR}` }}
                />
              )}
              <span style={{ position: 'relative', opacity: active ? 1 : 0.6, transition: 'opacity 150ms ease' }}>
                {ic.glyph}
                {ic.key === 'dm' && dmUnread > 0 && (
                  // Framed-count badge (the notifications-tab language) on the DM icon.
                  <span style={{ position: 'absolute', top: -6, right: -9, minWidth: 15, boxSizing: 'border-box', textAlign: 'center', padding: '0 4px', lineHeight: 1.5, background: '#0b0b0b', border: '1px solid rgba(255,255,255,0.28)', fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>
                    {dmUnread > 99 ? '99+' : dmUnread}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
