"use client";
import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const SCREENS = [
  {
    label: '01 / 04',
    title: 'CINEMA\nFOR THE\nINTERNET',
    body: 'A home for cinematic work — for filmmakers, photographers, and visual artists who care how their images are seen. Present it in a space built for it: customizable grids, a theatrical viewing mode, and decks that sequence work like a reel. Craft first.',
    cta: 'NEXT',
  },
  {
    label: '02 / 04',
    title: 'YOU HAVE\nA WALLET',
    body: "When you joined, Scope set up a digital wallet in your name — nothing to set up, nothing to manage. It's how your work becomes ownable: every post can be collected by real fans, and you make real money when they do. As you build, your standing shows — early members, verified artists, and featured work carry badges that mark who you are.",
    cta: 'NEXT',
  },
  {
    label: '03 / 04',
    title: 'POST.\nMINT.\nEARN.',
    body: "Share your work and let it travel. Every time it's collected or traded, a fee comes back to you — the creator earns from all of it, every time. No follower counts to chase, no algorithm to game. Just your work, your collectors, and a reason to keep creating.",
    cta: 'NEXT',
  },
  {
    label: '04 / 04',
    title: "THIS ISN'T\nANOTHER FEED",
    body: 'A platform where your work earns, your portfolio lives, and you present it your way — on desktop and mobile. Different for a reason: built for the people who use it.',
    cta: 'START CREATING',
  },
];

interface Props {
  onComplete?: () => void;
}

export default function OnboardingModal({ onComplete }: Props) {
  const { user } = usePrivy();
  const [visible, setVisible] = useState(false);
  const [screen, setScreen] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  // Step 1: Capture ?new=1 immediately on mount before anything clears it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isNew = params.get('new') === '1';
    console.log('[onboarding] mount — isNew:', isNew);
    if (isNew) {
      setShouldShow(true);
      window.history.replaceState({}, '', '/profile');
    }
  }, []);

  // Step 2: Once user ID resolves and we know we should show, show modal directly
  useEffect(() => {
    console.log('[onboarding] user/shouldShow — user:', user?.id, 'shouldShow:', shouldShow);
    if (!shouldShow || !user?.id) return;
    localStorage.setItem(`scope_onboarded_${user.id}`, 'true');
    console.log('[onboarding] SHOWING MODAL');
    setVisible(true);
  }, [user?.id, shouldShow]);

  const handleNext = () => {
    if (screen < SCREENS.length - 1) {
      setScreen(s => s + 1);
    } else {
      handleDone();
    }
  };

  const handleDone = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 400);
  };

  if (!visible) return null;

  const current = SCREENS[screen];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      backgroundColor: '#000',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '48px 28px 56px',
      opacity: exiting ? 0 : 1,
      transition: 'opacity 0.4s ease',
    }}>
      {/* Top row: progress + logo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {SCREENS.map((_, i) => (
            <div key={i} style={{
              width: i === screen ? 20 : 6,
              height: 2,
              backgroundColor: i === screen ? '#E5E1DB' : 'rgba(229,225,219,0.2)',
              transition: 'width 0.3s ease, background-color 0.3s ease',
              borderRadius: 1,
            }} />
          ))}
        </div>
        <img src="/scope-logo-new.png" alt="Scope" style={{ height: 22, width: 'auto', opacity: 0.9 }} />
      </div>

      {/* Content */}
      <div>
        <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.35)', letterSpacing: '0.15em', margin: '0 0 24px' }}>
          {current.label}
        </p>
        <p style={{
          ...SKB, fontSize: 'var(--fs-36)', color: '#E5E1DB',
          lineHeight: 1.1, letterSpacing: '-0.03em',
          margin: '0 0 28px', whiteSpace: 'pre-line',
        }}>
          {current.title}
        </p>
        <p style={{ ...SKR, fontSize: 'var(--fs-14)', color: 'rgba(229,225,219,0.6)', lineHeight: 1.65, margin: 0 }}>
          {current.body}
        </p>
      </div>

      {/* Actions */}
      <div>
        <button onClick={handleNext} style={{
          width: '100%', background: '#E5E1DB', border: 'none',
          cursor: 'pointer', padding: '16px 0', marginBottom: 12,
        }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: 'var(--on-ink)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {current.cta}
          </span>
        </button>
        {screen < SCREENS.length - 1 && (
          <button onClick={handleDone} style={{
            width: '100%', background: 'transparent', border: 'none',
            cursor: 'pointer', padding: '10px 0',
          }}>
            <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              SKIP
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
