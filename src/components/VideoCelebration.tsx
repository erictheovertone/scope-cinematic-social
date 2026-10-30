'use client';

// ── VideoCelebration — tap-to-reveal video celebration WITH SOUND ──────────────
//
// Browsers block unmuted autoplay on load; the TAP is the user gesture that makes
// audio legal. Flow: black GATE (badge + "TAP TO REVEAL") preloads the video →
// tap plays it UNMUTED, playsInline, once → onEnded auto-dismisses. A SKIP escape
// hatch during playback so no one is trapped. onError / play() rejection → the
// static badge celebration (renderFallback) — never a black screen. Reduced-motion
// skips the video and shows the static celebration.
//
// CEL-2 — `tier` picks the welcome film: 'augmented' plays welcome-to-augmented.mp4 (6s) with
// its poster; 'pro' (or no tier + an explicit videoSrc, e.g. Top 1K) is unchanged. Dismissal keys
// off the video's `ended` event — never a fixed duration — then HOLDS the final frame ~1.2s.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AugmentedMark } from '@/components/brand/AugmentedMark';

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export type WelcomeTier = 'pro' | 'augmented';

const WELCOME: Record<WelcomeTier, { videoSrc: string; posterSrc?: string; badgeSrc?: string }> = {
  pro: { videoSrc: '/welcome-to-pro-new-ani.mp4', badgeSrc: '/design-updates-071526/new-badges/scope-pro.png' },
  augmented: { videoSrc: '/welcome-to-augmented.mp4', posterSrc: '/welcome-to-augmented-poster.png' },
};

/** How long the last frame stays on screen after `ended` before the overlay closes. */
export const FINAL_FRAME_HOLD_MS = 1200;

interface Props {
  /** Which welcome film — resolves videoSrc/poster/badge. Omit to pass videoSrc directly. */
  tier?: WelcomeTier;
  /** Web-playable video (mp4/webm). Ignored when `tier` is set. */
  videoSrc?: string;
  /** Static badge PNG shown on the gate (and the fallback celebration's own mark). */
  badgeSrc?: string;
  onDone: () => void;
  /** The existing static celebration — shown on error / reduced-motion. */
  renderFallback: (done: () => void) => React.ReactNode;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function VideoCelebration({ tier, videoSrc: srcProp, badgeSrc: badgeProp, onDone, renderFallback }: Props) {
  const assets = tier ? WELCOME[tier] : null;
  const videoSrc = assets?.videoSrc ?? srcProp ?? WELCOME.pro.videoSrc;
  const posterSrc = assets?.posterSrc;
  const badgeSrc = assets ? assets.badgeSrc : badgeProp;
  // Reduced-motion resolves to the static celebration immediately (lazy init → no flash).
  // 'held' = the film ended; its last frame stays up for FINAL_FRAME_HOLD_MS, then done.
  const [mode, setMode] = useState<'gate' | 'playing' | 'held' | 'fallback'>(() =>
    prefersReducedMotion() ? 'fallback' : 'gate',
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = () => { if (!doneRef.current) { doneRef.current = true; onDone(); } };
  const ended = () => {
    setMode('held');
    if (!holdRef.current) holdRef.current = setTimeout(done, FINAL_FRAME_HOLD_MS);
  };
  useEffect(() => () => { if (holdRef.current) clearTimeout(holdRef.current); }, []);

  const reveal = () => {
    const v = videoRef.current;
    if (!v) { setMode('fallback'); return; }
    setMode('playing');            // hide the gate instantly, show the (preloaded) video
    v.muted = false;               // the tap gesture makes unmuted playback legal
    v.play().catch(() => setMode('fallback'));
  };

  if (mode === 'fallback') return <>{renderFallback(done)}</>;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div data-swipe-exclude data-testid="video-celebration" data-tier={tier ?? 'custom'} data-mode={mode} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'var(--canvas)', overflow: 'hidden' }}>
      {/* Mounted from the gate onward with preload="auto" so the reveal starts with no
          buffering pause after the tap. Shown only once playing. */}
      <video
        ref={videoRef}
        src={videoSrc}
        poster={posterSrc}
        playsInline
        preload="auto"
        onEnded={ended}
        onError={() => setMode('fallback')}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'var(--canvas)', opacity: mode === 'playing' || mode === 'held' ? 1 : 0 }}
      />

      {mode === 'gate' && (
        <div
          onClick={reveal}
          data-testid="celebration-reveal"
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 22 }}
        >
          {badgeSrc
            ? <img src={badgeSrc} alt="" style={{ width: 72, height: 72, objectFit: 'contain', filter: 'drop-shadow(0 0 18px rgb(var(--ink-rgb) / 0.14))' }} />
            : <AugmentedMark width={72} />}
          <p style={{ ...BOLD, fontSize: 'var(--fs-11)', color: 'rgb(var(--ink-rgb) / 0.65)', letterSpacing: '0.3em', textTransform: 'uppercase', margin: 0 }}>TAP TO REVEAL</p>
        </div>
      )}

      {mode === 'playing' && (
        <button
          onClick={done}
          style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 16, background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, zIndex: 2 }}
        >
          <span style={{ ...BOLD, fontSize: 'var(--fs-10)', color: 'rgb(var(--ink-rgb) / 0.5)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>SKIP</span>
        </button>
      )}
    </div>,
    document.body,
  );
}

/** CEL-2 — the Augmented static fallback (video error / reduced-motion): the poster, tap to close.
 *  There is no film to key off here, so it closes on tap or after a short read. */
export function AugmentedWelcomeStill({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(false);
  const done = () => { if (!doneRef.current) { doneRef.current = true; onDone(); } };
  useEffect(() => { const t = setTimeout(done, 4000); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-swipe-exclude data-testid="augmented-welcome-still" onClick={done}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'var(--canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      <img src={WELCOME.augmented.posterSrc} alt="Welcome to Scope Augmented" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>,
    document.body,
  );
}
