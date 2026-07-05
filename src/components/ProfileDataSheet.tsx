"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ProfileLink } from "@/lib/userService";
import { isProMember } from "@/lib/userService";
import { BADGES, resolveBadges, BADGE_SHORT_BLURB, type BadgeKey } from "@/lib/economy/badges";
import { economyPreviewEnabled } from "@/lib/economy/flag";
import { useRouter } from "next/navigation";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  links: ProfileLink[];
  isOwnProfile: boolean;
  followers: number;
  following: number;
  totalPosts: number;
  collectors?: number;
  portfolioMc?: number;
  /** First Cut count for this profile — read via the economy boundary upstream
      and passed down (preview-gated). 0/absent → no First Cut coin. */
  firstCutCount?: number;
  /** Opens the full "Badges on Scope" tier list (the blurb's EXPLORE button).
      Wired by the profile page to close this sheet + open BadgeExplainerSheet. */
  onExploreBadges?: () => void;
  /** Follow state, passed from the public profile. The UNFOLLOW affordance lives
      HERE (not on the main page) — the main page only shows FOLLOW. Shown when
      viewing someone else's profile that you currently follow. */
  isFollowing?: boolean;
  followBusy?: boolean;
  onUnfollow?: () => void;
}

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
  } catch {}
  return null;
}

function getLinkThumb(link: ProfileLink): string | null {
  if (link.custom_thumbnail_url) return link.custom_thumbnail_url;
  if (link.thumbnail_url) return link.thumbnail_url;
  const ytId = getYouTubeId(link.url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  return null;
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

export default function ProfileDataSheet({
  isOpen, onClose, profile, links, isOwnProfile,
  followers, following, totalPosts, collectors = 0, portfolioMc = 0,
  firstCutCount = 0, onExploreBadges,
  isFollowing = false, followBusy = false, onUnfollow,
}: Props) {
  const router = useRouter();
  const [bgVisible, setBgVisible] = useState(false);
  const [sectionsVisible, setSectionsVisible] = useState(false);
  // BADGES section — tapped badge whose blurb pop-up is open (null = closed).
  const [activeBlurb, setActiveBlurb] = useState<BadgeKey | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setBgVisible(false);
      setSectionsVisible(false);
      return;
    }
    const r = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setBgVisible(true);
        setTimeout(() => setSectionsVisible(true), 100);
      });
    });
    return () => cancelAnimationFrame(r);
  }, [isOpen]);

  if (!isOpen) return null;

  const fmt = (n: number) => n.toLocaleString();

  const stats: [string, string][] = [
    ['FOLLOWERS',    fmt(followers)],
    ['FOLLOWING',    fmt(following)],
    ['COLLECTORS',   fmt(collectors)],
    ['TOTAL POSTS',  fmt(totalPosts)],
    ['PORTFOLIO MC', `$${fmt(portfolioMc)}`],
  ];

  const hasBio = !!profile?.bio;
  const hasKit = !!(profile?.kit_camera || profile?.kit_lens || profile?.kit_favorite_tool);
  const hasLinks = links.length > 0;
  const showContact = !!profile;

  // Earned badges for the BADGES section, rarity-ordered. Membership badges are
  // real/ungated; First Cut only appears when the gated count is passed down.
  const badges = profile
    ? resolveBadges({
        isFoundingMember: !!profile.is_founding_member,
        isTopCollector: !!profile.is_top_collector,
        isScreeningRoomHolder: !!profile.is_screening_room_holder,
        isPaidMember: isProMember(profile),
        isInHouseCreator: !!profile.is_in_house_creator,
        firstCutCount,
      })
    : [];
  const hasBadges = badges.length > 0;

  const sec = (delay: number): React.CSSProperties => ({
    opacity: sectionsVisible ? 1 : 0,
    transform: sectionsVisible ? 'translateY(0)' : 'translateY(-8px)',
    transition: sectionsVisible
      ? `opacity 220ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 220ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`
      : 'none',
  });

  const Divider = () => (
    <div style={{ height: 1, background: '#FF0000' }} />
  );

  const kitRows = [
    { label: 'CAMERA:', value: profile?.kit_camera },
    { label: 'LENSES:', value: profile?.kit_lens },
    { label: 'FAVORITE TOOL:', value: profile?.kit_favorite_tool },
  ].filter(r => r.value);

  const slicedLinks = links.slice(0, 3);

  return (
    <>
    {/* Stats overlay — fixed at zIndex 300 so it paints above the frozen profile header (zIndex 200) */}
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, pointerEvents: 'none' }}>
      <div style={{ maxWidth: '30rem', margin: '0 auto', position: 'relative', height: '100%' }}>
        {stats.map(([label, value], i) => (
          <div
            key={label}
            style={{
              position: 'absolute',
              top: 7 + i * 13,
              left: 255,
              right: 6,
              display: 'flex',
              justifyContent: 'space-between',
              opacity: sectionsVisible ? 1 : 0,
              transform: sectionsVisible ? 'translateY(0)' : 'translateY(-8px)',
              transition: sectionsVisible
                ? `opacity 220ms cubic-bezier(0.16,1,0.3,1) ${i * 50}ms, transform 220ms cubic-bezier(0.16,1,0.3,1) ${i * 50}ms`
                : 'none',
            }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '-0.18px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.4 }}>{label}</span>
            <span style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '-0.18px', color: '#FF0000', lineHeight: 1.4 }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
    <div
      onClick={() => { if (activeBlurb) { setActiveBlurb(null); return; } onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: `rgba(0,0,0,${bgVisible ? 0.95 : 0})`,
        transition: 'background 200ms ease',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: '30rem', margin: '0 auto', paddingBottom: 60 }}>

        {/* ── HEADER SPACER — profile page elements show through above sheet ── */}
        <div style={{ position: 'relative', height: 161 }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: '#FF0000' }} />
        </div>

        {/* ── BIO ── */}
        {hasBio && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', boxSizing: 'border-box', minHeight: 123, paddingTop: 12, paddingBottom: 12, ...sec(80) }}>
              <div style={{ width: 184, flexShrink: 0, paddingLeft: 7, ...SKB, fontSize: 40, letterSpacing: '-0.8px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
                BIO
              </div>
              <div style={{ flex: 1, paddingRight: 8, ...SKR, fontSize: 'var(--fs-10)', letterSpacing: '-0.2px', color: '#FFF', lineHeight: 1.12, whiteSpace: 'pre-wrap' }}>
                {profile.bio}
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* ── KIT ── */}
        {hasKit && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', boxSizing: 'border-box', minHeight: 125, paddingTop: 12, paddingBottom: 12, ...sec(160) }}>
              <div style={{ width: 182, flexShrink: 0, paddingLeft: 7, ...SKB, fontSize: 40, letterSpacing: '-0.8px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
                KIT
              </div>
              <div style={{ flex: 1, paddingRight: 15 }}>
                {kitRows.map((row, i) => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: i < kitRows.length - 1 ? 12 : 0 }}>
                    <span style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: '-0.2px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
                      {row.label}
                    </span>
                    <span style={{ ...SKR, fontSize: 'var(--fs-10)', letterSpacing: '-0.2px', color: '#FF0000', textTransform: 'uppercase', lineHeight: 1.12 }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* ── BADGES ── (Scope_Economy.docx §4b / Figma 3593-440)
            3D-rotating coins, titles directly beneath, tap → blurb pop-up. */}
        {hasBadges && (
          <>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', boxSizing: 'border-box', minHeight: 150, paddingTop: 12, paddingBottom: 12, ...sec(200) }}>
              <div style={{ width: 168, flexShrink: 0, paddingLeft: 4, ...SKB, fontSize: 40, letterSpacing: '-2.4px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
                BADGES
              </div>
              <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'flex-end', paddingRight: 8 }}>
                {badges.map((b) => (
                  <div
                    key={b.key}
                    onClick={(e) => { e.stopPropagation(); setActiveBlurb(b.key); }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 15, cursor: 'pointer', width: 52 }} /* gap clears the pill's 10px protrusion + breathing room — uniform across the row */
                  >
                    {/* FRAMED design-refresh card, ~50px, ratio-locked (the frames
                        aren't square — width leads, height follows the asset).
                        Falls back to the flat min-design icon (pro has no framed
                        asset yet). COUNT PILL (FC/SRH): a rounded tag half-on the
                        frame's bottom edge — dark fill, muted brand-red border,
                        shows the count whenever the badge shows (including 1). */}
                    {(() => {
                      const count = b.key === 'firstCut' ? Math.max(1, firstCutCount)
                        : b.key === 'srh' ? Math.max(1, Number((profile as Record<string, unknown> | null)?.srh_count ?? 0) || 1)
                        : null;
                      return (
                        <span style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={b.framedSrc ?? b.bannerSrc ?? b.src} alt={b.title} style={{ width: 50, height: 'auto', objectFit: 'contain', display: 'block' }} />
                          {count != null && (
                            <span style={{
                              position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', /* lower — covers less frame */
                              background: '#0b0b0b', border: '1px solid #7a2e2e', borderRadius: 4.5,
                              /* WIDE tag (ratified spec): min-width 22 + 8px side padding —
                                 a single digit reads ~2.5:1 wide; height stays compact
                                 (~13-14px). Scale proportionally at other badge sizes. */
                              minWidth: 22, boxSizing: 'border-box', textAlign: 'center',
                              padding: '0 8px', lineHeight: 1.25,
                              ...SKB, fontSize: 10, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums',
                            }}>
                              {count}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    <span style={{ ...SKB, fontSize: 'var(--fs-8)', letterSpacing: '0.04em', color: '#FFFFFF', textTransform: 'uppercase', lineHeight: 1.1, textAlign: 'center' }}>
                      {b.title}
                    </span>
                  </div>
                ))}
              </div>

              {/* Blurb pop-up is portaled to the document root (see end of file) so
                  it sits ABOVE everything — it used to live here inside the sheet's
                  zIndex:100 container, beneath the zIndex:300 stats overlay, which
                  made it unreadable AND its buttons unreliable. */}
            </div>
            <Divider />
          </>
        )}

        {/* ── LINKS ── */}
        {hasLinks && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', boxSizing: 'border-box', minHeight: 364, paddingTop: 12, paddingBottom: 12, ...sec(240) }}>
              <div style={{ width: 175, flexShrink: 0, paddingLeft: 4, ...SKB, fontSize: 40, letterSpacing: '-2.4px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
                LINKS
              </div>
              <div style={{ flex: 1 }}>
                {slicedLinks.map((link, i) => {
                  const thumb = getLinkThumb(link);
                  const domain = getDomain(link.url);
                  return (
                    <div
                      key={link.id}
                      onClick={e => { e.stopPropagation(); window.open(link.url, '_blank', 'noopener,noreferrer'); }}
                      style={{ marginBottom: i < slicedLinks.length - 1 ? 15 : 0, cursor: 'pointer' }}
                    >
                      <div style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: '-0.2px', color: '#FFF', textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.12, marginBottom: 4, width: 185 }}>
                        {link.title || domain}
                      </div>
                      <div style={{ position: 'relative', width: 185, height: 78, overflow: 'hidden', background: '#111' }}>
                        {thumb
                          ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{domain}</span>
                            </div>
                        }
                        {link.is_video && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: thumb ? 'rgba(0,0,0,0.35)' : 'transparent' }}>
                            <div style={{ width: 0, height: 0, borderLeft: '12px solid white', borderTop: '7px solid transparent', borderBottom: '7px solid transparent' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* ── CONTACT ── */}
        {showContact && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', boxSizing: 'border-box', minHeight: 235, paddingTop: 12, paddingBottom: 12, ...sec(320) }}>
              <div style={{ width: 180, flexShrink: 0, paddingLeft: 4, ...SKB, fontSize: 40, letterSpacing: '-2px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
                CONTACT
              </div>
              <div style={{ flex: 1, paddingRight: 8, textAlign: 'right' as const }}>
                {profile?.contact_email_public && profile?.contact_email && (
                  <div style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: '-0.2px', lineHeight: 1.12, marginBottom: 11 }}>
                    <span style={{ color: '#FF0000' }}>EMAIL:</span>
                    <span style={{ color: '#FFF' }}> {profile.contact_email.toUpperCase()}</span>
                  </div>
                )}
                <div
                  onClick={e => e.stopPropagation()}
                  style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: '-0.2px', color: '#FFF', textTransform: 'uppercase' as const, lineHeight: 1.12, cursor: 'pointer' }}
                >
                  DIRECT MESSAGE ON SCOPE
                </div>
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* ── BACK (+ UNFOLLOW for a followed profile) ──
            UNFOLLOW lives here, not on the main public profile (which only shows
            FOLLOW). State is driven by the parent, so it stays in sync with the
            page's FOLLOW button — unfollowing here flips both. */}
        <div style={{ display: 'flex', justifyContent: isFollowing && !isOwnProfile && onUnfollow ? 'space-between' : 'flex-end', alignItems: 'center', padding: '20px 8px 0', ...sec(400) }}>
          {isFollowing && !isOwnProfile && onUnfollow && (
            <button
              onClick={(e) => { e.stopPropagation(); if (!followBusy) onUnfollow(); }}
              disabled={followBusy}
              style={{
                background: 'transparent', border: '1px solid #FF0000', cursor: followBusy ? 'default' : 'pointer',
                padding: '7px 14px', ...SKB, fontSize: 'var(--fs-10)', letterSpacing: '0.04em', color: '#FF0000', textTransform: 'uppercase', lineHeight: 1.12,
              }}
            >
              UNFOLLOW
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              ...SKB, fontSize: 'var(--fs-10)', letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12,
            }}
          >
            BACK
          </button>
        </div>

      </div>
    </div>

    {/* ── Tier-description pop-up — PORTALED to the document root, above EVERYTHING
        (z 900) with a full dark backdrop, so nothing overlaps it and the buttons
        are always tappable. (Previously trapped in the sheet's zIndex:100 context,
        beneath the zIndex:300 stats overlay.) ── */}
    {activeBlurb && typeof document !== 'undefined' && createPortal(
      <div
        onClick={() => setActiveBlurb(null)}
        style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22 }}
      >
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 340, background: '#000', border: '1px solid #FF0000', padding: '18px 18px', animation: 'blurbIn 240ms cubic-bezier(0.16,0.84,0.3,1)' }}>
          <button onClick={(e) => { e.stopPropagation(); setActiveBlurb(null); }} aria-label="Close" style={{ position: 'absolute', top: 8, right: 10, ...SKB, fontSize: 'var(--fs-15)', lineHeight: 1, color: 'rgba(255,255,255,0.55)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>×</button>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <img
              key={activeBlurb}
              className="focus-pull"
              src={BADGES[activeBlurb].bannerSrc ?? BADGES[activeBlurb].src}
              alt={BADGES[activeBlurb].title}
              style={{ width: 60, height: 60, objectFit: 'contain', flexShrink: 0, animation: 'focusPull 1.2s cubic-bezier(0.16,0.84,0.3,1) both' }}
            />
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.16em', margin: '0 0 6px' }}>{BADGES[activeBlurb].title}</p>
              <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.70)', lineHeight: 1.45, margin: 0 }}>{BADGE_SHORT_BLURB[activeBlurb]}</p>
            </div>
          </div>

          {/* EXPLORE SCOPE BADGES — opens the full "Badges on Scope" tier list
              (BadgeExplainerSheet) via the parent; falls back to the /badges route. */}
          <button
            onClick={(e) => { e.stopPropagation(); setActiveBlurb(null); if (onExploreBadges) { onClose(); onExploreBadges(); } else { onClose(); router.push('/badges'); } }}
            style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.12em', color: '#FF0000', textTransform: 'uppercase', background: 'transparent', border: '1px solid #FF0000', cursor: 'pointer', padding: '9px 14px', marginTop: 14, width: '100%' }}
          >
            EXPLORE SCOPE BADGES →
          </button>

          {activeBlurb === 'firstCut' && economyPreviewEnabled() && profile?.username && (
            <button
              onClick={(e) => { e.stopPropagation(); setActiveBlurb(null); onClose(); router.push(`/first-cut/${profile.username}`); }}
              style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', padding: '8px 14px', marginTop: 8, width: '100%' }}
            >
              VIEW FIRST CUT →
            </button>
          )}
        </div>
      </div>,
      document.body,
    )}

    <style>{`
      @keyframes coinFlip {
        0% { transform: rotateY(0deg); }
        40% { transform: rotateY(160deg); }
        50% { transform: rotateY(180deg); }
        90% { transform: rotateY(340deg); }
        100% { transform: rotateY(360deg); }
      }
      @keyframes blurbIn {
        from { opacity: 0; transform: scale(0.92); }
        to   { opacity: 1; transform: scale(1); }
      }
    `}</style>
    </>
  );
}
