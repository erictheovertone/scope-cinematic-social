'use client';
// ── DESKTOP VIEWING MODES — "CHOOSE YOUR PERSPECTIVE" ─────────────────────────
// The desktop-presented modes menu, opened by the home logomark. Reuses the
// baked two-state card PNGs (theatre/screening/mirage/feed) from
// /public/viewing-modes; LIGHTBOX has no baked asset so it's a brand-built card.
// Copy + structure from the "CHOOSE YOUR PERSPECTIVE" reference (layout/copy
// only — brand fonts + real card art here). Rail stays visible (offset left).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(255,255,255,0.12)';
const RED = '#f20d0d';
const RAIL_W = 71; // keep the global rail visible

export type ViewingMode = 'theatre' | 'screening' | 'lightbox' | 'mirage' | 'feed';

// The baked cards; LIGHTBOX is built (no PNG). Order per the reference.
const CARDS: { mode: ViewingMode; label: string; baked: boolean; sub: string; coming?: boolean }[] = [
  { mode: 'theatre',   label: 'Theatre',        baked: true,  sub: 'Full-screen theatrical viewing' },
  { mode: 'screening', label: 'Screening Room', baked: true,  sub: 'The discovery feed' },
  { mode: 'lightbox',  label: 'Lightbox',       baked: false, sub: 'One frame, full attention' },
  { mode: 'mirage',    label: 'Mirage',         baked: true,  sub: 'The cinematic home feed', coming: true },
  { mode: 'feed',      label: 'Feed',           baked: true,  sub: 'The standard grid' },
];

// The three "engineered for" pillars + thin viewfinder glyphs.
const PILLARS: { label: string; glyph: React.ReactNode }[] = [
  { label: 'CINEMATIC CONNECTION', glyph: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="8.5" cy="9" r="3" stroke={RED} strokeWidth="1.3"/><circle cx="15.5" cy="9" r="3" stroke={RED} strokeWidth="1.3"/><path d="M4 20c0-2.8 2-4.5 4.5-4.5M20 20c0-2.8-2-4.5-4.5-4.5" stroke={RED} strokeWidth="1.3" strokeLinecap="round"/></svg>
  ) },
  { label: 'IMMERSIVE DESIGN', glyph: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5.5" width="17" height="13" rx="1" stroke={RED} strokeWidth="1.3"/><path d="M3.5 9.5h17M8 5.5v13" stroke={RED} strokeWidth="1.3"/></svg>
  ) },
  { label: 'ADAPTIVE EXPERIENCES', glyph: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18" stroke={RED} strokeWidth="1.3"/><circle cx="12" cy="12" r="4.5" stroke={RED} strokeWidth="1.3"/></svg>
  ) },
];

interface Props {
  currentMode: ViewingMode;
  onClose: () => void;
  /** Runs the host's mode-switch (Part 1: visual select + close). */
  onSelect: (mode: ViewingMode) => void;
}

export default function DesktopViewingModes({ currentMode, onClose, onSelect }: Props) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [selected, setSelected] = useState<ViewingMode>(currentMode);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const pick = (mode: ViewingMode) => {
    setSelected(mode);
    window.setTimeout(() => onSelect(mode), reduced ? 0 : 260); // light the card, then commit
  };

  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)', opacity: mounted ? 1 : 0, transition: reduced ? 'none' : 'opacity 220ms ease' }} />
      {/* content panel — offset right of the rail, scrollable, centered column */}
      <div style={{ position: 'absolute', top: 0, left: RAIL_W, right: 0, bottom: 0, overflowY: 'auto' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'fixed', top: 26, right: 34, zIndex: 2, background: 'transparent', border: 'none', cursor: 'pointer', ...SKR, fontSize: 22, color: 'rgba(255,255,255,0.55)', lineHeight: 1, padding: 4 }}>✕</button>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '72px 56px 96px', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: reduced ? 'none' : 'opacity 320ms ease, transform 320ms cubic-bezier(0.16,0.84,0.3,1)' }}>

          {/* ── HEADER: title + intro ── */}
          <p style={{ ...SKB, fontSize: 12, color: RED, textTransform: 'uppercase', letterSpacing: '0.24em', margin: '0 0 18px' }}>+ VIEWING MODES</p>
          <h1 style={{ ...SKB, fontSize: 54, lineHeight: 0.98, letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase', margin: '0 0 22px' }}>Choose Your<br />Perspective</h1>
          <p style={{ ...SKR, fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            Scope adapts to the way you want to experience cinematic moments with others. Every mode reframes the same work — from a shared theatrical screening to a single frame in full focus. Choose how you want to watch.
          </p>

          {/* ── MODES ENGINEERED FOR ── */}
          <div style={{ margin: '48px 0 0' }}>
            <p style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.22em', margin: '0 0 20px' }}>MODES ENGINEERED FOR</p>
            <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
              {PILLARS.map((p) => (
                <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ display: 'flex', flexShrink: 0 }}>{p.glyph}</span>
                  <span style={{ ...SKB, fontSize: 12, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{p.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: HAIR, margin: '44px 0 36px' }} />

          {/* ── THE 5 MODE CARDS (SELECTED state) ── */}
          <p style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.22em', margin: '0 0 22px' }}>SELECT A FORMAT</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 22 }}>
            {CARDS.map((card) => {
              const isSel = selected === card.mode;
              return (
                <button
                  key={card.mode}
                  onClick={() => { if (card.coming) { setSelected(card.mode); return; } pick(card.mode); }}
                  aria-label={`${card.label} — ${card.coming ? 'coming soon' : card.sub}`}
                  aria-pressed={isSel}
                  style={{ position: 'relative', width: '100%', aspectRatio: '366 / 123', borderRadius: 2, overflow: 'hidden', background: '#0a0a0a', border: isSel ? `1px solid ${RED}` : `1px solid ${HAIR}`, padding: 0, cursor: 'pointer', outline: 'none', opacity: card.coming ? 0.72 : 1, transition: 'border-color 200ms ease, transform 140ms ease' }}
                >
                  {card.baked ? (
                    <>
                      <img src={`/viewing-modes/${card.mode}-default.png?v=2`} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
                      <img src={`/viewing-modes/${card.mode}-active.png?v=2`} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: isSel ? 1 : 0, transition: reduced ? 'none' : 'opacity 260ms ease' }} />
                    </>
                  ) : (
                    /* LIGHTBOX — brand-built card (no baked asset) */
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '18px 20px', background: isSel ? 'linear-gradient(135deg, rgba(242,13,13,0.16), rgba(0,0,0,0))' : '#0a0a0a' }}>
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><rect x="4.5" y="4.5" width="15" height="15" rx="1" stroke={isSel ? RED : 'rgba(255,255,255,0.7)'} strokeWidth="1.3"/><path d="M9 9l6 6M15 9l-6 6" stroke={isSel ? RED : 'rgba(255,255,255,0.35)'} strokeWidth="1.1"/></svg>
                      <div>
                        <p style={{ ...SKB, fontSize: 16, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 3px' }}>Lightbox</p>
                        <p style={{ ...SKR, fontSize: 10.5, color: isSel ? RED : 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>{isSel ? 'SELECTED' : card.sub}</p>
                      </div>
                    </div>
                  )}
                  {/* COMING chip — an unbuilt mode reacts (labels itself) but doesn't
                      navigate; never a dead click. */}
                  {card.coming ? (
                    <span style={{ position: 'absolute', top: 10, right: 12, ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.14em', background: 'rgba(0,0,0,0.6)', padding: '3px 7px', borderRadius: 1 }}>COMING</span>
                  ) : card.baked && isSel && (
                    <span style={{ position: 'absolute', top: 10, right: 12, ...SKB, fontSize: 9, color: RED, textTransform: 'uppercase', letterSpacing: '0.14em', background: 'rgba(0,0,0,0.55)', padding: '3px 7px', borderRadius: 1 }}>SELECTED</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', margin: '48px 0 0' }}>
            <img src="/logomark-plain-white.png" alt="Scope" style={{ width: 38, height: 24, objectFit: 'contain', opacity: 0.85 }} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
