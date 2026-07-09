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
const RED = '#f20d0d';

// PLACEHOLDER slides — structure from the mock; Eric supplies final copy + count.
export const EXPLAINER_SLIDES: { title: string; subtitle: string }[] = [
  { title: 'CINEMA\nFOR THE\nINTERNET', subtitle: 'Your work, in true cinematic aspect ratios — not squeezed into someone else’s grid.' },
  { title: 'YOUR GRID,\nYOUR RULES', subtitle: 'Choose how your work is framed and how many across — the layout is yours to compose.' },
  { title: 'COLLECT\nWHAT MOVES\nYOU', subtitle: 'Every post is collectible on Base. Back the work you believe in, early.' },
  { title: 'BUILT FOR\nTHE BIG\nSCREEN', subtitle: 'Desktop gives your work room to breathe. Let’s set up your profile.' },
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
          <h1 style={{ ...INTER_B, fontSize: 54, lineHeight: '56px', color: '#FFF', margin: 0, whiteSpace: 'pre-line', letterSpacing: '-0.01em' }}>{slide.title}</h1>
          <p style={{ ...INTER_B, fontWeight: 400, fontSize: 16, color: '#9e9e9e', lineHeight: 1.5, margin: '22px 0 0', maxWidth: 600 }}>{slide.subtitle}</p>
        </div>

        {/* progress dots (bottom-left) */}
        <div style={{ position: 'absolute', left: 30, bottom: 30, display: 'flex', gap: 7 }}>
          {EXPLAINER_SLIDES.map((_, d) => (
            <span key={d} style={{ width: 8, height: 8, background: d === i ? RED : '#4d4d4d' }} />
          ))}
        </div>

        {/* NEXT / BEGIN (bottom-right) */}
        <button onClick={() => go(1)} style={{ position: 'absolute', right: 30, bottom: 26, ...INTER_B, fontSize: 12, color: '#000', textTransform: 'uppercase', letterSpacing: '0.1em', background: '#FFF', border: 'none', cursor: 'pointer', width: 140, height: 48 }}>
          {last ? 'BEGIN' : 'NEXT'}
        </button>
      </div>
      <style>{`@keyframes explainerIn { from { opacity: 0; transform: translateX(var(--exd)); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  );
}
