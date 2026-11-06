'use client';

// ── GradedPlaybackProvider — VID-2c ──────────────────────────────────────────────────────────────
// Resolves graded WebGL playback ONCE per VIEWER (not per post, not per component) by asking the
// server (/api/playback/flags) which reads GRADED_PLAYBACK_ALLOWLIST. Sends the Privy access token so
// the server can map DID → username → allowlist. Defaults OFF until the answer lands, so a graded
// player never flashes on then off. Re-resolves when the signed-in user changes.
import { createContext, useContext, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

const Ctx = createContext<boolean>(false);

/** This viewer's resolved graded-playback boolean. False until the server answers. */
export const useGradedPlayback = (): boolean => useContext(Ctx);

export function GradedPlaybackProvider({ children }: { children: React.ReactNode }) {
  const { user, getAccessToken, ready } = usePrivy();
  const [graded, setGraded] = useState(false);

  useEffect(() => {
    if (!ready) return; // wait for Privy to settle so signed-in viewers send a token
    let dead = false;
    (async () => {
      try {
        let token: string | null = null;
        try { token = user ? await getAccessToken() : null; } catch { token = null; }
        const res = await fetch('/api/playback/flags', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = (await res.json()) as { graded?: boolean };
        if (!dead) setGraded(!!json.graded);
      } catch {
        if (!dead) setGraded(false);
      }
    })();
    return () => { dead = true; };
  }, [ready, user?.id, getAccessToken]);

  return <Ctx.Provider value={graded}>{children}</Ctx.Provider>;
}
