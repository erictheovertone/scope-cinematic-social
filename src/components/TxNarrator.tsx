'use client';
// ── TxNarrator — the ONE global narrator for background money actions ───────
//
// A slim, persistent, app-level status chip (mounted in the provider tree —
// SURVIVES ALL NAVIGATION). Bracket loader language, not a generic toast:
//   ] CREATING YOUR COIN… [        (working — bracket pulse)
//   ] BACKING YOUR POST · $0.15 [  (working)
//   [ COINED · SPRL ]              (done — ~2.5s hold, then fades)
//   [ COIN FAILED — RETRY FROM YOUR POST ]  (failed — red, persists until tap)
// Tap → navigates to where the action lives (the profile grid / the post's
// kebab retry). Any future background money action narrates through this same
// chip — one narrator, everywhere.

import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export type TxPhase = 'working' | 'done' | 'failed';

export interface TxStatus {
  phase: TxPhase;
  label: string;
  /** The post this action belongs to — drives the grid tile's in-progress
      state and the tap-through target. */
  postId?: string;
  /** Tap destination (defaults to /profile — where the tile + kebab live). */
  href?: string;
}

interface TxNarratorApi {
  /** Set/replace the current narration. */
  narrate: (s: TxStatus) => void;
  /** Terminal success — holds ~2.5s, then fades out. */
  done: (label: string, postId?: string) => void;
  /** Terminal failure — red, persists until tapped/dismissed. */
  fail: (label: string, postId?: string) => void;
  clear: () => void;
  /** Grid tiles consult this: the phase of the action on a given post. */
  statusFor: (postId: string) => TxPhase | null;
}

const Ctx = createContext<TxNarratorApi>({
  narrate: () => {}, done: () => {}, fail: () => {}, clear: () => {}, statusFor: () => null,
});
export const useTxNarrator = () => useContext(Ctx);

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export function TxNarratorProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<TxStatus | null>(null);
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => { if (fadeTimer.current) { clearTimeout(fadeTimer.current); fadeTimer.current = null; } };

  const narrate = useCallback((s: TxStatus) => {
    clearTimers(); setFading(false); setStatus(s);
  }, []);

  const done = useCallback((label: string, postId?: string) => {
    clearTimers(); setFading(false); setStatus({ phase: 'done', label, postId });
    fadeTimer.current = setTimeout(() => {
      setFading(true);
      fadeTimer.current = setTimeout(() => { setStatus(null); setFading(false); }, 500);
    }, 2500);
  }, []);

  const fail = useCallback((label: string, postId?: string) => {
    clearTimers(); setFading(false); setStatus({ phase: 'failed', label, postId });
  }, []);

  const clear = useCallback(() => { clearTimers(); setStatus(null); setFading(false); }, []);

  const statusFor = useCallback(
    (postId: string) => (status?.postId === postId ? status.phase : null),
    [status]
  );

  const handleTap = () => {
    const target = status?.href ?? '/profile';
    if (status?.phase === 'failed') clear(); // failure dismisses on tap
    router.push(target);
  };

  return (
    <Ctx.Provider value={{ narrate, done, fail, clear, statusFor }}>
      {children}
      {status && (
        <div
          onClick={handleTap}
          style={{
            position: 'fixed',
            bottom: 64, // above the nav bar
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 700,
            background: '#000',
            border: `1px solid ${status.phase === 'failed' ? '#FF0000' : 'rgba(255,0,0,0.55)'}`,
            padding: '9px 16px',
            cursor: 'pointer',
            opacity: fading ? 0 : 1,
            transition: 'opacity 0.5s ease',
            whiteSpace: 'nowrap',
            maxWidth: '92vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{
            ...SKB,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: status.phase === 'failed' ? '#FF0000' : status.phase === 'done' ? '#FF0000' : '#FFF',
            animation: status.phase === 'working' ? 'txn-pulse 1.6s ease-in-out infinite' : 'none',
          }}>
            {status.label}
          </span>
          <style>{`@keyframes txn-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
        </div>
      )}
    </Ctx.Provider>
  );
}
