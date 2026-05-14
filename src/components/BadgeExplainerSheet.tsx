"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface BadgeExplainerSheetProps {
  visible: boolean;
  onClose: () => void;
  onJoinPress: () => void;
  userTiers: {
    isFree: boolean;
    isInHouseCreator: boolean;
    isPaidMember: boolean;
    isTopCollector: boolean;
    isFoundingMember: boolean;
    foundingMemberNumber?: number | null;
  };
  isPaidMember?: boolean;
  paidMemberUntil?: Date | null;
  onManageMembership?: () => void;
}

const tiers = [
  {
    key: 'free',
    img: '/free-tier-aperture-logo-red.png',
    size: 40,
    label: 'FREE TIER',
    color: '#FF0000',
    title: 'FREE TIER',
    description: 'Every Scope account starts here. 25 posts, full collecting, minted on Base from day one.',
    sub: 'FREE · 10 POST LIMIT',
  },
  {
    key: 'creator',
    img: '/in-house-creator-logo-grey.png',
    size: 40,
    label: 'IN-HOUSE CREATOR',
    color: 'rgba(255,255,255,0.6)',
    title: 'IN-HOUSE CREATOR',
    description: "Earned by creators who use Scope's built-in tools. Post 10+ times per month with the in-app toolkit to qualify. Cannot be bought.",
    sub: '10+ TOOL POSTS / MONTH · AUTO-AWARDED',
  },
  {
    key: 'pro',
    img: '/scope-pro-icon-aperture.png',
    size: 44,
    label: 'SCOPE PRO',
    color: '#FF0000',
    title: 'SCOPE PRO',
    description: 'Unlimited posts, decks, and analytics. Debited from your wallet or via card. Your red aperture badge ships immediately.',
    sub: '$5 / MONTH · $50 / YEAR',
  },
  {
    key: 'top1k',
    img: '/top-1k-collector-aperture-gold.png',
    size: 44,
    label: 'TOP 1000 COLLECTOR',
    color: '#C9A84C',
    title: 'TOP 1000 COLLECTOR',
    description: 'Top 1000 collectors earn a share of platform fees every single day. Ranked by holdings, volume, and creator support. Earned, not bought.',
    sub: 'DAILY DISTRIBUTIONS · EARNED NOT BOUGHT',
  },
  {
    key: 'founding',
    img: '/augmented-member-founding-500-aperture.png',
    size: 45,
    label: 'FOUNDING 500',
    color: '#ff0080',
    title: 'FOUNDING 500',
    description: 'The first 500 Scope Pro subscribers. Stays active as long as your subscription is open — cancel and your spot passes to the next in line.',
    sub: 'FIRST 500 PRO MEMBERS · TRANSFERABLE SPOT',
  },
];

export default function BadgeExplainerSheet({ visible, onClose, onJoinPress, userTiers, isPaidMember, paidMemberUntil, onManageMembership }: BadgeExplainerSheetProps) {
  const router = useRouter();
  useEffect(() => {
    if (visible) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  const currentTier = userTiers.isFoundingMember ? 'founding'
    : userTiers.isTopCollector ? 'top1k'
    : userTiers.isPaidMember ? 'pro'
    : userTiers.isInHouseCreator ? 'creator'
    : 'free';

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)',
          zIndex: 400, opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: '#080808',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        zIndex: 401,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        padding: '28px 24px 48px',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ width: 36, height: 2, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Active membership status */}
        {isPaidMember && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            marginBottom: 16,
            border: '1px solid rgba(255,0,0,0.25)',
            backgroundColor: 'rgba(255,0,0,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                src="/scope-pro-icon-aperture.png"
                alt="Scope Pro"
                style={{ width: 23, height: 23 }}
              />
              <div>
                <p style={{ ...BOLD, fontSize: 9, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px' }}>
                  ACTIVE MEMBERSHIP
                </p>
                <p style={{ ...BOLD, fontSize: 11, color: 'white', textTransform: 'uppercase', margin: 0 }}>
                  SCOPE PRO
                </p>
                {paidMemberUntil && (
                  <p style={{ ...REG, fontSize: 8, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0', textTransform: 'uppercase' }}>
                    RENEWS {paidMemberUntil.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onManageMembership}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                padding: '6px 12px',
              }}
            >
              <span style={{ ...BOLD, fontSize: 9, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                MANAGE
              </span>
            </button>
          </div>
        )}

        {/* Header */}
        <img
          src="/badges-on-scope-logo.png"
          alt="Badges on Scope"
          style={{ height: 96, display: 'block', margin: '0 auto 55px' }}
        />

        {/* Tier list */}
        {tiers.map((tier, i) => (
          <div key={tier.key}>
            <div onClick={() => { onClose(); router.push(`/badge/${tier.key}`); }} style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'flex-start', cursor: 'pointer' }}>
              <div style={{
                perspective: 300,
                perspectiveOrigin: 'center center',
                flexShrink: 0,
                marginTop: 2,
                position: 'relative',
                width: tier.size,
                height: tier.size,
              }}>
                {/* Glow */}
                <div style={{
                  position: 'absolute',
                  inset: -8,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${tier.color}44 0%, transparent 70%)`,
                  animation: `glowPulse 2.5s ease-in-out ${i * 0.4}s infinite`,
                  pointerEvents: 'none',
                }} />
                {/* 3D coin */}
                <div style={{
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  transformStyle: 'preserve-3d',
                  animation: `coinFlip 6s ease-in-out ${i * 0.8}s infinite`,
                }}>
                  <img
                    src={tier.img}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                      position: 'absolute',
                      backfaceVisibility: 'hidden',
                      filter: `drop-shadow(0 0 6px ${tier.color}88)`,
                      borderRadius: '50%',
                    }}
                    alt={tier.label}
                  />
                  {/* Back face — same image mirrored */}
                  <img
                    src={tier.img}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                      position: 'absolute',
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      filter: `drop-shadow(0 0 6px ${tier.color}88)`,
                      borderRadius: '50%',
                    }}
                  />
                </div>
                {currentTier === tier.key && (
                  <div style={{
                    position: 'absolute', top: -3, right: -3,
                    width: 6, height: 6, borderRadius: '50%',
                    backgroundColor: '#FF0000',
                    zIndex: 2,
                  }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ ...BOLD, fontSize: 12, color: tier.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  {tier.title}
                  {currentTier === tier.key && (
                    <span style={{ ...REG, fontSize: 8, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>· YOUR TIER</span>
                  )}
                </p>
                <p style={{ ...REG, fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.3, margin: '0 0 6px' }}>
                  {tier.description}
                </p>
                <button
                  onClick={() => { onClose(); router.push(`/badge/${tier.key}`); }}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0 0', display: 'inline-block' }}
                >
                  <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: 'white', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    MORE →
                  </span>
                </button>
                <p style={{ ...BOLD, fontSize: 8, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                  {tier.sub}
                </p>
              </div>
            </div>
            {i < tiers.length - 1 && (
              <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 24 }} />
            )}
          </div>
        ))}

        {/* CTA */}
        <button
          onClick={onJoinPress}
          style={{ width: '100%', background: '#FF0000', border: 'none', cursor: 'pointer', padding: '14px 0', marginTop: 8 }}
        >
          <span style={{ ...BOLD, fontSize: 12, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            BECOME A SCOPE MEMBER
          </span>
        </button>
        <button
          onClick={onClose}
          style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', padding: '12px 0', marginTop: 8 }}
        >
          <span style={{ ...BOLD, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            CLOSE
          </span>
        </button>
      </div>
      <style>{`
        @keyframes coinFlip {
          0% { transform: rotateY(0deg); }
          40% { transform: rotateY(160deg); }
          50% { transform: rotateY(180deg); }
          90% { transform: rotateY(340deg); }
          100% { transform: rotateY(360deg); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  );
}
