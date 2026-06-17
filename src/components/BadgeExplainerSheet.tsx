"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, isProMember } from "@/lib/userService";
import { resolveBadges } from "@/lib/economy/badges";

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
    description: 'The top 1000 collectors together earn 1% of everything traded on Scope, every single day. Ranked by holdings, volume, and creator support. Earned, not bought.',
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

function getCurrentBadge(userTiers: BadgeExplainerSheetProps['userTiers']) {
  if (userTiers.isFoundingMember) return { key: 'founding', label: 'FOUNDING 500', image: '/augmented-member-founding-500-aperture.png' };
  if (userTiers.isTopCollector)   return { key: 'top1k',    label: 'TOP 1K COLLECTOR', image: '/top-1k-collector-aperture-gold.png' };
  if (userTiers.isPaidMember)     return { key: 'pro',      label: 'SCOPE PRO', image: '/scope-pro-icon-aperture.png' };
  if (userTiers.isInHouseCreator) return { key: 'creator',  label: 'IN-HOUSE CREATOR', image: '/in-house-creator-logo-grey.png' };
  return { key: 'free', label: 'FREE TIER', image: '/free-tier-aperture-logo-red.png' };
}

export default function BadgeExplainerSheet({ visible, onClose, onJoinPress, userTiers, isPaidMember, paidMemberUntil, onManageMembership }: BadgeExplainerSheetProps) {
  const router = useRouter();
  const { user } = usePrivy();
  useEffect(() => {
    if (visible) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  // The sheet is ALWAYS viewer-centric: resolve the AUTHENTICATED viewer's own
  // tiers via the verified path (did → users.id → profiles), regardless of whose
  // badge was tapped. On a public profile the props carry the VIEWED user's
  // tiers, so self-resolving here overrides them with the viewer's real status.
  const [viewer, setViewer] = useState<{
    tiers: BadgeExplainerSheetProps['userTiers'];
    isPaid: boolean;
    paidUntil: Date | null;
  } | null>(null);

  useEffect(() => {
    if (!visible || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser || cancelled) return;
        const p = await getProfile(sbUser.id) as any;
        if (!p || cancelled) return;
        const isPaid = isProMember(p);
        const isTop = !!p.is_top_collector;
        const isHouse = !!p.is_in_house_creator;
        const isFounding = !!p.is_founding_member;
        setViewer({
          tiers: {
            isFree: !isPaid && !isTop && !isFounding && !isHouse,
            isInHouseCreator: isHouse,
            isPaidMember: isPaid,
            isTopCollector: isTop,
            isFoundingMember: isFounding,
            foundingMemberNumber: p.founding_member_number ?? null,
          },
          isPaid,
          paidUntil: p.paid_member_until ? new Date(p.paid_member_until) : null,
        });
      } catch (e) {
        console.error('Badge sheet viewer resolve error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, user?.id]);

  // Effective (viewer-centric) status — the self-resolved viewer wins; props are
  // only a fallback (correct on own-profile, replaced on public once resolved).
  const vTiers = viewer?.tiers ?? userTiers;
  const vIsPaid = viewer?.isPaid ?? !!isPaidMember;
  const vPaidUntil = viewer?.paidUntil ?? paidMemberUntil ?? null;

  const currentTier = vTiers.isFoundingMember ? 'founding'
    : vTiers.isTopCollector ? 'top1k'
    : vTiers.isPaidMember ? 'pro'
    : vTiers.isInHouseCreator ? 'creator'
    : 'free';

  const currentBadge = getCurrentBadge(vTiers);

  // MANAGE always works for a Pro viewer, even from a public profile where the
  // caller didn't pass onManageMembership.
  const handleManage = onManageMembership ?? (() => { onClose(); router.push('/membership/manage'); });

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
        {/* Status rows */}
        {/* Row 1 — Membership */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={currentBadge.image} alt="" style={{ width: 16, height: 16 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ ...BOLD, fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>MY MEMBERSHIP</span>
              <span style={{ ...BOLD, fontSize: 9, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {vIsPaid
                  ? `SCOPE PRO · RENEWS ${vPaidUntil ? vPaidUntil.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() : ''}`
                  : 'FREE'}
              </span>
            </div>
          </div>
          <button
            onClick={vIsPaid ? handleManage : onJoinPress}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ ...BOLD, fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {vIsPaid ? 'MANAGE →' : 'UPGRADE →'}
            </span>
          </button>
        </div>

        {/* BADGES EARNED — read-only (Piece 5). The badges the viewer actually
            holds, rendered generically. NO customization here — the dividing-line
            picker + holo toggle live in Edit Profile (Pieces 2–3). Replaces the
            single "my current badge", which no longer fits the multi-badge model. */}
        {(() => {
          const earned = resolveBadges({
            isFoundingMember: vTiers.isFoundingMember,
            isTopCollector: vTiers.isTopCollector,
            isPaidMember: vTiers.isPaidMember,
            isInHouseCreator: vTiers.isInHouseCreator,
            firstCutCount: 0, // this sheet doesn't load the gated count; First Cut/Composer/SRH light up here once their flags reach this surface
          }).filter((b) => b.key !== 'free'); // the Free baseline isn't an "earned" badge
          if (earned.length === 0) return null;
          return (
            <div style={{ padding: '14px 0 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
              <span style={{ ...BOLD, fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em', display: 'block', marginBottom: 14 }}>BADGES EARNED</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                {earned.map((b) => (
                  <div key={b.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 52 }}>
                    <img src={b.bannerSrc ?? b.src} alt={b.title} style={{ width: 34, height: 34, objectFit: 'contain', display: 'block' }} />
                    <span style={{ ...BOLD, fontSize: 8, letterSpacing: '0.04em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.1, textAlign: 'center' }}>{b.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Header */}
        <img
          src="/badges-on-scope-logo.png"
          alt="Badges on Scope"
          style={{ height: 96, display: 'block', margin: '0 auto 55px' }}
        />

        {/* Tier list */}
        {tiers.map((tier, i) => (
          <div key={tier.key} id={`badge-tier-${tier.key}`}>
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
                <p style={{ ...BOLD, fontSize: 12, color: tier.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{tier.title}</span>
                  {/* Viewer-centric: their own tier reads YOURS; the rest read as
                      not-yet-theirs, so every badge tap shows where they stand. */}
                  {currentTier === tier.key ? (
                    <span style={{ ...BOLD, fontSize: 7, color: '#FF0000', letterSpacing: '0.12em', border: '1px solid rgba(255,0,0,0.55)', padding: '1px 4px' }}>YOURS</span>
                  ) : (
                    <span style={{ ...BOLD, fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em' }}>NOT YET YOURS</span>
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
