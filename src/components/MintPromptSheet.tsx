"use client";
import { useState } from "react";
import { useWallets, useFundWallet, usePrivy } from "@privy-io/react-auth";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";
import { isValidTicker, tickerError } from "@/lib/economy/ticker";
import FrameLoader from "@/components/FrameLoader";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface MintPromptSheetProps {
  visible: boolean;
  onMint: () => void;
  onSkip: () => void;
  /** LOUD path: user dismissed the FUND WALLET screen — the post must land in
      coin-failed (inline error + profile retry), never a silent skip. */
  onCoinSkipped: () => void;
  // Phase 1 coin params (entered on the mint step).
  ticker: string;
  onTickerChange: (v: string) => void;
  selfBuyUsd: string;
  onSelfBuyChange: (v: string) => void;
  /** TRANSACTION PRESENCE: while the sequence runs, the pressed button
      transforms in place into its live narration (the wheel). */
  sequencePhase: 'idle' | 'minting' | 'minted' | 'mint-failed' | 'coin-failed' | 'backing-failed';
  sequenceLine: string | null;
  /** Honest sub-line when a slow leg hands off ("BACKING SETTLING…"). */
  ceremonySub?: string | null;
  /** The codification ceremony: brackets snap onto the media in the flow. */
  codified?: boolean;
  /** The post's GRADED media + its aspect — the codification target. */
  mediaUrl?: string | null;
  mediaAr?: string;
  /** In-flow failure actions — the post is never hostage. */
  onRetry: () => void;
  onContinue: () => void;
}

export default function MintPromptSheet({ visible, onMint, onSkip, onCoinSkipped, ticker, onTickerChange, selfBuyUsd, onSelfBuyChange, sequencePhase, sequenceLine, ceremonySub, codified, mediaUrl, mediaAr, onRetry, onContinue }: MintPromptSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const [insufficientFunds, setInsufficientFunds] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);

  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const { ready, authenticated } = usePrivy();

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');

  // READINESS — the three-state gate (never collapse LOADING into "no funds").
  // In a cold/incognito session the mint sheet can render before Privy finishes
  // connecting; a balance read then would race and return 0, which the old gate
  // mis-read as INSUFFICIENT (the phantom FUND WALLET). We do not read balance
  // or evaluate sufficiency until the wallet is genuinely connected: Privy ready
  // + authenticated + an embedded-wallet address present. Until then the CTA
  // shows CONNECTING and waits — pending is LOADING, never zero.
  const walletReady = ready && authenticated && !!embeddedWallet?.address;

  // Soft pre-check, not enforcement: it exists to catch obviously-empty wallets
  // before a doomed tx. If it's wrong in either direction the coin step itself
  // is the real gate (a createCoin failure lands LOUD in coin-failed + retry).
  // Gas allowance: createCoin on Base ≈ a few M gas at sub-0.05 gwei → well
  // under 0.0002 ETH (cents). The old 0.0005 constant false-gated funded
  // wallets (observed: 0.000493 ETH balance refused — $0.02 short).
  const GAS_ALLOWANCE_ETH = 0.0002;

  const checkBalanceAndMint = async () => {
    // LOADING is not "no funds": if the wallet isn't connected yet, do nothing —
    // the CTA shows CONNECTING and the user taps again once ready. We never
    // evaluate sufficiency (or show FUND WALLET) against an unconnected wallet.
    if (!walletReady || !embeddedWallet) return;
    setCheckingBalance(true);
    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || 'https://mainnet.base.org'),
      });
      // Read the REAL chain the transport answers as — never assume the URL.
      // GAS (ETH) is the ONLY mint gate. The self-buy ("back your post") is
      // OPTIONAL and ISOLATED — it must NEVER block creating the coin. If the
      // wallet is short on USDC for the typed backing, we STILL mint; the
      // backing leg skips / hands off downstream (backOwnCoin fail-fast → the
      // post's collect sheet). Gating the mint on USDC-for-backing was the
      // FUND WALLET mis-fire — removed.
      const [balanceWei, chainId] = await Promise.all([
        publicClient.getBalance({ address: embeddedWallet.address as `0x${string}` }),
        publicClient.getChainId(),
      ]);
      const ethBalance = parseFloat(formatEther(balanceWei));
      const gasOk = ethBalance >= GAS_ALLOWANCE_ETH;

      // The one-line diagnostic this class of bug demands — on EVERY evaluation.
      console.log(
        `[coin-gate] addr=${embeddedWallet.address} chainId=${chainId} eth=${ethBalance} (gas≥${GAS_ALLOWANCE_ETH}→${gasOk}) → ${gasOk ? 'PROCEED' : 'FUND WALLET'}`
      );

      if (chainId !== base.id) {
        // RPC answers as the wrong network — the balance read is meaningless.
        // Don't false-gate on garbage data; let the coin step be the loud gate.
        console.error(`[coin-gate] RPC chainId ${chainId} ≠ Base ${base.id} — skipping gate, proceeding to mint`);
        onMint();
        return;
      }

      if (gasOk) onMint();
      else setInsufficientFunds(true);
    } catch (e) {
      console.error('[coin-gate] balance check failed (proceeding — coin step is the loud gate):', e);
      onMint();
    } finally {
      setCheckingBalance(false);
    }
  };

  return (
    <>
      <div
        onClick={onSkip}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          zIndex: 500,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: '#080808',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        zIndex: 501,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
        padding: '28px 24px 48px',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 36, height: 2, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        </div>

        {insufficientFunds ? (
          /* ── Needs-ETH-for-gas screen (the wallet is READY, just low on ETH) ──
             The wallet here has ≈zero ETH, so a USDC→ETH swap can't run (the swap
             itself needs gas). Onramp ETH directly — the one path that works on a
             zero-gas wallet. (Swap-as-primary needs a paymaster; see notes.) */
          <div>
            <p style={{ ...SKB, fontSize: 'var(--fs-16)', color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
              YOU NEED A LITTLE ETH
            </p>
            <p style={{ ...SKB, fontSize: 'var(--fs-16)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
              TO CREATE A COIN.
            </p>
            <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 28px' }}>
              Creating a coin takes a tiny network fee, paid in ETH — usually less than a cent on Base. Add a little ETH to your wallet with a card or Apple Pay and you&rsquo;re set.
            </p>
            {[
              'You earn ETH every time someone collects your post',
              'Royalties on every resale, forever',
              'Your work lives on-chain — yours',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#FF0000', flexShrink: 0, marginTop: 4 }} />
                <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>{item}</p>
              </div>
            ))}
            <button
              onClick={() => {
                // Onramp ETH (native currency) — the reliable fix for a zero-gas
                // wallet. asset native-currency = ETH on Base (not USDC).
                if (embeddedWallet) fundWallet(embeddedWallet.address, { chain: base, asset: 'native-currency' });
              }}
              style={{ width: '100%', background: '#FF0000', border: 'none', cursor: 'pointer', padding: '14px 0', marginTop: 24, marginBottom: 10 }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                ADD ETH · CARD OR APPLE PAY
              </span>
            </button>
            <button
              onClick={() => { setInsufficientFunds(false); onCoinSkipped(); }}
              style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', padding: '12px 0' }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                SKIP FOR NOW
              </span>
            </button>
            {embeddedWallet && (
              <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: '12px 0 0' }}>
                YOUR WALLET · {embeddedWallet.address.slice(0, 6)}...{embeddedWallet.address.slice(-4)}
              </p>
            )}
          </div>
        ) : (
          /* ── Normal mint prompt ── */
          <>
            {/* The post's GRADED media — the work being coined, and the
                CODIFICATION target: on coin confirmation the red corner
                brackets snap onto it HERE, inside the flow. */}
            {mediaUrl && (
              <div style={{ position: 'relative', width: '100%', aspectRatio: mediaAr || '2.39 / 1', background: '#111', overflow: 'hidden', marginBottom: 18 }}>
                <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {codified && (
                  <>
                    <div style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderTop: '2px solid #FF0000', borderLeft: '2px solid #FF0000', animation: 'cornerReveal 0.6s ease forwards', opacity: 0 }} />
                    <div style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderTop: '2px solid #FF0000', borderRight: '2px solid #FF0000', animation: 'cornerReveal 0.6s ease 0.1s forwards', opacity: 0 }} />
                    <div style={{ position: 'absolute', bottom: 6, left: 6, width: 22, height: 22, borderBottom: '2px solid #FF0000', borderLeft: '2px solid #FF0000', animation: 'cornerReveal 0.6s ease 0.2s forwards', opacity: 0 }} />
                    <div style={{ position: 'absolute', bottom: 6, right: 6, width: 22, height: 22, borderBottom: '2px solid #FF0000', borderRight: '2px solid #FF0000', animation: 'cornerReveal 0.6s ease 0.3s forwards', opacity: 0 }} />
                    <style>{`@keyframes cornerReveal { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }`}</style>
                  </>
                )}
              </div>
            )}
            <p style={{ ...SKB, fontSize: 'var(--fs-16)', color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 10px' }}>
              YOUR POST IS LIVE.
            </p>
            <p style={{ ...SKB, fontSize: 'var(--fs-16)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
              WANT TO EARN FROM IT?
            </p>

            <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 20px' }}>
              Mint this post to Base and earn ETH every time someone collects it. Your work becomes a token — and you get a cut of every trade, forever.
            </p>

            <button
              onClick={() => setExpanded(v => !v)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {expanded ? 'LESS' : 'HOW DOES THIS WORK?'}
              </span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: expanded ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s ease' }}>
                <path d="M5 1v8M1 5h8" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>

            <div style={{
              overflow: 'hidden',
              maxHeight: expanded ? '340px' : '0px',
              transition: 'max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              marginBottom: expanded ? 20 : 0,
            }}>
              {/* Canonical EARN copy — Scope_Economy.docx §7, verbatim. */}
              {[
                { step: '1', title: 'POST IT.', text: 'When you post, your work becomes a token — 10,000 pieces of something you made. You own it from the start.' },
                { step: '2', title: 'PEOPLE COLLECT IT.', text: 'Anyone can buy pieces of your post. The more people want in, the more each piece is worth.' },
                { step: '3', title: 'YOU EARN. EVERY TIME. FOREVER.', text: 'Every time anyone buys or sells a piece — today, next year, ten years from now — a small fee is taken, and a slice goes straight to your wallet. Not just the first sale. Every sale.' },
              ].map(({ step, title, text }) => (
                <div key={step} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: '#FF0000', letterSpacing: '0.1em', flexShrink: 0, marginTop: 2 }}>{step}</span>
                  <div>
                    <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 3px', lineHeight: 1.3 }}>{title}</p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: 0 }}>{text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Ticker — creator-assigned symbol, caption-derived suggestion. */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>TICKER</span>
                <span style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>3–6 · A–Z 0–9</span>
              </div>
              {/* Bracket frame, not the $ cashtag — $ appears ONLY on money. */}
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.18)', padding: '0 12px' }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-16)', color: '#FF0000' }}>[</span>
                <input
                  value={ticker}
                  onChange={(e) => onTickerChange(e.target.value)}
                  placeholder="TICKER"
                  maxLength={6}
                  style={{ ...SKB, fontSize: 'var(--fs-16)', color: '#FFF', background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: '11px 8px', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}
                />
                <span style={{ ...SKB, fontSize: 'var(--fs-16)', color: '#FF0000' }}>]</span>
              </div>
              {tickerError(ticker) && (
                <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: '#FF0000', margin: '6px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tickerError(ticker)}</p>
              )}
            </div>

            {/* Optional "Back your post" — creator self-buy at the curve price. */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>BACK YOUR POST <span style={{ color: 'rgba(255,255,255,0.3)' }}>· OPTIONAL</span></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.18)', padding: '0 12px' }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-16)', color: selfBuyUsd ? '#FFF' : 'rgba(255,255,255,0.3)' }}>$</span>
                <input
                  inputMode="decimal"
                  value={selfBuyUsd}
                  onChange={(e) => onSelfBuyChange(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                  style={{ ...SKB, fontSize: 'var(--fs-16)', color: '#FFF', background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: '11px 6px' }}
                />
              </div>
              <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.3)', margin: '6px 0 0', lineHeight: 1.4 }}>
                Buy some of your own post at launch — at the same price as everyone. Leave blank to skip.
              </p>
            </div>

            {(sequencePhase === 'coin-failed' || sequencePhase === 'backing-failed') ? (
              /* IN-FLOW FAILURE — ONE dismissible surface, the post is never
                 hostage. coin-failed → RETRY re-runs the mint; backing-failed →
                 the COIN IS SAFE, RETRY re-attempts ONLY the backing buy. The
                 parent routes onRetry by phase. No auto-navigation. */
              <div style={{ marginBottom: 10 }}>
                <div style={{ width: '100%', border: '1px solid #FF0000', padding: '14px 14px', marginBottom: 10, textAlign: 'center' }}>
                  <p style={{ ...SKB, fontSize: 'var(--fs-12)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>
                    {sequencePhase === 'backing-failed' ? '[ BACKING DIDN’T LAND ]' : '[ COIN FAILED ]'}
                  </p>
                  <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.45, margin: 0 }}>
                    {sequencePhase === 'backing-failed'
                      ? 'Your coin is live and your post is safe — only the backing buy didn’t go through. Retry it now, or back it later from your post.'
                      : (sequenceLine ?? 'Something failed on the way to the chain. Your post is safe.')}
                  </p>
                </div>
                <button onClick={onRetry} style={{ width: '100%', background: '#FF0000', border: 'none', cursor: 'pointer', padding: '13px 0', marginBottom: 8 }}>
                  <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sequencePhase === 'backing-failed' ? 'RETRY BACKING' : 'RETRY'}</span>
                </button>
                <button onClick={onContinue} style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', padding: '11px 0' }}>
                  <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CONTINUE TO PROFILE</span>
                </button>
              </div>
            ) : sequencePhase !== 'idle' ? (
              /* THE WHEEL — the pressed button, transformed in place into the
                 live narration. Loader while a step runs; bracket terminal
                 state holds a beat. */
              <div style={{ marginBottom: 10 }}>
                <div style={{ width: '100%', border: '1px solid rgba(255,0,0,0.55)', padding: '13px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 46 }}>
                  {sequenceLine && !sequenceLine.startsWith('[') && !sequenceLine.includes('DIDN’T') ? (
                    <FrameLoader size={22} />
                  ) : null}
                  <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: sequenceLine?.includes('DIDN’T') ? '#FF0000' : sequenceLine?.startsWith('[') ? '#FF0000' : 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {sequenceLine ?? 'WORKING…'}
                  </span>
                </div>
                {ceremonySub && (
                  <p style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.14em', textAlign: 'center', margin: '8px 0 0' }}>
                    {ceremonySub}
                  </p>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={checkBalanceAndMint}
                  disabled={!walletReady || checkingBalance || !isValidTicker(ticker)}
                  style={{ width: '100%', background: (!walletReady || checkingBalance || !isValidTicker(ticker)) ? 'rgba(255,0,0,0.4)' : '#FF0000', border: 'none', cursor: (!walletReady || checkingBalance || !isValidTicker(ticker)) ? 'default' : 'pointer', padding: '14px 0', marginBottom: 10 }}
                >
                  <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em', animation: !walletReady ? 'mp-connect-pulse 1.4s ease-in-out infinite' : 'none' }}>
                    {/* The button carries the plain-language contract — this tap IS
                        the consent for everything it names (no second confirm). */}
                    {/* Amount = the consented spend. No word that can read as
                        a ticker — "BACK" is banned from the button. */}
                    {/* LOADING state: wallet not connected yet → CONNECTING (pulse),
                        never FUND WALLET, never a blind mint. */}
                    {!walletReady ? 'CONNECTING WALLET…'
                      : checkingBalance ? 'CHECKING BALANCE...'
                      : !isValidTicker(ticker) ? 'ENTER A TICKER'
                      : (() => { const b = parseFloat(selfBuyUsd); return isFinite(b) && b > 0 ? `CREATE COIN · $${b.toFixed(2)}` : 'CREATE COIN'; })()}
                  </span>
                  <style>{`@keyframes mp-connect-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
                </button>
                <button
                  onClick={onSkip}
                  style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', padding: '12px 0' }}
                >
                  <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    SKIP FOR NOW
                  </span>
                </button>
              </>
            )}
            <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
              MINTING REQUIRES A SMALL GAS FEE ON BASE. YOU CAN ALWAYS MINT LATER FROM YOUR PROFILE.
            </p>
          </>
        )}
      </div>
    </>
  );
}
