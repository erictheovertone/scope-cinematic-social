"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUnreadNotificationCount } from "@/lib/userService";
import BottomToolbar from "@/components/BottomToolbar";
import { isStandalone, setInstalled } from "@/lib/pwaUtils";

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
  '/profile/notifications',
  '/profile/invite',
  '/profile/hidden',
  '/profile/contact',
  '/profile/terms',
  '/profile/delete-account',
  '/finishing-dev', // dev editing-suite bench — owns the full viewport, no app chrome
];

export default function AppShell() {
  const pathname = usePathname();
  const { user } = usePrivy();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mounted, setMounted] = useState(false);

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

  if (HIDDEN.some(p => pathname === p)) return null;

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
