'use client';
// ── WELCOME EXPLAINER — the "designed for the big screen" first-contact card ──
// 820×520 centered card, red L-corner brackets, step counter / SKIP / square
// progress dots / NEXT→BEGIN. Slides live in ONE array (title, subtitle) so
// Eric edits copy + count in one place — the seeded copy is PLACEHOLDER
// structure from the mock (not final). Keyboard ←/→ + Esc(=skip); ~200ms
// slide/fade; reduced-motion = instant.

import { useEffect, useState } from 'react';
import RedBrackets from '@/components/desktop/RedBrackets';

const INTER_B: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#E5E1DB';

// COPY = the MOBILE welcome slides VERBATIM (source of truth:
// OnboardingModal.tsx SCREENS) — same order, same count (4).
export const EXPLAINER_SLIDES: { title: string; subtitle: string }[] = [
  { title: 'CINEMA\nFOR THE\nINTERNET', subtitle: 'A home for cinematic work — for filmmakers, photographers, and visual artists who care how their images are seen. Present it in a space built for it: customizable grids, a theatrical viewing mode, and decks that sequence work like a reel. Craft first.' },
  { title: 'YOU HAVE\nA WALLET', subtitle: "When you joined, Scope set up a digital wallet in your name — nothing to set up, nothing to manage. It's how your work becomes ownable: every post can be collected by real fans, and you make real money when they do. As you build, your standing shows — early members, verified artists, and featured work carry badges that mark who you are." },
  { title: 'POST.\nMINT.\nEARN.', subtitle: "Share your work and let it travel. Every time it's collected or traded, a fee comes back to you — the creator earns from all of it, every time. No follower counts to chase, no algorithm to game. Just your work, your collectors, and a reason to keep creating." },
  { title: "THIS ISN'T\nANOTHER FEED", subtitle: 'A platform where your work earns, your portfolio lives, and you present it your way — on desktop and mobile. Different for a reason: built for the people who use it.' },
];

export default function WelcomeExplainer({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const n = EXPLAINER_SLIDES.length;
  const last = i === n - 1;

  const go = (d: 1 | -1) => {
    setDir(d);
    setI((v) => {
      const next = v + d;
      if (next < 0) return v;
      if (next >= n) { onDone(); return v; }
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const slide = EXPLAINER_SLIDES[i];
  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div style={{ position: 'relative', width: 820, height: 520, background: '#000', border: '1px solid #1a1a1a', boxSizing: 'border-box' }}>
        <RedBrackets inset={0} />

        {/* chrome: counter (top-left) · SKIP (top-right) */}
        <span style={{ position: 'absolute', top: 24, left: 30, ...INTER_B, fontSize: 13, color: RED, letterSpacing: '0.14em' }}>
          {String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
        </span>
        <button onClick={onSkip} style={{ position: 'absolute', top: 22, right: 28, ...INTER_B, fontSize: 12, color: '#808080', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
          SKIP
        </button>

        {/* content */}
        <div key={i} style={{ position: 'absolute', left: 50, top: 150, right: 50, animation: reduced ? 'none' : `explainerIn 200ms ease both`, ['--exd' as string]: dir === 1 ? '24px' : '-24px' }}>
          <h1 style={{ ...INTER_B, fontSize: 'calc(54px * var(--type-scale))', lineHeight: '56px', color: '#E5E1DB', margin: 0, whiteSpace: 'pre-line', letterSpacing: '-0.01em' }}>{slide.title}</h1>
          <p style={{ ...INTER_B, fontWeight: 400, fontSize: 16, color: '#9e9e9e', lineHeight: 1.5, margin: '22px 0 0', maxWidth: 600 }}>{slide.subtitle}</p>
        </div>

        {/* progress dots (bottom-left) */}
        <div style={{ position: 'absolute', left: 30, bottom: 30, display: 'flex', gap: 7 }}>
          {EXPLAINER_SLIDES.map((_, d) => (
            <span key={d} style={{ width: 8, height: 8, background: d === i ? RED : '#4d4d4d' }} />
          ))}
        </div>

        {/* NEXT / BEGIN (bottom-right) */}
        <button onClick={() => go(1)} style={{ position: 'absolute', right: 30, bottom: 26, ...INTER_B, fontSize: 12, color: '#000', textTransform: 'uppercase', letterSpacing: '0.1em', background: '#E5E1DB', border: 'none', cursor: 'pointer', width: 140, height: 48 }}>
          {last ? 'BEGIN' : 'NEXT'}
        </button>
      </div>
      <style>{`@keyframes explainerIn { from { opacity: 0; transform: translateX(var(--exd)); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  );
}
