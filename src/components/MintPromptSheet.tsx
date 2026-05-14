"use client";
import { useState } from "react";
import { useWallets, useFundWallet } from "@privy-io/react-auth";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface MintPromptSheetProps {
  visible: boolean;
  onMint: () => void;
  onSkip: () => void;
}

export default function MintPromptSheet({ visible, onMint, onSkip }: MintPromptSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const [insufficientFunds, setInsufficientFunds] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);

  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');

  const checkBalanceAndMint = async () => {
    if (!embeddedWallet) {
      onMint();
      return;
    }
    setCheckingBalance(true);
    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || 'https://mainnet.base.org'),
      });
      const balance = await publicClient.getBalance({
        address: embeddedWallet.address as `0x${string}`,
      });
      const ethBalance = parseFloat(formatEther(balance));
      console.log('[mint] ETH balance:', ethBalance);
      if (ethBalance < 0.0005) {
        setInsufficientFunds(true);
      } else {
        onMint();
      }
    } catch (e) {
      console.error('[mint] balance check failed:', e);
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
          /* ── Insufficient funds screen ── */
          <div>
            <p style={{ ...SKB, fontSize: 16, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
              FUND YOUR WALLET
            </p>
            <p style={{ ...SKB, fontSize: 16, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
              TO START EARNING.
            </p>
            <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 28px' }}>
              Minting requires a tiny amount of ETH for gas on Base — typically less than $0.01. Add funds to your Scope wallet using a card, Apple Pay, or crypto.
            </p>
            {[
              'ETH every time someone collects your post',
              'Royalties on every secondary trade',
              'Your work lives on-chain forever',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#FF0000', flexShrink: 0, marginTop: 4 }} />
                <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>{item}</p>
              </div>
            ))}
            <button
              onClick={() => {
                if (embeddedWallet) fundWallet(embeddedWallet.address, { chain: base });
              }}
              style={{ width: '100%', background: '#FF0000', border: 'none', cursor: 'pointer', padding: '14px 0', marginTop: 24, marginBottom: 10 }}
            >
              <span style={{ ...SKB, fontSize: 12, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                ADD FUNDS · CARD OR CRYPTO
              </span>
            </button>
            <button
              onClick={() => { setInsufficientFunds(false); onSkip(); }}
              style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', padding: '12px 0' }}
            >
              <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                SKIP FOR NOW
              </span>
            </button>
            {embeddedWallet && (
              <p style={{ ...SKR, fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: '12px 0 0' }}>
                YOUR WALLET · {embeddedWallet.address.slice(0, 6)}...{embeddedWallet.address.slice(-4)}
              </p>
            )}
          </div>
        ) : (
          /* ── Normal mint prompt ── */
          <>
            <p style={{ ...SKB, fontSize: 16, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 10px' }}>
              YOUR POST IS LIVE.
            </p>
            <p style={{ ...SKB, fontSize: 16, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
              WANT TO EARN FROM IT?
            </p>

            <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 20px' }}>
              Mint this post to Base and earn ETH every time someone collects it. Your work becomes a token — and you get a cut of every trade, forever.
            </p>

            <button
              onClick={() => setExpanded(v => !v)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {expanded ? 'LESS' : 'HOW DOES THIS WORK?'}
              </span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: expanded ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s ease' }}>
                <path d="M5 1v8M1 5h8" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>

            <div style={{
              overflow: 'hidden',
              maxHeight: expanded ? '200px' : '0px',
              transition: 'max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              marginBottom: expanded ? 20 : 0,
            }}>
              {[
                { step: '01', text: 'Your post is minted as a token on Base — a real blockchain asset.' },
                { step: '02', text: 'Anyone on Scope can collect your post by paying a small fee.' },
                { step: '03', text: 'Every time someone collects or trades your post, you earn ETH directly to your Scope wallet.' },
                { step: '04', text: 'You keep earning indefinitely. The token lives on Base forever.' },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <span style={{ ...SKB, fontSize: 8, color: '#FF0000', letterSpacing: '0.1em', flexShrink: 0, marginTop: 2 }}>{step}</span>
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>

            <button
              onClick={checkBalanceAndMint}
              disabled={checkingBalance}
              style={{ width: '100%', background: checkingBalance ? 'rgba(255,0,0,0.5)' : '#FF0000', border: 'none', cursor: checkingBalance ? 'default' : 'pointer', padding: '14px 0', marginBottom: 10 }}
            >
              <span style={{ ...SKB, fontSize: 12, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {checkingBalance ? 'CHECKING BALANCE...' : 'MINT THIS POST · EARN ETH'}
              </span>
            </button>
            <button
              onClick={onSkip}
              style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', padding: '12px 0' }}
            >
              <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                SKIP FOR NOW
              </span>
            </button>
            <p style={{ ...SKR, fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
              MINTING REQUIRES A SMALL GAS FEE ON BASE. YOU CAN ALWAYS MINT LATER FROM YOUR PROFILE.
            </p>
          </>
        )}
      </div>
    </>
  );
}
