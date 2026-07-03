'use client';

// ── SWAP — ETH ⇄ USDC in the wallet (Zora-router engine, receipt-true) ────────
//
// Portaled bottom sheet: YOU PAY (input + balance + MAX) → flip ⇅ → YOU RECEIVE
// (live ≈ quote, green). Engine: swapEthUsdc in zoraCoins — the SAME tradeCoin/
// createTradeCall machinery collects use, pointed at the plain pair. The display
// quote debounces (~400ms) and re-quotes if stale at confirm; EXECUTION always
// re-quotes internally, so slippage protection is against a fresh quote.
// MONEY RULES: MAX on the ETH side = balance − GAS_FLOOR_ETH (imported, never
// inlined) and any typed amount breaching the floor is rejected inline; success
// renders ONLY after the mined receipt + actual balance deltas (never the quote).

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom, parseEther } from 'viem';
import { base } from 'viem/chains';
import { swapEthUsdc, quoteSwapEthUsdc, usdcSwapNeedsApproval, errInfo, type SwapDirection } from '@/lib/zoraCoins';
import { preflightTrade, preflightMessage, GAS_FLOOR_ETH } from '@/lib/economy/preflight';
import FrameLoader from '@/components/FrameLoader';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const GREEN = '#4ade80';
const QUOTE_STALE_MS = 20_000;
const QUOTE_DEBOUNCE_MS = 400;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Live balances from the wallet page (display units). */
  ethBalance: number;
  usdcBalance: number;
  /** Fired after a receipt-true swap so the wallet re-reads balances (floor discipline). */
  onSwapped: () => void;
}

const fmtEth = (n: number) => n.toFixed(n < 0.1 ? 5 : 4);
const fmtUsdc = (n: number) => n.toFixed(2);

export default function SwapSheet({ visible, onClose, ethBalance, usdcBalance, onSwapped }: Props) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const sender = (user?.wallet?.address ?? '') as `0x${string}`;

  const [direction, setDirection] = useState<SwapDirection>('ETH_TO_USDC');
  const [payAmount, setPayAmount] = useState('');
  const [quoteOut, setQuoteOut] = useState<number | null>(null); // display units of the receive side
  const [quoting, setQuoting] = useState(false);
  const quoteAtRef = useRef(0);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [phase, setPhase] = useState<'input' | 'swapping' | 'done'>('input');
  const [swapError, setSwapError] = useState<string | null>(null);
  const [doneLine, setDoneLine] = useState('');

  const payEth = direction === 'ETH_TO_USDC';
  const payBalance = payEth ? ethBalance : usdcBalance;
  const maxPay = payEth ? Math.max(0, ethBalance - GAS_FLOOR_ETH) : usdcBalance;
  const payNum = parseFloat(payAmount);
  const validAmount = isFinite(payNum) && payNum > 0;
  const overMax = validAmount && payNum > maxPay + 1e-12;

  // Reset on open/close.
  useEffect(() => {
    if (!visible) return;
    setDirection('ETH_TO_USDC'); setPayAmount(''); setQuoteOut(null);
    setPhase('input'); setSwapError(null); setDoneLine('');
  }, [visible]);

  // First-USDC-swap honesty: pre-read the Permit2 allowance once per open.
  useEffect(() => {
    if (!visible || !sender) return;
    usdcSwapNeedsApproval(sender).then(setNeedsApproval).catch(() => {});
  }, [visible, sender]);

  const amountInUnits = useCallback((amt: number): bigint =>
    payEth ? parseEther(amt.toFixed(18)) : BigInt(Math.round(amt * 1e6)), [payEth]);

  // Live display quote — debounced on amount edits, refreshed on flip.
  useEffect(() => {
    if (!visible || !sender || !validAmount || overMax) { setQuoteOut(null); return; }
    let cancelled = false;
    setQuoting(true);
    const id = window.setTimeout(async () => {
      try {
        const { amountOut } = await quoteSwapEthUsdc({ direction, amountIn: amountInUnits(payNum), sender });
        if (cancelled) return;
        setQuoteOut(payEth ? Number(amountOut) / 1e6 : parseFloat((Number(amountOut) / 1e18).toFixed(8)));
        quoteAtRef.current = Date.now();
      } catch (e) {
        if (!cancelled) { setQuoteOut(null); console.warn('[swap] quote failed:', errInfo(e)); }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [visible, sender, direction, payNum, validAmount, overMax, payEth, amountInUnits]);

  const flip = () => {
    setDirection((d) => (d === 'ETH_TO_USDC' ? 'USDC_TO_ETH' : 'ETH_TO_USDC'));
    setPayAmount(''); setQuoteOut(null); setSwapError(null);
  };

  const doSwap = async () => {
    if (!validAmount || overMax || !sender) return;
    setSwapError(null);

    // Display honesty: a quote older than ~20s re-quotes before we commit
    // (execution re-quotes internally regardless — this keeps the screen true).
    if (Date.now() - quoteAtRef.current > QUOTE_STALE_MS) {
      try {
        const { amountOut } = await quoteSwapEthUsdc({ direction, amountIn: amountInUnits(payNum), sender });
        setQuoteOut(payEth ? Number(amountOut) / 1e6 : parseFloat((Number(amountOut) / 1e18).toFixed(8)));
        quoteAtRef.current = Date.now();
      } catch { /* the execution path is the loud gate */ }
    }

    // PRE-FLIGHT (shared helper): ETH pay = amount + gas floor within balance;
    // USDC pay = USDC balance + the gas sliver Permit2/swap needs.
    const pf = await preflightTrade(
      payEth ? { wallet: sender, requireEth: payNum } : { wallet: sender, requireUsdc: payNum },
    );
    if (!pf.ok) { setSwapError(preflightMessage(pf, { action: 'swap' })); return; }

    setPhase('swapping');
    try {
      const embedded = wallets.find((w) => w.walletClientType === 'privy');
      if (!embedded) throw new Error('Wallet not ready — try again in a moment.');
      await embedded.switchChain(base.id);
      const provider = await embedded.getEthereumProvider();
      const walletClient = createWalletClient({ account: sender, chain: base, transport: custom(provider) });

      const r = await swapEthUsdc({ walletClient, sender, direction, amountIn: amountInUnits(payNum) });
      // RECEIPT-TRUE: r.received is the actual on-chain balance delta.
      setDoneLine(payEth ? `RECEIVED ${fmtUsdc(r.received)} USDC` : `RECEIVED ${fmtEth(r.received)} ETH`);
      setPhase('done');
      onSwapped(); // wallet re-reads balances through its floor discipline
    } catch (e) {
      console.error('[swap] failed:', errInfo(e));
      const m = (e as Error)?.message ?? '';
      setSwapError(m.length > 0 && m.length < 140 ? m : 'The swap didn’t go through — nothing left your wallet. Try again.');
      setPhase('input');
    }
  };

  if (typeof document === 'undefined') return null;

  const panel: React.CSSProperties = {
    background: 'linear-gradient(180deg, #101010 0%, #0a0a0a 100%)',
    border: '0.5px solid #1f1f1f', borderRadius: 2, padding: '14px 14px 12px',
  };
  const rate = validAmount && quoteOut != null && payNum > 0
    ? (payEth ? quoteOut / payNum : payNum / (quoteOut || 1))
    : null;

  return createPortal(
    <>
      <div
        onClick={phase === 'swapping' ? undefined : onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 1100, opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.3s ease' }}
      />
      <div
        data-swipe-exclude
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1101,
          background: '#080808', borderTop: '1px solid rgba(255,255,255,0.08)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
          padding: '20px 20px calc(28px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 2, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.18em', margin: 0 }}>SWAP</p>
          {phase !== 'swapping' && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, margin: -6 }}>
              <span style={{ ...SKR, fontSize: 'var(--fs-16)', color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>×</span>
            </button>
          )}
        </div>

        {phase === 'done' ? (
          <div style={{ textAlign: 'center', padding: '18px 0 6px' }}>
            <p style={{ ...SKB, fontSize: 'var(--fs-14)', color: GREEN, letterSpacing: '0.08em', margin: '0 0 18px' }}>[ {doneLine} ]</p>
            <button onClick={onClose} style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', padding: '12px 0' }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DONE</span>
            </button>
          </div>
        ) : (
          <>
            {/* YOU PAY */}
            <div style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>YOU PAY</span>
                <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>
                  BALANCE {payEth ? `${fmtEth(payBalance)} ETH` : `${fmtUsdc(payBalance)} USDC`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <input
                  inputMode="decimal"
                  value={payAmount}
                  disabled={phase === 'swapping'}
                  onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                  style={{ ...SKB, fontSize: 24, color: '#FFF', background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: 0 }}
                />
                <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.7)' }}>{payEth ? 'ETH' : 'USDC'}</span>
                <button
                  onClick={() => setPayAmount(payEth ? maxPay.toFixed(6) : maxPay.toFixed(2))}
                  style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#FF0000', background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', padding: 0 }}
                >
                  MAX
                </button>
              </div>
              {overMax && (
                <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: '#FF0000', margin: '8px 0 0', lineHeight: 1.4 }}>
                  {payEth
                    ? `Max ${fmtEth(maxPay)} ETH — the rest is kept for network fees.`
                    : `Max ${fmtUsdc(maxPay)} USDC — that's your full balance.`}
                </p>
              )}
            </div>

            {/* FLIP */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
              <button onClick={flip} disabled={phase === 'swapping'} style={{ background: '#0a0a0a', border: '1px solid #1f1f1f', cursor: 'pointer', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 'var(--fs-14)', color: '#FF0000', lineHeight: 1 }}>⇅</span>
              </button>
            </div>

            {/* YOU RECEIVE */}
            <div style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>YOU RECEIVE</span>
                {quoting && <FrameLoader size={11} />}
              </div>
              <p style={{ ...SKB, fontSize: 24, color: GREEN, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                {quoteOut != null ? `≈ ${payEth ? fmtUsdc(quoteOut) : fmtEth(quoteOut)}` : '—'}{' '}
                <span style={{ fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.7)' }}>{payEth ? 'USDC' : 'ETH'}</span>
              </p>
            </div>

            {/* Info line */}
            <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.3)', margin: '10px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {rate != null ? `1 ETH ≈ $${rate.toFixed(0)} · ` : ''}fee ~0.1%{payEth ? ' · gas reserve kept' : ''}
              {!payEth && needsApproval ? ' · first USDC swap includes a one-time approval' : ''}
            </p>

            {swapError && (
              <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: '#FF0000', margin: '10px 0 0', lineHeight: 1.4 }}>{swapError}</p>
            )}

            {phase === 'swapping' ? (
              <div style={{ width: '100%', border: '1px solid rgba(255,0,0,0.55)', padding: '13px 0', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 46 }}>
                <FrameLoader size={23.5} />
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {!payEth && needsApproval ? 'STEP 1 · APPROVING USDC, THEN SWAPPING…' : 'SWAPPING…'}
                </span>
              </div>
            ) : (
              <button
                onClick={doSwap}
                disabled={!validAmount || overMax || quoteOut == null}
                style={{ width: '100%', background: !validAmount || overMax || quoteOut == null ? 'rgba(255,0,0,0.4)' : '#FF0000', border: 'none', cursor: !validAmount || overMax || quoteOut == null ? 'default' : 'pointer', padding: '14px 0', marginTop: 14 }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CONFIRM SWAP</span>
              </button>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
