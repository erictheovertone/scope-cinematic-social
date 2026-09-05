"use client";

import { useState } from "react";
import { softDeletePost } from "@/lib/postsService";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface DeletePostSheetProps {
  visible: boolean;
  postId: string;
  userId: string;
  onClose: () => void;
  onDeleted: (postId: string) => void;
}

export default function DeletePostSheet({ visible, postId, userId, onClose, onDeleted }: DeletePostSheetProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const success = await softDeletePost(postId, userId);
    if (success) {
      onDeleted(postId);
      onClose();
    } else {
      setError("Failed to delete post. Please try again.");
    }
    setDeleting(false);
  };

  const handleClose = () => {
    if (deleting) return;
    setError(null);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          zIndex: 500,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: '#080808',
        borderTop: '1px solid rgba(229,225,219,0.08)',
        zIndex: 501,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        padding: '28px 24px calc(48px + var(--safe-bottom))', /* X3 §3 — bottom sheet: clear the home indicator */
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ width: 36, height: 2, backgroundColor: 'rgba(229,225,219,0.12)' }} />
        </div>

        {/* Title */}
        <p style={{ ...SKB, fontSize: 'var(--fs-16)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 16px' }}>
          DELETE POST
        </p>

        {/* Warning */}
        <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(229,225,219,0.5)', lineHeight: 1.6, margin: '0 0 8px' }}>
          Your post will be hidden from your profile and the Scope feed.
        </p>
        <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(229,225,219,0.5)', lineHeight: 1.6, margin: '0 0 32px' }}>
          The token remains on-chain permanently. Anyone who has collected this post keeps their holdings.
        </p>

        {/* On-chain notice */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', border: '1px solid rgba(229,225,219,0.08)', marginBottom: 28 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: 'rgba(229,225,219,0.3)', flexShrink: 0, marginTop: 5 }} />
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.6, margin: 0 }}>
            THIS ACTION CANNOT BE UNDONE. THE TOKEN LIVES ON BASE FOREVER.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px', textAlign: 'center' }}>
            {error}
          </p>
        )}

        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            width: '100%',
            background: deleting ? 'rgba(147,18,18,0.45)' : 'var(--danger)',
            border: 'none',
            cursor: deleting ? 'default' : 'pointer',
            padding: '14px 0',
            marginBottom: 10,
          }}
        >
          <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {deleting ? 'DELETING...' : 'DELETE POST'}
          </span>
        </button>

        {/* Cancel button */}
        <button
          onClick={handleClose}
          disabled={deleting}
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px solid rgba(229,225,219,0.15)',
            cursor: deleting ? 'default' : 'pointer',
            padding: '12px 0',
          }}
        >
          <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            CANCEL
          </span>
        </button>
      </div>
    </>
  );
}
