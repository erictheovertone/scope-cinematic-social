'use client';

// ── CoinCreatedConfirmation — Brief C3-14: the one shared coin-created mark ─────
//
// ONE confirmation, fired on BOTH mint paths — the end-of-post-flow mint
// (CreatePostFlow) and the feed create-coin sheet (CreateCoinSheet). It is
// RECEIPT-DRIVEN, never optimistic: both callers reach the success beat only
// after Zora's createCoin has returned a parsed on-chain deployment (the SDK
// throws on a revert / dropped tx), so this renders only on a confirmed coin.
// The matching FAILURE state (reverted / dropped → RETRY) stays in each path's
// existing distinct failure surface (MintPromptSheet 'coin-failed';
// CreateCoinSheet error) — those are already receipt-gated and path-specific.
//
// The celebration reuses the app's codification vocabulary — the red corner
// brackets snapping onto the mark (the same cornerReveal used when a post is
// codified in MintPromptSheet / ProCelebration) + a scan line — so coining a
// post reads as the same ceremony everywhere.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface Props {
  /** The confirmed ticker (already normalized). */
  ticker: string;
  /** Primary action — "VIEW YOUR POST". Caller navigates (both land on the
   *  creator's profile, where the just-coined post now lives). */
  onView: () => void;
  /** Secondary / dismiss. */
  onDone: () => void;
}

export default function CoinCreatedConfirmation({ ticker, onView, onDone }: Props) {
  // Two beats: the bracket snap, then the headline + actions fade up.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 650);
    return () => clearTimeout(t);
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-testid="coin-created-confirm"
      data-swipe-exclude
      style={{ position: 'fixed', inset: 0, zIndex: 1250, background: 'var(--canvas)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 32px' }}
    >
      {/* Scan line — the codification pass. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'var(--ink-100)', animation: 'ccScan 1.1s ease-in-out forwards' }} />

      {/* The mark: the ticker, codified — corner brackets snap around it. */}
      <div style={{ position: 'relative', width: 132, height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 26, height: 26, borderTop: '2px solid var(--ink-100)', borderLeft: '2px solid var(--ink-100)', animation: 'ccCorner 0.55s ease forwards', opacity: 0 }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: 26, height: 26, borderTop: '2px solid var(--ink-100)', borderRight: '2px solid var(--ink-100)', animation: 'ccCorner 0.55s ease 0.1s forwards', opacity: 0 }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 26, height: 26, borderBottom: '2px solid var(--ink-100)', borderLeft: '2px solid var(--ink-100)', animation: 'ccCorner 0.55s ease 0.2s forwards', opacity: 0 }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderBottom: '2px solid var(--ink-100)', borderRight: '2px solid var(--ink-100)', animation: 'ccCorner 0.55s ease 0.3s forwards', opacity: 0 }} />
        <span data-testid="coin-created-ticker" style={{ ...BOLD, fontSize: 'var(--fs-20)', color: 'var(--ink-100)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {ticker}
        </span>
      </div>

      <p style={{ ...BOLD, fontSize: 'var(--fs-22)', color: 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 10px', textAlign: 'center', opacity: revealed ? 1 : 0, transform: revealed ? 'translateY(0)' : 'translateY(14px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        Coin created
      </p>
      <p style={{ ...REG, fontSize: 'var(--fs-11)', color: 'rgb(var(--ink-rgb) / 0.5)', margin: '0 0 36px', textAlign: 'center', lineHeight: 1.5, opacity: revealed ? 1 : 0, transition: 'opacity 0.6s ease 0.15s' }}>
        {ticker} is live on Base. You earn on every trade, forever.
      </p>

      <div style={{ width: '100%', maxWidth: '20rem', opacity: revealed ? 1 : 0, transform: revealed ? 'translateY(0)' : 'translateY(14px)', transition: 'opacity 0.6s ease 0.25s, transform 0.6s ease 0.25s' }}>
        <button
          onClick={onView}
          style={{ width: '100%', background: 'var(--ink-100)', border: 'none', cursor: 'pointer', padding: '14px 0', marginBottom: 8 }}
        >
          <span style={{ ...BOLD, fontSize: 'var(--fs-12)', color: 'var(--on-ink)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>VIEW YOUR POST</span>
        </button>
        <button
          onClick={onDone}
          style={{ width: '100%', background: 'transparent', border: '1px solid rgb(var(--ink-rgb) / 0.15)', cursor: 'pointer', padding: '12px 0' }}
        >
          <span style={{ ...BOLD, fontSize: 'var(--fs-10)', color: 'rgb(var(--ink-rgb) / 0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DONE</span>
        </button>
      </div>

      <style>{`
        @keyframes ccScan { 0% { top: 0; opacity: 1; } 100% { top: 100%; opacity: 0; } }
        @keyframes ccCorner { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>,
    document.body,
  );
}
