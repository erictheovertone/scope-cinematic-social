'use client';

// ── SWAP — ETH ⇄ USDC and ZORA ⇄ USDC in the wallet (Zora-router engine) ──────
//
// Portaled bottom sheet: pair chips → YOU PAY (input + balance + MAX) → flip ⇅
// → YOU RECEIVE (live ≈ quote, green). Engine: swapTokens in zoraCoins — the
// SAME tradeCoin/createTradeCall machinery collects use; both pairs verified
// routable live. Display quote debounces (~400ms) and re-quotes if stale at
// confirm; EXECUTION always re-quotes internally (slippage guards a fresh
// quote). MONEY RULES: MAX on the ETH side = balance − GAS_FLOOR_ETH (imported,
// never inlined), typed amounts breaching it are rejected inline; success
// renders ONLY after the mined receipt + actual balance deltas (never the
// quote). CASH OUT mode (the earnings row): prefilled ZORA→USDC, success reads
// "CASHED OUT $X.XX".

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { swapTokens, quoteSwap, erc20SwapNeedsApproval, swapTokenDecimals, errInfo, type SwapToken } from '@/lib/zoraCoins';
import { preflightTrade, preflightMessage, GAS_FLOOR_ETH } from '@/lib/economy/preflight';
import { getEthUsdRate } from '@/lib/coingecko';
import FrameLoader from '@/components/FrameLoader';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const GREEN = '#4ade80';
const QUOTE_STALE_MS = 20_000;
const QUOTE_DEBOUNCE_MS = 400;

const PAIRS: [SwapToken, SwapToken][] = [['ETH', 'USDC'], ['ZORA', 'USDC']];

export interface SwapInitial {
  sell: SwapToken;
  buy: SwapToken;
  amount?: string;
  /** Earnings cash-out framing: success reads "CASHED OUT $X.XX". */
  cashOut?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Live balances from the wallet page (display units). */
  ethBalance: number;
  usdcBalance: number;
  zoraBalance: number;
  /** Fired after a receipt-true swap so the wallet re-reads balances (floor discipline). */
  onSwapped: () => void;
  /** Opening state (the CASH OUT entry pre-fills ZORA→USDC + full balance). */
  initial?: SwapInitial | null;
}

const fmtToken = (n: number, t: SwapToken) =>
  t === 'USDC' ? n.toFixed(2)
  : t === 'ZORA' ? (n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2))
  : n.toFixed(n < 0.1 ? 5 : 4);

export default function SwapSheet({ visible, onClose, ethBalance, usdcBalance, zoraBalance, onSwapped, initial }: Props) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const sender = (user?.wallet?.address ?? '') as `0x${string}`;

  const [sellToken, setSellToken] = useState<SwapToken>('ETH');
  const [buyToken, setBuyToken] = useState<SwapToken>('USDC');
  const [cashOut, setCashOut] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  // ENTER-AS-USD (ETH→USDC only, where the tiny ETH decimals confuse). The user
  // types dollars; we convert to ETH at the live spot and feed that ETH to the
  // engine — payAmount stays the token amount, so the wei math is untouched.
  const [usdMode, setUsdMode] = useState(true);
  const [payUsd, setPayUsd] = useState('');
  const [spotUsd, setSpotUsd] = useState<number | null>(null);
  const [quoteOut, setQuoteOut] = useState<number | null>(null); // display units of the receive side
  const [quoting, setQuoting] = useState(false);
  const quoteAtRef = useRef(0);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [phase, setPhase] = useState<'input' | 'swapping' | 'done'>('input');
  const [swapError, setSwapError] = useState<string | null>(null);
  const [doneLine, setDoneLine] = useState('');

  const balances: Record<SwapToken, number> = { ETH: ethBalance, USDC: usdcBalance, ZORA: zoraBalance };
  const payBalance = balances[sellToken];
  const maxPay = sellToken === 'ETH' ? Math.max(0, ethBalance - GAS_FLOOR_ETH) : payBalance;
  const payNum = parseFloat(payAmount);
  const validAmount = isFinite(payNum) && payNum > 0;
  const overMax = validAmount && payNum > maxPay + 1e-12;
  // USD-first entry is offered only on the ETH→USDC leg (the decimals-confusion
  // case) and only once the live spot has loaded.
  const usdEntry = usdMode && sellToken === 'ETH' && buyToken === 'USDC' && spotUsd != null;

  // Type dollars → set the underlying ETH amount at the live spot (6dp = wei-safe
  // for the engine's parseUnits; the exact swap still quotes on this ETH amount).
  const setPayFromUsd = (usdStr: string) => {
    setPayUsd(usdStr);
    const u = parseFloat(usdStr);
    setPayAmount(spotUsd && isFinite(u) && u > 0 ? (u / spotUsd).toFixed(6) : '');
  };

  // Reset on open — honoring the CASH OUT prefill when provided.
  useEffect(() => {
    if (!visible) return;
    setSellToken(initial?.sell ?? 'ETH');
    setBuyToken(initial?.buy ?? 'USDC');
    setCashOut(!!initial?.cashOut);
    setPayAmount(initial?.amount ?? '');
    setPayUsd(''); setUsdMode(true);
    setQuoteOut(null); setPhase('input'); setSwapError(null); setDoneLine('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Footer takeover — bottom-anchored money sheet over the wallet's pill: same escape
  // class as the collect sheet (frosted pill bleeds above the panel on iOS). Emit the
  // body-level flag so the toolbar stands down while SWAP is up.
  useEffect(() => {
    if (!visible) return;
    document.documentElement.dataset.suiteOpen = '1';
    window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    return () => {
      delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    };
  }, [visible]);

  // Live ETH→USD spot for the dollar entry (refreshed each open).
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    getEthUsdRate().then((r) => { if (alive) setSpotUsd(r); }).catch(() => {});
    return () => { alive = false; };
  }, [visible]);

  // First-swap honesty: pre-read the Permit2 allowance for the current sell token.
  useEffect(() => {
    if (!visible || !sender) return;
    if (sellToken === 'ETH') { setNeedsApproval(false); return; }
    erc20SwapNeedsApproval(sender, sellToken).then(setNeedsApproval).catch(() => {});
  }, [visible, sender, sellToken]);

  const amountInUnits = useCallback((amtStr: string): bigint => {
    try { return parseUnits(amtStr as `${number}`, swapTokenDecimals(sellToken)); }
    catch { return BigInt(0); }
  }, [sellToken]);

  // Live display quote — debounced on amount edits, refreshed on flip/pair.
  useEffect(() => {
    if (!visible || !sender || !validAmount || overMax) { setQuoteOut(null); return; }
    let cancelled = false;
    setQuoting(true);
    const id = window.setTimeout(async () => {
      try {
        const units = amountInUnits(payAmount);
        if (units <= BigInt(0)) { if (!cancelled) setQuoteOut(null); return; }
        const { amountOut } = await quoteSwap({ sell: sellToken, buy: buyToken, amountIn: units, sender });
        if (cancelled) return;
        setQuoteOut(Number(amountOut) / 10 ** swapTokenDecimals(buyToken));
        quoteAtRef.current = Date.now();
      } catch (e) {
        if (!cancelled) { setQuoteOut(null); console.warn('[swap] quote failed:', errInfo(e)); }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [visible, sender, sellToken, buyToken, payAmount, validAmount, overMax, amountInUnits]);

  const flip = () => {
    setSellToken(buyToken); setBuyToken(sellToken);
    setPayAmount(''); setPayUsd(''); setQuoteOut(null); setSwapError(null); setCashOut(false);
  };
  const setPair = (a: SwapToken, b: SwapToken) => {
    if ((sellToken === a && buyToken === b) || (sellToken === b && buyToken === a)) return;
    setSellToken(a); setBuyToken(b);
    setPayAmount(''); setPayUsd(''); setQuoteOut(null); setSwapError(null); setCashOut(false);
  };

  const doSwap = async () => {
    if (!validAmount || overMax || !sender) return;
    setSwapError(null);

    // Display honesty: a quote older than ~20s re-quotes before we commit
    // (execution re-quotes internally regardless — this keeps the screen true).
    if (Date.now() - quoteAtRef.current > QUOTE_STALE_MS) {
      try {
        const { amountOut } = await quoteSwap({ sell: sellToken, buy: buyToken, amountIn: amountInUnits(payAmount), sender });
        setQuoteOut(Number(amountOut) / 10 ** swapTokenDecimals(buyToken));
        quoteAtRef.current = Date.now();
      } catch { /* the execution path is the loud gate */ }
    }

    // PRE-FLIGHT (shared helper): ETH pay = amount + gas floor; USDC pay = USDC
    // balance + gas sliver; ZORA pay = held ZORA + gas sliver.
    const pf = await preflightTrade(
      sellToken === 'ETH' ? { wallet: sender, requireEth: payNum }
      : sellToken === 'USDC' ? { wallet: sender, requireUsdc: payNum }
      : { wallet: sender, coin: { have: zoraBalance, need: payNum } },
    );
    if (!pf.ok) { setSwapError(preflightMessage(pf, { action: 'swap', ticker: 'ZORA' })); return; }

    setPhase('swapping');
    try {
      const embedded = wallets.find((w) => w.walletClientType === 'privy');
      if (!embedded) throw new Error('Wallet not ready — try again in a moment.');
      await embedded.switchChain(base.id);
      const provider = await embedded.getEthereumProvider();
      const walletClient = createWalletClient({ account: sender, chain: base, transport: custom(provider) });

      const r = await swapTokens({ walletClient, sender, sell: sellToken, buy: buyToken, amountIn: amountInUnits(payAmount) });
      // RECEIPT-TRUE: r.received is the actual on-chain balance delta.
      setDoneLine(
        cashOut && buyToken === 'USDC'
          ? `CASHED OUT $${r.received.toFixed(2)}`
          : `RECEIVED ${fmtToken(r.received, buyToken)} ${buyToken}`,
      );
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
  // Rate line: dollar-anchored — per-ETH for the ETH pair, per-1K ZORA for the earnings pair.
  const usdSide = quoteOut != null && validAmount ? (buyToken === 'USDC' ? quoteOut : payNum) : null;
  const tokenSide = quoteOut != null && validAmount ? (buyToken === 'USDC' ? payNum : quoteOut) : null;
  const pairToken: SwapToken = sellToken === 'USDC' ? buyToken : sellToken;
  const rate = usdSide != null && tokenSide != null && tokenSide > 0 ? usdSide / tokenSide : null;

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
          background: '#080808', borderTop: '1px solid rgba(229,225,219,0.08)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
          padding: '20px 20px calc(28px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 2, backgroundColor: 'rgba(229,225,219,0.12)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.18em', margin: 0 }}>
            {cashOut ? 'CASH OUT' : 'SWAP'}
          </p>
          {phase !== 'swapping' && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, margin: -6 }}>
              <span style={{ ...SKR, fontSize: 'var(--fs-16)', color: 'rgba(229,225,219,0.5)', lineHeight: 1 }}>×</span>
            </button>
          )}
        </div>

        {phase === 'done' ? (
          <div style={{ textAlign: 'center', padding: '18px 0 6px' }}>
            <p style={{ ...SKB, fontSize: 'var(--fs-14)', color: GREEN, letterSpacing: '0.08em', margin: '0 0 18px' }}>[ {doneLine} ]</p>
            <button onClick={onClose} style={{ width: '100%', background: 'transparent', border: '1px solid rgba(229,225,219,0.15)', cursor: 'pointer', padding: '12px 0' }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DONE</span>
            </button>
          </div>
        ) : (
          <>
            {/* Pair chips */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {PAIRS.map(([a, b]) => {
                const active = (sellToken === a && buyToken === b) || (sellToken === b && buyToken === a);
                return (
                  <button
                    key={`${a}-${b}`}
                    onClick={() => setPair(a, b)}
                    disabled={phase === 'swapping'}
                    style={{
                      ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.08em', padding: '7px 12px', cursor: 'pointer',
                      background: 'transparent', border: `1px solid ${active ? '#2a2a2a' : 'rgba(229,225,219,0.07)'}`,
                      color: active ? '#E5E1DB' : 'rgba(229,225,219,0.35)',
                    }}
                  >
                    {a} ⇄ {b}
                  </button>
                );
              })}
            </div>

            {/* YOU PAY */}
            <div style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.35)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>YOU PAY</span>
                  {/* $ / Ξ entry toggle — offered on the ETH→USDC leg only. */}
                  {sellToken === 'ETH' && buyToken === 'USDC' && spotUsd != null && (
                    <button
                      onClick={() => setUsdMode((m) => { const next = !m; if (next) setPayUsd(payAmount && spotUsd ? (parseFloat(payAmount) * spotUsd).toFixed(2) : ''); return next; })}
                      style={{ ...SKB, fontSize: 'var(--fs-7)', letterSpacing: '0.08em', color: usdMode ? '#E5E1DB' : 'rgba(229,225,219,0.45)', background: 'transparent', border: '1px solid rgba(229,225,219,0.15)', cursor: 'pointer', padding: '2px 6px', textTransform: 'uppercase' }}
                    >
                      {usdMode ? '$ USD' : 'Ξ ETH'}
                    </button>
                  )}
                </div>
                <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.35)', letterSpacing: '0.06em' }}>
                  BALANCE {fmtToken(payBalance, sellToken)} {sellToken}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                {usdEntry && <span style={{ ...SKB, fontSize: 24, color: 'rgba(229,225,219,0.55)' }}>$</span>}
                <input
                  inputMode="decimal"
                  value={usdEntry ? payUsd : payAmount}
                  disabled={phase === 'swapping'}
                  // USD entry clamps to cents; ETH keeps precision; ZORA/USDC → 2 decimals.
                  onChange={usdEntry
                    ? (e) => setPayFromUsd(e.target.value.replace(/[^0-9.]/g, '').replace(/^(\d*\.\d{2})\d+$/, '$1'))
                    : (e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setPayAmount(sellToken === 'ETH' ? v : v.replace(/^(\d*\.\d{2})\d+$/, '$1')); }}
                  placeholder="0"
                  style={{ ...SKB, fontSize: 24, color: '#E5E1DB', background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: 0 }}
                />
                <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: 'rgba(229,225,219,0.7)' }}>{usdEntry ? 'USD' : sellToken}</span>
                <button
                  // MAX floors at each token's display precision — never rounds UP past balance
                  onClick={() => usdEntry
                    ? setPayFromUsd((Math.floor(maxPay * spotUsd! * 100) / 100).toFixed(2))
                    : setPayAmount(sellToken === 'ETH' ? (Math.floor(maxPay * 1e6) / 1e6).toFixed(6) : (Math.floor(maxPay * 100) / 100).toFixed(2))}
                  style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#E5E1DB', background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', padding: 0 }}
                >
                  MAX
                </button>
              </div>
              {/* ETH the dollars convert to — small, so the exact wei being swapped is visible. */}
              {usdEntry && (
                <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.4)', margin: '6px 0 0', letterSpacing: '0.04em' }}>
                  ≈ {validAmount ? fmtToken(payNum, 'ETH') : '0'} ETH · live rate
                </p>
              )}
              {overMax && (
                <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: '#E5E1DB', margin: '8px 0 0', lineHeight: 1.4 }}>
                  {sellToken === 'ETH'
                    ? `Max ${fmtToken(maxPay, 'ETH')} ETH — the rest is kept for network fees.`
                    : `Max ${fmtToken(maxPay, sellToken)} ${sellToken} — that's your full balance.`}
                </p>
              )}
            </div>

            {/* FLIP */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
              <button onClick={flip} disabled={phase === 'swapping'} style={{ background: '#0a0a0a', border: '1px solid #1f1f1f', cursor: 'pointer', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 'var(--fs-14)', color: '#E5E1DB', lineHeight: 1 }}>⇅</span>
              </button>
            </div>

            {/* YOU RECEIVE */}
            <div style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.35)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>YOU RECEIVE</span>
                {quoting && <FrameLoader size={11} />}
              </div>
              <p style={{ ...SKB, fontSize: 24, color: GREEN, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                {quoteOut != null ? `≈ ${fmtToken(quoteOut, buyToken)}` : '—'}{' '}
                <span style={{ fontSize: 'var(--fs-12)', color: 'rgba(229,225,219,0.7)' }}>{buyToken}</span>
              </p>
            </div>

            {/* Info line */}
            <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.3)', margin: '10px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {rate != null ? (pairToken === 'ZORA' ? `1K ZORA ≈ $${(rate * 1000).toFixed(2)} · ` : `1 ETH ≈ $${rate.toFixed(0)} · `) : ''}
              fee ~0.1%{sellToken === 'ETH' ? ' · gas reserve kept' : ''}
              {needsApproval ? ` · first ${sellToken} swap includes a one-time approval` : ''}
            </p>

            {swapError && (
              <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'var(--danger)', margin: '10px 0 0', lineHeight: 1.4 }}>{swapError}</p>
            )}

            {phase === 'swapping' ? (
              <div style={{ width: '100%', border: '1px solid rgba(229,225,219,0.55)', padding: '13px 0', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 46 }}>
                <FrameLoader size={23.5} />
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {needsApproval ? `STEP 1 · APPROVING ${sellToken}, THEN SWAPPING…` : cashOut ? 'CASHING OUT…' : 'SWAPPING…'}
                </span>
              </div>
            ) : (
              <button
                onClick={doSwap}
                disabled={!validAmount || overMax || quoteOut == null}
                style={{ width: '100%', background: !validAmount || overMax || quoteOut == null ? 'rgba(229,225,219,0.4)' : '#E5E1DB', border: 'none', cursor: !validAmount || overMax || quoteOut == null ? 'default' : 'pointer', padding: '14px 0', marginTop: 14 }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: (!validAmount || overMax || quoteOut == null) ? '#E5E1DB' : 'var(--on-ink)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {cashOut ? 'CONFIRM CASH OUT' : 'CONFIRM SWAP'}
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
