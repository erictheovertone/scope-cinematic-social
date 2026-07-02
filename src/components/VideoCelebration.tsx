'use client';

// ── VideoCelebration — tap-to-reveal video celebration WITH SOUND ──────────────
//
// Browsers block unmuted autoplay on load; the TAP is the user gesture that makes
// audio legal. Flow: black GATE (badge + "TAP TO REVEAL") preloads the video →
// tap plays it UNMUTED, playsInline, once → onEnded auto-dismisses. A SKIP escape
// hatch during playback so no one is trapped. onError / play() rejection → the
// static badge celebration (renderFallback) — never a black screen. Reduced-motion
// skips the video and shows the static celebration.

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

interface Props {
  /** Web-playable video (mp4/webm). */
  videoSrc: string;
  /** Static badge PNG shown on the gate (and the fallback celebration's own mark). */
  badgeSrc: string;
  onDone: () => void;
  /** The existing static celebration — shown on error / reduced-motion. */
  renderFallback: (done: () => void) => React.ReactNode;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function VideoCelebration({ videoSrc, badgeSrc, onDone, renderFallback }: Props) {
  // Reduced-motion resolves to the static celebration immediately (lazy init → no flash).
  const [mode, setMode] = useState<'gate' | 'playing' | 'fallback'>(() =>
    prefersReducedMotion() ? 'fallback' : 'gate',
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const done = () => { if (!doneRef.current) { doneRef.current = true; onDone(); } };

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
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#000', overflow: 'hidden' }}>
      {/* Mounted from the gate onward with preload="auto" so the reveal starts with no
          buffering pause after the tap. Shown only once playing. */}
      <video
        ref={videoRef}
        src={videoSrc}
        playsInline
        preload="auto"
        onEnded={done}
        onError={() => setMode('fallback')}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', opacity: mode === 'playing' ? 1 : 0 }}
      />

      {mode === 'gate' && (
        <div
          onClick={reveal}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 22 }}
        >
          <img src={badgeSrc} alt="" style={{ width: 72, height: 72, objectFit: 'contain', filter: 'drop-shadow(0 0 18px rgba(255,255,255,0.14))' }} />
          <p style={{ ...BOLD, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.3em', textTransform: 'uppercase', margin: 0 }}>TAP TO REVEAL</p>
        </div>
      )}

      {mode === 'playing' && (
        <button
          onClick={done}
          style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 16, background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, zIndex: 2 }}
        >
          <span style={{ ...BOLD, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>SKIP</span>
        </button>
      )}
    </div>,
    document.body,
  );
}
