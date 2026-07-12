"use client";

import { useState, useEffect } from "react";
import DesktopRail from '@/components/desktop/DesktopRail';
import DesktopPressLayer from '@/components/desktop/DesktopPressLayer';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUnreadNotificationCount } from "@/lib/userService";
import BottomToolbar from "@/components/BottomToolbar";
import { isStandalone, setInstalled } from "@/lib/pwaUtils";

// Desktop rail stands down on pre-app / takeover surfaces (NOT the general
// HIDDEN list — that's the mobile footer's, and /profile etc. DO show the rail).
const RAIL_HIDDEN = ['/welcome', '/auth/callback', '/onboarding', '/transition'];

const HIDDEN = [
  '/welcome',
  '/auth/callback',
  '/profile',
  '/transition',
  '/profile/setup',
  '/profile/grid-layout',
  '/profile/preferences',
  '/profile/account',
  '/profile/data',
  '/profile/invite',
  '/profile/hidden',
  '/profile/contact',
  '/terms',
  '/privacy',
  '/profile/delete-account',
  '/finishing-dev', // dev editing-suite bench — owns the full viewport, no app chrome
  '/create',        // the create/finishing suite owns the full viewport — the footer
                    // was overlapping the bottom tool rows; it returns on exit
];

export default function AppShell() {
  const pathname = usePathname();
  const { user } = usePrivy();
  const [unreadCount, setUnreadCount] = useState(0);
  const isDesktop = useIsDesktop();
  const [mounted, setMounted] = useState(false);
  // Takeover surfaces (theatre mode, any entry) hide the footer for their whole
  // session — same standdown attribute the finishing suite uses, synced by event.
  const [takeover, setTakeover] = useState(false);
  useEffect(() => {
    const sync = () => setTakeover(!!document.documentElement.dataset.suiteOpen);
    sync();
    window.addEventListener('scope:takeover-change', sync);
    return () => window.removeEventListener('scope:takeover-change', sync);
  }, []);

  useEffect(() => setMounted(true), []);

  // Capture beforeinstallprompt early so AddToHomeScreenSheet can call .prompt() later
  useEffect(() => {
    const a2hsHandler = (e: Event) => {
      e.preventDefault();
      (window as any).__deferredA2HSPrompt = e;
    };
    const installedHandler = () => {
      window.dispatchEvent(new CustomEvent('scope:app-installed'));
    };
    window.addEventListener('beforeinstallprompt', a2hsHandler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', a2hsHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  // If app is already running as installed PWA, mark installed flag retroactively
  useEffect(() => {
    if (!user?.id) return;
    if (isStandalone()) setInstalled(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    getUnreadNotificationCount(user.id)
      .then(setUnreadCount)
      .catch(() => {});
  }, [user?.id, pathname]);

  // Before mount: always render 3 icons (home, create, wallet) — no pathname logic
  if (!mounted) return null;

  // DESKTOP: the 71px rail is the global chrome on EVERY desktop surface
  // (it stands itself down during takeovers via the same attribute) — the
  // mobile footer's HIDDEN list doesn't apply to it.
  if (isDesktop) {
    if (RAIL_HIDDEN.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;
    return <><DesktopRail /><DesktopPressLayer /></>;
  }

  if (takeover || HIDDEN.some(p => pathname === p)) return null;

  const page: 'home' | 'profile' | 'public-profile' | 'wallet' =
    pathname === '/wallet'
      ? 'wallet'
      : pathname === '/profile'
      ? 'profile'
      : pathname?.startsWith('/profile/') && !pathname.includes('/decks')
      ? 'public-profile'
      : pathname?.startsWith('/profile/')
      ? 'public-profile'
      : 'home';

  return (
    <BottomToolbar
      page={page}
      unreadCount={unreadCount}
      onNotificationsClick={() => setUnreadCount(0)}
    />
  );
}
