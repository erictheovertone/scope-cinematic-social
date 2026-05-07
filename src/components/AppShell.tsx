"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUnreadNotificationCount } from "@/lib/userService";
import BottomToolbar from "@/components/BottomToolbar";

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
];

export default function AppShell() {
  const pathname = usePathname();
  const { user } = usePrivy();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!user?.id) return;
    getUnreadNotificationCount(user.id)
      .then(setUnreadCount)
      .catch(() => {});
  }, [user?.id, pathname]);

  // Before mount: always render 3 icons (home, create, wallet) — no pathname logic
  if (!mounted) return null;

  if (HIDDEN.some(p => pathname === p)) return null;

  const page: 'home' | 'profile' | 'public-profile' =
    pathname === '/profile'
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
