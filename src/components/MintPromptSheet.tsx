"use client";
import { useState } from "react";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface MintPromptSheetProps {
  visible: boolean;
  onMint: () => void;
  onSkip: () => void;
}

export default function MintPromptSheet({ visible, onMint, onSkip }: MintPromptSheetProps) {
  const [expanded, setExpanded] = useState(false);

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

        {/* Header */}
        <p style={{ ...SKB, fontSize: 16, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 10px' }}>
          YOUR POST IS LIVE.
        </p>
        <p style={{ ...SKB, fontSize: 16, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
          WANT TO EARN FROM IT?
        </p>

        {/* Short pitch */}
        <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Mint this post to Base and earn ETH every time someone collects it. Your work becomes a token — and you get a cut of every trade, forever.
        </p>

        {/* Expandable explainer */}
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

        {/* CTA buttons */}
        <button
          onClick={onMint}
          style={{ width: '100%', background: '#FF0000', border: 'none', cursor: 'pointer', padding: '14px 0', marginBottom: 10 }}
        >
          <span style={{ ...SKB, fontSize: 12, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            MINT THIS POST · EARN ETH
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
      </div>
    </>
  );
}
