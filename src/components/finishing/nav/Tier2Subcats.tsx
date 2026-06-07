"use client";

/**
 * Tier2Subcats — the top, words-only subcategory row (changes per mode).
 *
 * Uppercase, ONE font size, red underline-bar on the active item. Spacing is by
 * LAYOUT, never by font size:
 *   • fits  → distribute evenly across full width (justify-content:space-between)
 *   • overflows → fixed gaps + horizontal scroll (justify-content:flex-start;gap)
 * Overflow is detected (scrollWidth > clientWidth) and re-measured on content /
 * resize, with type size constant in both states.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Subcat } from './navModel';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';

// SSR-safe layout effect.
const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface Tier2SubcatsProps {
  subcats: Subcat[];
  active: string;
  onSelect: (key: string) => void;
}

export default function Tier2Subcats({ subcats, active, onSelect }: Tier2SubcatsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useIso(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [subcats]);

  return (
    <div
      ref={rowRef}
      style={{
        display: 'flex',
        justifyContent: overflow ? 'flex-start' : 'space-between',
        gap: overflow ? 18 : 0,
        overflowX: 'auto',
        padding: '12px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {subcats.map((s) => {
        const on = s.key === active;
        return (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            style={{
              flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '2px 0', position: 'relative',
            }}
          >
            <span style={{ ...SKB, fontSize: 9, color: on ? 'white' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{s.label}</span>
            {on && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -4, height: 2, background: RED }} />}
          </button>
        );
      })}
    </div>
  );
}
