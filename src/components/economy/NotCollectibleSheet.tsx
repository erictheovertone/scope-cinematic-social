'use client';

// ── NotCollectibleSheet ──────────────────────────────────────────────────────
//
// The quiet brand gate for a COLLECT tap on an UNMINTED post. An unminted post
// has no coin/token to read, so it must NEVER reach a market sheet (which fires
// coin reads against a null address and crashes). One line + dismiss, in the
// app's sheet language (black, SK-Modernist, red accent, sharp corners).

import { useEffect } from 'react';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function NotCollectibleSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // Hide the footer while up (same takeover discipline as CollectSheet).
  useEffect(() => {
    if (!visible) return;
    document.documentElement.dataset.suiteOpen = '1';
    return () => { delete document.documentElement.dataset.suiteOpen; };
  }, [visible]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 300,
          opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity 0.35s ease',
        }}
      />
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
          backgroundColor: '#111111', borderTop: '1px solid rgba(229,225,219,0.12)',
          padding: '26px 24px calc(30px + env(safe-area-inset-bottom, 0px))',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ width: 40, height: 2, backgroundColor: 'rgba(229,225,219,0.2)' }} />
        </div>
        <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
          Not yet collectible
        </p>
        <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.55)', lineHeight: 1.5, margin: '0 0 22px' }}>
          This post hasn&rsquo;t been minted, so there&rsquo;s nothing to collect yet.
        </p>
        <button
          onClick={onClose}
          className="press-row"
          style={{ ...SKB, width: '100%', fontSize: 'var(--fs-10)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: '1px solid rgba(229,225,219,0.2)', cursor: 'pointer', padding: '13px 0', touchAction: 'manipulation' }}
        >
          Got it
        </button>
      </div>
    </>
  );
}
