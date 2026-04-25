"use client";

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { syncUserWithSupabase, getUserByPrivyId, getProfile } from '@/lib/userService';

// Only attempt routing on post-login transition pages.
// On all other paths we sync silently and let the page handle itself.
const AUTH_FLOW_PATHS = ['/auth/callback', '/transition'];

export function UserSyncProvider({ children }: { children: React.ReactNode }) {
  const { user, authenticated } = usePrivy();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    console.log('[UserSyncProvider] effect — authenticated:', authenticated, 'user:', user?.id ?? 'null', 'pathname:', pathname);

    if (!authenticated || !user) {
      console.log('[UserSyncProvider] not authenticated — skipping');
      return;
    }

    const syncAndMaybeRoute = async () => {
      // ── Step 1: sync the user row (upsert — always safe to call) ──────────
      const syncedUser = await syncUserWithSupabase(user);
      console.log('[UserSyncProvider] sync complete — supabase id:', syncedUser?.id ?? 'null');

      // ── Step 2: only route on post-login paths ─────────────────────────────
      if (!AUTH_FLOW_PATHS.includes(pathname)) {
        console.log('[UserSyncProvider] not an auth-flow path — skipping redirect');
        return;
      }

      // ── Step 3: look up the user row strictly by THIS user's privy_id ──────
      const supabaseUser = await getUserByPrivyId(user.id);
      console.log('[UserSyncProvider] getUserByPrivyId(', user.id, ') →', supabaseUser?.id ?? 'null');

      if (!supabaseUser) {
        console.log('[UserSyncProvider] no users row for privy_id', user.id, '→ /profile/setup');
        router.replace('/profile/setup');
        return;
      }

      // ── Step 4: check profile strictly by THIS user's supabase UUID ────────
      const profile = await getProfile(supabaseUser.id);
      console.log(
        '[UserSyncProvider] getProfile(user_id:', supabaseUser.id, ') →',
        profile ? `username="${profile.username}"` : 'null'
      );

      if (profile && profile.username) {
        console.log('[UserSyncProvider] profile found with username → /profile');
        router.replace('/profile');
      } else {
        console.log('[UserSyncProvider] no profile or username missing → /profile/setup');
        router.replace('/profile/setup');
      }
    };

    syncAndMaybeRoute().catch(err => {
      console.error('[UserSyncProvider] unexpected error — defaulting to /profile/setup:', err);
      if (AUTH_FLOW_PATHS.includes(pathname)) {
        router.replace('/profile/setup');
      }
    });
  }, [authenticated, user?.id, pathname]);

  return <>{children}</>;
}
