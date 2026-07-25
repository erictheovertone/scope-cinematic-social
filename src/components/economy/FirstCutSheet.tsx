'use client';
// ── FirstCutSheet (Brief M8) ─────────────────────────────────────────────────
//
// The First Cut detail as a bottom sheet — the tap destination for the action-row
// FC icon on post views (PostModal). Replaces the old inline FirstCutLedger block:
// the post view declutters to just the icon; tapping it slides this up with the
// founding-collectors ranked list. Reuses FirstCutLedger in its always-expanded
// `sheet` variant (no caret, no whip — the action-row icon owns the whip).
//
// Standard Scope sheet chrome: black, slide-up over a dim backdrop, raises the body
// `suiteOpen` flag (hides the footer pill / blocks the rotate-to-theatre hook while up).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import FirstCutLedger from '@/components/economy/FirstCutLedger';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function FirstCutSheet({
  coinAddress,
  postId,
  onClose,
  onHolderTap,
}: {
  coinAddress: string;
  postId?: string;
  onClose: () => void;
  onHolderTap?: (username: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  // Takeover discipline — same as the collect / deck / create sheets.
  useEffect(() => {
    document.documentElement.dataset.suiteOpen = '1';
    window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    return () => {
      delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    };
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 130,
          background: 'rgba(0,0,0,0.6)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 250ms ease',
        }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 131,
          maxWidth: '30rem', margin: '0 auto',
          background: '#000',
          borderTop: '1px solid rgba(229,225,219,0.1)',
          padding: '16px 16px calc(28px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '70vh',
          overflowY: 'auto',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Close affordance — the ledger's own header carries the FIRST CUT / N-10 title. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', ...SKB, fontSize: 'var(--fs-11)', color: 'rgba(229,225,219,0.5)', padding: 0, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <FirstCutLedger coinAddress={coinAddress} postId={postId} onHolderTap={onHolderTap} variant="sheet" />
      </div>
    </>,
    document.body,
  );
}
