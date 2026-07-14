"use client";

import {useEffect, useState, useRef} from 'react';
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, isProMember } from "@/lib/userService";
import { membershipBarLabel } from "@/lib/membership";
import { resolveBadges } from "@/lib/economy/badges";
import { useEconomy } from '@/components/EconomyProvider';
import { supabase } from "@/lib/supabase/client";
import { TIER_DETAILS } from "@/app/badge/[tier]/page";

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
    isScreeningRoomHolder?: boolean;
    isFoundingMember: boolean;
    foundingMemberNumber?: number | null;
  };
  isPaidMember?: boolean;
  paidMemberUntil?: Date | null;
  onManageMembership?: () => void;
}

// Icons are the NEW min-design set (public/badges) — same assets as the BADGES
// EARNED grid above, so the whole sheet is consistent. (Free has no min-design
// art, so it keeps its existing mark.)
const tiers = [
  {
    key: 'free',
    img: '/free-tier-aperture-logo-red.png',
    size: 40,
    label: 'FREE TIER',
    color: '#FF0000',
    title: 'FREE TIER',
    description: 'Every Scope account starts here. 25 posts, full collecting, minted on Base from day one.',
    sub: 'FREE · 25 POST LIMIT',
  },
  {
    key: 'creator',
    img: '/badges/in-house-badge-min-design-01.png',
    size: 40,
    label: 'IN-HOUSE CREATOR',
    color: 'rgba(255,255,255,0.6)',
    title: 'IN-HOUSE CREATOR',
    description: "Earned by creators who use Scope's built-in tools. Post 10+ times per month with the in-app toolkit to qualify. Cannot be bought.",
    sub: '10+ TOOL POSTS / MONTH · AUTO-AWARDED',
  },
  {
    key: 'pro',
    img: '/badges/scope-pro-badge-min-design-01.png',
    size: 44,
    label: 'SCOPE PRO',
    color: '#FF0000',
    title: 'SCOPE PRO',
    description: 'Unlimited posts, decks, and analytics. Debited from your wallet or via card. Your red aperture badge ships immediately.',
    sub: '$5 / MONTH · $50 / YEAR',
  },
  {
    key: 'top1k',
    img: '/badges/collector-badge-min-design-01.png',
    size: 44,
    label: 'TOP 1000 COLLECTOR',
    color: '#C9A84C',
    title: 'TOP 1000 COLLECTOR',
    description: 'The top 1000 collectors together earn 1% of everything traded on Scope, every single day. Ranked by holdings, volume, and creator support. Earned, not bought.',
    sub: 'DAILY DISTRIBUTIONS · EARNED NOT BOUGHT',
  },
  {
    key: 'founding',
    img: '/badges/augmented-badge-min-design-01.png',
    size: 45,
    label: 'FOUNDING 500',
    color: '#ff0080',
    title: 'FOUNDING 500',
    description: 'The first 500 Scope Pro subscribers. Stays active as long as your subscription is open — cancel and your spot passes to the next in line.',
    sub: 'FIRST 500 PRO MEMBERS · TRANSFERABLE SPOT',
  },
  // ── New rows (Piece 5 cont.) ──
  {
    key: 'firstCut',
    img: '/badges/first-cut-badge-min-design-01.png',
    size: 42,
    label: 'FIRST CUT',
    color: '#00E08A',
    title: 'FIRST CUT',
    description: "Held by the first 10 external collectors of any post. A permanent founding stake in that work — it can't be re-minted.",
    sub: 'FIRST 10 COLLECTORS · AUTO-AWARDED',
  },
  {
    key: 'composer',
    img: '/badges/composer-badge-min-design-01.png',
    size: 42,
    label: 'COMPOSER',
    color: '#7FB2FF',
    title: 'COMPOSER',
    description: 'For musicians who contribute original tracks to the Scope library. Keep 12+ vetted tracks live each quarter; earn a perpetual share of trades on posts using your music.',
    sub: '12 VETTED TRACKS / QUARTER · ROYALTY SHARE',
  },
  {
    key: 'srh',
    img: '/badges/srh-badge-min-design-01.png',
    size: 42,
    label: 'SCREENING ROOM',
    color: '#C9A84C',
    title: 'SCREENING ROOM HOLDER',
    description: "Currently holds at least one post in the Screening Room — the platform's top-traded showcase. Visibility recognition; lost if the post drops off the top 50.",
    sub: 'TOP-TRADED SHOWCASE · WHILE HELD',
  },
];

// Real earned status from the viewer's flags (CHANGE 4) — fixes the inverted
// "NOT YET YOURS" that keyed off a single highest tier. firstCut/composer/srh
// have no flags yet → correctly "not yet".
function tierEarned(key: string, t: BadgeExplainerSheetProps['userTiers'], isPaid: boolean, composerCount = 0): boolean {
  switch (key) {
    case 'free': return true;            // every account has it
    case 'pro': return isPaid;           // paid_member_until active
    case 'founding': return !!t.isFoundingMember;
    case 'creator': return !!t.isInHouseCreator;
    case 'top1k': return !!t.isTopCollector;
    case 'composer': return composerCount > 0; // ≥1 approved track
    default: return false;               // firstCut, srh (no viewer flag yet)
  }
}

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
  // Two-level stack: list ↔ in-sheet tier detail. Tapping a tier opens its full
  // description WITHOUT leaving the sheet; Back from the detail returns to the list
  // (not the profile). Sheet close (onClose) returns to the profile.
  const [detailKey, setDetailKey] = useState<string | null>(null);
  // The SAME scroller renders the list AND the detail (detailKey swaps content
  // in place) — its scrollTop persisted across the swap, so details opened
  // half-scrolled. Reset on every switch, both directions, every tier.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollerRef.current?.scrollTo(0, 0); }, [detailKey]);
  useEffect(() => {
    if (visible) document.body.style.overflow = 'hidden';
    else { document.body.style.overflow = ''; setDetailKey(null); } // reset the stack on close
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  // The sheet is ALWAYS viewer-centric: resolve the AUTHENTICATED viewer's own
  // tiers via the verified path (did → users.id → profiles), regardless of whose
  // badge was tapped. On a public profile the props carry the VIEWED user's
  // tiers, so self-resolving here overrides them with the viewer's real status.
  const economy = useEconomy();
  const [viewer, setViewer] = useState<{
    tiers: BadgeExplainerSheetProps['userTiers'];
    isPaid: boolean;
    paidUntil: Date | null;
    cancelsAt: Date | null; // scheduled cancel → the bar reads CANCELS, not RENEWS
    firstCutCount: number; // active First Cut slots (expired_at IS NULL)
    composerTrackCount: number; // approved Original Music Library tracks
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
        // First Cut via the ONE engine (balance-joined active holdings) — this
        // sheet used to run its own raw first_cut_awards count, which kept
        // showing released (dust) positions after banner/bio cleared.
        const badges = await economy.getBadges(sbUser.id).catch(() => ({ firstCutCount: 0 } as { firstCutCount?: number; composerTrackCount?: number }));
        const fcCount = badges.firstCutCount ?? 0;
        const composerCount = badges.composerTrackCount ?? 0;
        if (cancelled) return;
        const isPaid = isProMember(p);
        const isTop = !!p.is_top_collector;
        const isHouse = !!p.is_in_house_creator;
        const isFounding = !!p.is_founding_member;
        const isSRH = !!p.is_screening_room_holder;
        setViewer({
          tiers: {
            isFree: !isPaid && !isTop && !isFounding && !isHouse,
            isInHouseCreator: isHouse,
            isPaidMember: isPaid,
            isTopCollector: isTop,
            isScreeningRoomHolder: isSRH,
            isFoundingMember: isFounding,
            foundingMemberNumber: p.founding_member_number ?? null,
          },
          isPaid,
          paidUntil: p.paid_member_until ? new Date(p.paid_member_until) : null,
          cancelsAt: p.membership_cancels_at ? new Date(p.membership_cancels_at) : null,
          firstCutCount: fcCount ?? 0,
          composerTrackCount: composerCount,
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
  const vFirstCutCount = viewer?.firstCutCount ?? 0; // active First Cut slots → lights First Cut in the earned grid
  const vComposerTrackCount = viewer?.composerTrackCount ?? 0; // approved tracks → lights Composer
  const vIsPaid = viewer?.isPaid ?? !!isPaidMember;
  const vPaidUntil = viewer?.paidUntil ?? paidMemberUntil ?? null;
  const vCancelsAt = viewer?.cancelsAt ?? null;

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
      <div ref={scrollerRef} style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        // Full-page when a tier description is open (it fills the entire screen);
        // bottom-sheet (85vh) for the list.
        top: detailKey ? 0 : undefined,
        backgroundColor: '#080808',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        zIndex: 401,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        padding: '28px 24px 48px',
        maxHeight: detailKey ? '100dvh' : '85vh',
        overflowY: 'auto',
      }}>
        {/* ── LEVEL 2 — in-sheet TIER DETAIL. Back returns to the list (this sheet
            stays open); the list's CLOSE returns to the profile. ── */}
        {detailKey && (() => {
          // RECOVERED full-page description — the ORIGINAL rich content (TIER_DETAILS,
          // from the /badge/[tier] page) rendered with its exact original layout
          // (hero + tagline + sectioned copy), now in-sheet. Normal flow, fills the
          // sheet, no gap. Back → list (the list is unmounted while this shows).
          const d = TIER_DETAILS[detailKey];
          if (!d) return null;
          return (
            <div>
              <button onClick={() => setDetailKey(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span style={{ ...BOLD, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>← BACK</span>
              </button>

              {/* Badge hero */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 0 32px' }}>
                <div style={{ width: d.size, height: d.size, marginBottom: 20, position: 'relative' }}>
                  <div className="badge-hero-glow" style={{ position: 'absolute', inset: -24, borderRadius: '50%', background: `radial-gradient(circle, ${d.color}55 0%, transparent 65%)`, animation: 'glowIn 2s ease 0.3s both', pointerEvents: 'none' }} />
                  <img className="badge-hero-logo" src={d.img} alt={d.label} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', position: 'relative', animation: 'focusPull 2s cubic-bezier(0.16, 0.84, 0.3, 1) both' }} />
                </div>
                <p style={{ ...BOLD, fontSize: 'var(--fs-18)', color: d.color, textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 12px', textAlign: 'center' }}>{d.label}</p>
                <p style={{ ...REG, fontSize: 'var(--fs-13)', color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 1.6, margin: 0, maxWidth: 280 }}>{d.tagline}</p>
              </div>

              {/* Divider */}
              <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '0 0 32px' }} />

              {/* Sections — the original written copy */}
              {d.sections.map((section, i) => (
                <div key={i} style={{ padding: '0 0 32px' }}>
                  <p style={{ ...BOLD, fontSize: 'var(--fs-9)', color: d.color, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 10px' }}>{section.title}</p>
                  <p style={{ ...REG, fontSize: 'var(--fs-13)', color: 'rgba(255,255,255,0.75)', lineHeight: 1.4, margin: 0 }}>{section.body}</p>
                  {i < d.sections.length - 1 && <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 28 }} />}
                </div>
              ))}

              {(detailKey === 'free' || detailKey === 'pro') && (
                <button onClick={onJoinPress} style={{ width: '100%', background: '#FF0000', border: 'none', cursor: 'pointer', padding: '14px 0' }}>
                  <span style={{ ...BOLD, fontSize: 'var(--fs-12)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>BECOME A SCOPE MEMBER</span>
                </button>
              )}
            </div>
          );
        })()}

        {/* LEVEL 1 — the tier LIST (+ membership/earned/CTA). Hidden while a tier
            detail is open; shown again on Back. */}
        {!detailKey && (<>
        {/* Status rows */}
        {/* Row 1 — Membership. Icon = the member's actual tier logo (min-design):
            Scope Pro badge when Pro, the Free mark otherwise (CHANGE 3). */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={vIsPaid ? '/badges/scope-pro-badge-min-design-01.png' : '/free-tier-aperture-logo-red.png'} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ ...BOLD, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>MY MEMBERSHIP</span>
              <span style={{ ...BOLD, fontSize: 'var(--fs-9)', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {membershipBarLabel({ isPaid: vIsPaid, paidUntil: vPaidUntil, cancelsAt: vCancelsAt })}
              </span>
            </div>
          </div>
          <button
            onClick={vIsPaid ? handleManage : onJoinPress}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ ...BOLD, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
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
            isScreeningRoomHolder: vTiers.isScreeningRoomHolder,
            isPaidMember: vTiers.isPaidMember,
            isInHouseCreator: vTiers.isInHouseCreator,
            firstCutCount: vFirstCutCount, // active First Cut slots (viewer-centric) — now lights here too
            composerTrackCount: vComposerTrackCount, // approved Original Music Library tracks
          }).filter((b) => b.key !== 'free'); // the Free baseline isn't an "earned" badge
          if (earned.length === 0) return null;
          return (
            <div style={{ padding: '14px 0 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
              <span style={{ ...BOLD, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em', display: 'block', marginBottom: 14 }}>BADGES EARNED</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                {earned.map((b, i) => (
                  <div key={b.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 52 }}>
                    {/* Staggered focus-pull on sheet open — racks into focus one
                        after another (100ms apart). reduced-motion → fade. */}
                    {/* Framed design-refresh card (ratio-locked — the frames
                        aren't square) at the section's established 34px width;
                        pro falls back to min-design (no framed asset yet). */}
                    <img
                      key={`${b.key}-${visible ? 'open' : 'shut'}`}
                      className="focus-pull"
                      src={b.framedSrc ?? b.bannerSrc ?? b.src}
                      alt={b.title}
                      style={{ width: 42.5, height: b.framedSrc ? 'auto' : 42.5, objectFit: 'contain', display: 'block', animation: 'focusPull 2s cubic-bezier(0.16,0.84,0.3,1) both', animationDelay: `${i * 100}ms` }} /* 34 × 1.25 — Eric's +25% */
                    />
                    <span style={{ ...BOLD, fontSize: 'var(--fs-8)', letterSpacing: '0.04em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.1, textAlign: 'center' }}>{b.title}</span>
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

        {/* Tier list — ORDER: FREE → SCOPE PRO (membership tiers together) →
            earned honors below. Sorted by the ratified order. */}
        {[...tiers].sort((a, b) => {
          const O = ['free', 'pro', 'founding', 'firstCut', 'top1k', 'srh', 'creator', 'composer'];
          return O.indexOf(a.key) - O.indexOf(b.key);
        }).map((tier, i) => (
          <div key={tier.key} id={`badge-tier-${tier.key}`}>
            <div onClick={() => setDetailKey(tier.key)} style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'flex-start', cursor: 'pointer', animation: visible ? `badgeRippleIn 300ms ease-out ${i * 45}ms both` : undefined }}>
              <div style={{ flexShrink: 0, marginTop: 2, position: 'relative', width: tier.size, height: tier.size }}>
                {/* Flat min-design icon — consistent with the BADGES EARNED grid
                    above (no 3D/glow; the new flat assets don't suit a round coin). */}
                <img src={tier.img} alt={tier.label} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', animation: visible ? `badgeGlowPulse 400ms ease-out ${i * 45 + 150}ms both` : undefined }} />
                {tierEarned(tier.key, vTiers, vIsPaid, vComposerTrackCount) && (
                  <div style={{ position: 'absolute', top: -3, right: -3, width: 6, height: 6, borderRadius: '50%', backgroundColor: '#FF0000', zIndex: 2 }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ ...BOLD, fontSize: 'var(--fs-12)', color: tier.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{tier.title}</span>
                  {/* Real earned status per the viewer's flags — every tier they
                      hold reads YOURS; the rest read NOT YET YOURS. */}
                  {tierEarned(tier.key, vTiers, vIsPaid, vComposerTrackCount) ? (
                    <span style={{ ...BOLD, fontSize: 'var(--fs-7)', color: '#FF0000', letterSpacing: '0.12em', border: '1px solid rgba(255,0,0,0.55)', padding: '1px 4px' }}>YOURS</span>
                  ) : (
                    <span style={{ ...BOLD, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em' }}>NOT YET YOURS</span>
                  )}
                </p>
                <p style={{ ...REG, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.3, margin: '0 0 6px' }}>
                  {tier.description}
                </p>
                {/* PRO (not paid) keeps the inline buy CTA; earned-badge earn
                    paths are conveyed by the single descriptor (round 2 prune). */}
                {tier.key === 'pro' && !vIsPaid && (
                  <button onClick={(e) => { e.stopPropagation(); onJoinPress(); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 6px', display: 'block' }}>
                    <span style={{ ...BOLD, fontSize: 'var(--fs-9)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.1em' }}>GET PRO →</span>
                  </button>
                )}
                <button
                  onClick={() => setDetailKey(tier.key)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0 0', display: 'inline-block' }}
                >
                  <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-8)', color: 'white', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    LEARN MORE →
                  </span>
                </button>
                <p style={{ ...BOLD, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
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
          <span style={{ ...BOLD, fontSize: 'var(--fs-12)', color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            BECOME A SCOPE MEMBER
          </span>
        </button>
        <button
          onClick={onClose}
          style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', padding: '12px 0', marginTop: 8 }}
        >
          <span style={{ ...BOLD, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            CLOSE
          </span>
        </button>
        </>)}
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
        /* Tier-detail badge-hero glow bloom (focusPull is global). */
        @keyframes glowIn { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .badge-hero-logo, .badge-hero-glow { animation: glowIn 0.6s ease both !important; }
        }
      `}</style>
    </>
  );
}
