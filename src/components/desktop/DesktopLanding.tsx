'use client';

// ── DESKTOP LANDING (Brief S2b, Figma 93:674) — the logged-out desktop entry ─
// The SAME composition as the mobile welcome, scaled up: the script "scope" wordmark
// upper-middle-left with "Login" / "Sign Up" stacked left-aligned beneath it. The old
// centered-logo + LOG IN/SIGN UP button box is REMOVED. Both actions enter the EXISTING
// Privy flow (auth unchanged) → /auth/callback → desktop new/unseen users to /onboarding.

import { useLogin } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';

// Brief S2b §3 — Welcome-only exception per Eric; the app-wide soften system stays
// retired (W5). The ONE shared blur constant (mobile welcome imports this), so the
// device nudge is a single number across both surfaces.
export const WELCOME_BLUR = '0.4px';

// Desktop wordmark: 160px — chosen to hold the wider canvas with the SAME optical presence
// as the mobile 100px (a confident hero lockup, not a tiny mobile artifact on 1920).
const DESKTOP_WORDMARK = 160;

export default function DesktopLanding() {
  const router = useRouter();
  const { login } = useLogin({ onComplete: () => router.push('/auth/callback'), onError: (e) => console.error('[landing] auth error:', e) });

  const action: React.CSSProperties = {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
    letterSpacing: 'var(--track-display)', color: 'var(--ink-100)',
    background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '4px 6px', lineHeight: 1.25, textAlign: 'left', whiteSpace: 'nowrap', display: 'block',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', boxSizing: 'border-box' }}>
      {/* Placement — upper-middle-left, off-centre calm (NOT dead-centred): left ~10vw,
          top ~30vh. The lockup is left-aligned; the 0.4px blur is on THIS group only. */}
      <div style={{ position: 'absolute', top: '30vh', left: 'max(calc(var(--safe-left) + 48px), 10vw)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', filter: `blur(${WELCOME_BLUR})` }}>
        {/* Brief S2c — pin 400 / normal / no-synthesis so the inherited body 700 can't
            synthesize bold on the single-cut script face (the thickening). */}
        <span style={{ fontFamily: 'var(--font-script)', fontWeight: 400, fontStyle: 'normal', fontSynthesis: 'none', fontSize: DESKTOP_WORDMARK, lineHeight: 0.85, letterSpacing: '1.5px', color: 'var(--ink-100)', display: 'block' }}>
          scope
        </span>
        <button onClick={login} aria-label="Log in" style={{ ...action, marginTop: 26 }}>Login</button>
        <button onClick={login} aria-label="Sign up" style={{ ...action, marginTop: 10 }}>Sign Up</button>
      </div>

      {/* Brief S2b §4 — quiet terms/privacy micro-line (frame omits it; proposed, not dropped). */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--safe-bottom) + 22px)', textAlign: 'center' }}>
        <a href="/profile/terms" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11, letterSpacing: 'var(--track-body)', color: 'rgba(229,225,219,0.3)', textDecoration: 'none' }}>
          Terms &amp; Privacy
        </a>
      </div>
    </div>
  );
}
