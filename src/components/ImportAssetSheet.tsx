'use client';

// ── IMPORT ASSET — add an ERC-20 (Base) to the wallet BALANCES list ───────────
//
// Address-paste only (no search/discovery). Validate format → contract must
// answer symbol()+decimals() on Base → persist per user (user_assets table,
// localStorage fallback pre-migration) → the wallet appends the row. Portaled
// sheet, house pattern; inline errors, never a silent failure.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveErc20, addUserAsset, type UserAsset } from '@/lib/userAssets';
import FrameLoader from '@/components/FrameLoader';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface Props {
  visible: boolean;
  onClose: () => void;
  userUuid: string | null;
  onAdded: (asset: UserAsset) => void;
}

export default function ImportAssetSheet({ visible, onClose, userUuid, onAdded }: Props) {
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) { setAddress(''); setBusy(false); setError(null); }
  }, [visible]);

  const doImport = async () => {
    if (busy || !address.trim()) return;
    setBusy(true); setError(null);
    const resolved = await resolveErc20(address);
    if ('error' in resolved) { setError(resolved.error); setBusy(false); return; }
    if (!userUuid) { setError('Wallet not ready — try again in a moment.'); setBusy(false); return; }
    const where = await addUserAsset(userUuid, resolved);
    if (where === 'duplicate') { setError(`${resolved.symbol} is already in your list.`); setBusy(false); return; }
    onAdded(resolved);
    setBusy(false);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 1100, opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.3s ease' }}
      />
      <div
        data-swipe-exclude
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1101,
          background: '#080808', borderTop: '1px solid rgba(229,225,219,0.08)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
          padding: '20px 20px calc(28px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 2, backgroundColor: 'rgba(229,225,219,0.12)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.18em', margin: 0 }}>IMPORT ASSET</p>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, margin: -6 }}>
            <span style={{ ...SKR, fontSize: 'var(--fs-16)', color: 'rgba(229,225,219,0.5)', lineHeight: 1 }}>×</span>
          </button>
        </div>

        <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.5)', lineHeight: 1.5, margin: '0 0 12px' }}>
          Paste an ERC-20 contract address on Base. The token appears in your balances list.
        </p>
        <div style={{ border: '1px solid rgba(229,225,219,0.18)', padding: '0 12px' }}>
          <input
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={address}
            disabled={busy}
            onChange={(e) => { setAddress(e.target.value); setError(null); }}
            placeholder="0x…"
            style={{ ...SKR, fontSize: 16, color: '#E5E1DB', background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: '12px 0' }}
          />
        </div>
        {error && (
          <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'var(--danger)', margin: '10px 0 0', lineHeight: 1.4 }}>{error}</p>
        )}

        {busy ? (
          <div style={{ width: '100%', border: '1px solid rgba(229,225,219,0.55)', padding: '13px 0', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 46 }}>
            <FrameLoader size={23.5} />
            <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.1em' }}>CHECKING TOKEN…</span>
          </div>
        ) : (
          <button
            onClick={doImport}
            disabled={!address.trim()}
            style={{ width: '100%', background: !address.trim() ? 'rgba(229,225,219,0.4)' : '#E5E1DB', border: 'none', cursor: !address.trim() ? 'default' : 'pointer', padding: '14px 0', marginTop: 14 }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>IMPORT</span>
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
