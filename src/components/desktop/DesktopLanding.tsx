'use client';
// ── DESKTOP LANDING (Figma 1:687) — the logged-out desktop entry ─────────────
// Centered Scope logo on black; LOG IN (primary — white block) + SIGN UP
// (secondary — outline). Both route into the EXISTING Privy flow (the auth
// itself is Privy's, unchanged) → /auth/callback, which sends desktop new/
// unseen users into /onboarding.

import { useLogin } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function DesktopLanding() {
  const router = useRouter();
  const { login } = useLogin({ onComplete: () => router.push('/auth/callback'), onError: (e) => console.error('[landing] auth error:', e) });

  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
      <img src="/scope-logo-new-no-black.png" alt="Scope" style={{ width: 240, height: 'auto', objectFit: 'contain', display: 'block' }} />
      <div style={{ display: 'flex', gap: 14 }}>
        {/* LOG IN — primary (white block) */}
        <button onClick={login} style={{ ...SKB, fontSize: 12, color: '#000', textTransform: 'uppercase', letterSpacing: '0.12em', background: '#FFF', border: '1px solid #FFF', cursor: 'pointer', width: 150, height: 46 }}>
          LOG IN
        </button>
        {/* SIGN UP — secondary (outline) */}
        <button onClick={login} style={{ ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.12em', background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', cursor: 'pointer', width: 150, height: 46 }}>
          SIGN UP
        </button>
      </div>
    </div>
  );
}
