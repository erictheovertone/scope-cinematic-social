'use client';
// ── LaunchCue — the PWA cold-launch hand-off (Brief M21) ──────────────────────
// iOS shows the apple-touch-startup-image (public/splash, #050505 + the aperture mark centered,
// SPLASH_MARK_W wide) until first paint. This overlay is IN the server HTML at that exact spot, so
// the first painted frame is identical to the splash. It shows only when the pre-paint script in
// the root layout flagged a COLD standalone launch (html.launching — once per page session, so
// warm foreground returns and in-app navigations never see it). The HomeLogomarkCue sweep + grow
// runs ONCE (≤1.1s, CSS), then the overlay cross-fades to the shell as the first data lands.
// Reduced motion: the mark stays static, then fades. Dark by design in either theme.
import { useEffect } from 'react';
import { SPLASH_GROUND, SPLASH_INK, SPLASH_MARK_W, MARK_ASPECT } from '@/lib/splash';

const CUE_MS = 1100;      // the sweep + grow, once
const MAX_WAIT_MS = 6000; // never hold the app behind the cue longer than this
const FADE_MS = 320;

export default function LaunchCue() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains('launching')) return;
    let done = false;
    const ready = () => !!document.querySelector('.feed-card') || location.pathname !== '/';
    const finish = () => {
      if (done) return; done = true;
      html.classList.add('launch-out');
      setTimeout(() => html.classList.remove('launching', 'launch-out'), FADE_MS);
    };
    const tick = () => {
      if (done) return;
      const t = performance.now(); // ms since navigation start = since the splash
      if ((t >= CUE_MS && ready()) || t >= MAX_WAIT_MS) finish();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { done = true; };
  }, []);

  return (
    <div className="launch-cue" aria-hidden style={{ background: SPLASH_GROUND, ['--launch-fade' as string]: `${FADE_MS}ms` }}>
      <span className="launch-mark" style={{ width: SPLASH_MARK_W, height: SPLASH_MARK_W * MARK_ASPECT }}>
        <span className="launch-base" style={{ background: SPLASH_INK }} />
        <span className="launch-sweep" />
      </span>
    </div>
  );
}
