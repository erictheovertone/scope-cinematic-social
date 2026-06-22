"use client";

/**
 * AddToPalette — the gated "save current edits as a Look" action (Brief: ADD TO
 * PALETTE). Shown in both the HISTORY view and the PALETTE view. Free users tap →
 * UpsellSheet (the existing Pro-lock pattern, via onUpsell); Pro users get an
 * inline name field → onSave(name). View/UI only; persistence is the caller's.
 */

import { useState } from 'react';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';

interface AddToPaletteProps {
  isPro: boolean;
  onUpsell: () => void;
  onSave: (name: string) => void;
}

export default function AddToPalette({ isPro, onUpsell, onSave }: AddToPaletteProps) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const start = () => {
    if (!isPro) { onUpsell(); return; }      // free → upsell, do not save
    const d = new Date();
    setName(`Look ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    setNaming(true);
  };
  const save = () => { onSave(name.trim() || 'Untitled Look'); setNaming(false); setName(''); };
  const cancel = () => { setNaming(false); setName(''); };

  if (naming) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          placeholder="LOOK NAME"
          style={{ ...SKB, flex: 1, minWidth: 0, fontSize: 'var(--fs-10)', color: 'white', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', padding: '7px 9px', textTransform: 'uppercase', letterSpacing: '0.06em', outline: 'none' }}
        />
        <button onClick={save} style={{ background: RED, border: 'none', cursor: 'pointer', padding: '7px 12px' }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#000', textTransform: 'uppercase', letterSpacing: '0.08em' }}>SAVE</span>
        </button>
        <button onClick={cancel} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: '7px 10px' }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>✕</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', background: 'transparent', border: `1px solid ${RED}`, cursor: 'pointer', padding: '9px 12px' }}
    >
      <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: RED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>+ ADD TO PALETTE</span>
      {!isPro && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )}
    </button>
  );
}
