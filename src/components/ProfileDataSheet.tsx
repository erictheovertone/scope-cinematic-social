"use client";

import { useState, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import type { ProfileLink } from "@/lib/userService";
import { isProMember } from "@/lib/userService";
import { feedImage } from "@/lib/mediaUrl";
import { BADGES, resolveBadges, BADGE_SHORT_BLURB, BADGE_DISPLAY_NAME, type BadgeKey } from "@/lib/economy/badges";
import { economyPreviewEnabled } from "@/lib/economy/flag";
import { LedgerCard } from "@/components/Ledger";
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
  /** Deck count for the sheet's stats (Brief 2.4a). Plumbed from the caller's
      loaded decks list; 0/absent → shows 0. */
  decks?: number;
  /** First Cut count for this profile — read via the economy boundary upstream
      and passed down (preview-gated). 0/absent → no First Cut coin. */
  firstCutCount?: number;
  /** Brief W8 §2 — the SAME resolved held-badges list the profile badge cluster uses
      (one source of truth). The sheet no longer re-derives via resolveBadges (that fork
      dropped COMPOSER, whose count was never plumbed here). */
  badges?: ReturnType<typeof resolveBadges>;
  /** Brief W8 §1 — the page profile header's MEASURED height (ProfileHeader onMeasure /
      headerH). When the sheet is open the page header sits at z200 ABOVE this z100 sheet;
      a top spacer of this height clears all sheet content from under that banner. */
  bannerClearH?: number;
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
  followers, following, totalPosts, collectors = 0, portfolioMc = 0, decks = 0,
  firstCutCount = 0, onExploreBadges,
  badges = [], bannerClearH = 0,
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

  // Body-level takeover flag (Brief 2.4) → BottomToolbar hides the footer pill while
  // the bio sheet is up. Same mechanism the comments/music takeovers use (a body
  // dataset flag + a broadcast event), NOT an observer. `had` guards a nested
  // takeover from clearing the flag out from under a parent.
  useEffect(() => {
    if (!isOpen) return;
    const had = document.documentElement.dataset.suiteOpen;
    document.documentElement.dataset.suiteOpen = "1";
    window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    return () => {
      if (!had) delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const hasBio = !!profile?.bio;
  const hasKit = !!(profile?.kit_camera || profile?.kit_lens || profile?.kit_favorite_tool);
  const hasLinks = links.length > 0;
  const showContact = !!profile;

  // Brief W8 §2 — badges come from the `badges` prop (the profile page's cluster list, one
  // source of truth). The old internal resolveBadges fork is retired: it omitted
  // composerTrackCount (never plumbed), silently dropping COMPOSER while the cluster showed
  // it. Now cluster + sheet CANNOT diverge.
  const hasBadges = badges.length > 0;

  const sec = (delay: number): React.CSSProperties => ({
    opacity: sectionsVisible ? 1 : 0,
    transform: sectionsVisible ? 'translateY(0)' : 'translateY(-8px)',
    transition: sectionsVisible
      ? `opacity 220ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 220ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`
      : 'none',
  });
  // Opacity-only entrance for the Links section (no transform). Originally added
  // for grain (avoided a stacking context); RETAINED after grain removal (Brief
  // 1b-X) — it's simply a cleaner entrance and reverting re-risks the sheet for no gain.
  const secFlat = (delay: number): React.CSSProperties => ({
    opacity: sectionsVisible ? 1 : 0,
    transition: sectionsVisible ? `opacity 220ms cubic-bezier(0.16,1,0.3,1) ${delay}ms` : 'none',
  });

  // Full-width hairline between sections (frame reads as a faint rule, not solid ivory).
  const Divider = () => <div style={{ height: 1, background: 'var(--hairline)' }} />;

  // Left-anchored section title — 75 Bold 24px, ink-100, display soften, Title Case.
  const titleStyle: React.CSSProperties = {
    width: 168, flexShrink: 0, paddingLeft: 6,
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24,
    letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', lineHeight: 1.05,
  };
  const sectionPad: React.CSSProperties = { display: 'flex', boxSizing: 'border-box', padding: '16px 8px 18px' };

  const kitRows = [
    { label: 'CAMERA:', value: profile?.kit_camera },
    { label: 'LENSES:', value: profile?.kit_lens },
    { label: 'FAVORITE TOOL:', value: profile?.kit_favorite_tool },
  ].filter(r => r.value);

  const slicedLinks = links.slice(0, 3);

  // ── Sheet header data (Brief 2.4a) — the Haas header IS part of the sheet ──────
  const displayName = String(profile?.display_name ?? '');
  const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ');
  const handle = String(profile?.username ?? '');
  const isPro = profile ? isProMember(profile) : false;
  const pfpUrl = profile?.profile_image_url ? String(profile.profile_image_url) : null;
  const metaLoc = profile?.location ? String(profile.location) : '';
  const metaPrimary = links?.find((l) => (l as { is_primary?: boolean }).is_primary) ?? null;
  const mcDisplay = portfolioMc > 0 ? `$${portfolioMc.toLocaleString()}` : '—'; // dash rule
  // Three stat column groups (label/value). Programs omitted — no such data field.
  const statGroups: { label: string; value: string }[][] = [
    [
      { label: 'Followers', value: followers.toLocaleString() },
      { label: 'Collectors', value: collectors.toLocaleString() },
      { label: 'Market Cap', value: mcDisplay },
    ],
    [
      { label: 'Following', value: following.toLocaleString() },
      { label: 'Total Posts', value: totalPosts.toLocaleString() },
    ],
    [
      { label: 'Decks', value: decks.toLocaleString() },
    ],
  ];

  // Editorial spine — build ONLY sections that have data; dividers render BETWEEN
  // them below, so an absent section leaves no orphan rule (empty-state collapse).
  const sectionNodes: React.ReactNode[] = [];

  if (hasBio) sectionNodes.push(
    <div key="bio" style={{ ...sectionPad, ...sec(80) }}>
      <div style={titleStyle}>Bio</div>
      <div style={{ flex: 1, fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 10, color: 'rgba(229,225,219,0.8)', lineHeight: 1.12, letterSpacing: 'var(--track-body)', whiteSpace: 'pre-wrap' }}>
        {profile.bio}
      </div>
    </div>
  );

  // BADGES — IMAGE CARDS (Brief 2.4a, per Eric's reference): hairline-framed
  // container + the new badge art (native aspect, no distortion) + the DISPLAY name
  // beneath. Up to 3 per row, wrapping. Held badges only; tap → blurb (unchanged).
  if (hasBadges) sectionNodes.push(
    <div key="badges" style={{ ...sectionPad, ...sec(140) }}>
      <div style={titleStyle}>Badges</div>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 10, alignContent: 'flex-start' }}>
        {badges.map((b) => (
          <button
            key={b.key}
            onClick={(e) => { e.stopPropagation(); setActiveBlurb(b.key); }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 'calc((100% - 20px) / 3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <span style={{ width: '100%', height: 46, borderRadius: 9, border: '0.5px solid rgba(229,225,219,0.3)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src={(b.framedSrc ?? b.bannerSrc ?? b.src) as string} alt={BADGE_DISPLAY_NAME[b.key]} style={{ maxWidth: '78%', maxHeight: '64%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} />
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 7.5, letterSpacing: '0.12em', color: 'rgba(229,225,219,0.46)', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.1 }}>{BADGE_DISPLAY_NAME[b.key]}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // KIT — ledger label/value rows. The old 2×4 KIT-icon display is NOT in this frame
  // (its component is FLAGGED for deprecation review, not deleted).
  if (hasKit) sectionNodes.push(
    <div key="kit" style={{ ...sectionPad, ...sec(200) }}>
      <div style={titleStyle}>Kit</div>
      <div style={{ flex: 1 }}>
        {kitRows.map((row, i) => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: i < kitRows.length - 1 ? 10 : 0 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 10, color: 'rgba(229,225,219,0.53)', letterSpacing: 'var(--track-body)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{row.label}</span>
            <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 10, color: 'rgba(229,225,219,0.79)', letterSpacing: 'var(--track-body)', textTransform: 'uppercase', textAlign: 'right' }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // LINKS — right-aligned label over a 185×78 preview thumbnail. No thumbnail →
  // ledger-card placeholder (existing preview paths only; no new fetch pipeline).
  if (hasLinks) sectionNodes.push(
    <div key="links" style={{ ...sectionPad, ...secFlat(260) }}>
      <div style={titleStyle}>Links</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }}>
        {slicedLinks.map((link) => {
          const thumb = getLinkThumb(link);
          const domain = getDomain(link.url);
          return (
            <div key={link.id} onClick={(e) => { e.stopPropagation(); window.open(link.url, '_blank', 'noopener,noreferrer'); }} style={{ width: 185, cursor: 'pointer' }}>
              <div style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 10, color: 'rgba(229,225,219,0.65)', letterSpacing: 'var(--track-body)', textAlign: 'right', marginBottom: 5 }}>
                {link.title || domain}
              </div>
              {thumb ? (
                <div style={{ position: 'relative', width: 185, height: 78, overflow: 'hidden', borderRadius: 4, background: '#111' }}>
                  <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {link.is_video && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
                      <div style={{ width: 0, height: 0, borderLeft: '12px solid white', borderTop: '7px solid transparent', borderBottom: '7px solid transparent' }} />
                    </div>
                  )}
                </div>
              ) : (
                <LedgerCard variant="border" radius={6} style={{ width: 185, height: 78, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 9, color: 'rgba(229,225,219,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{domain}</span>
                </LedgerCard>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // CONTACT — email (public only) + DIRECT MESSAGE ON SCOPE → existing DM thread route.
  if (showContact) sectionNodes.push(
    <div key="contact" style={{ ...sectionPad, ...sec(320) }}>
      <div style={titleStyle}>Contact</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 11, textAlign: 'right' as const }}>
        {profile?.contact_email_public && profile?.contact_email && (
          <div>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 10, color: 'rgba(229,225,219,0.31)', letterSpacing: 'var(--track-body)', textTransform: 'uppercase' }}>EMAIL </span>
            <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 10, color: 'var(--ink-100)', letterSpacing: 'var(--track-body)', textTransform: 'uppercase' }}>{profile.contact_email.toUpperCase()}</span>
          </div>
        )}
        {profile?.username && (
          <div
            onClick={(e) => { e.stopPropagation(); onClose(); router.push('/dm/' + profile.username); }}
            style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 10, color: 'var(--ink-100)', letterSpacing: 'var(--track-body)', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            DIRECT MESSAGE ON SCOPE
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
    {/* Full-viewport takeover over the profile. The scrim is the OWN scroll container
        (.bio-sheet-scroll → overscroll-behavior: contain traps the scroll here, no
        chaining to the profile beneath). Profile shows faintly through at 0.95. */}
    <div
      className="bio-sheet-scroll"
      onClick={() => { if (activeBlurb) { setActiveBlurb(null); return; } onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: `rgba(5,5,5,${bgVisible ? 0.95 : 0})`,
        transition: 'background 200ms ease',
        overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ maxWidth: '30rem', margin: '0 auto', paddingBottom: 70 }}>
        {/* Brief W8 §1 — clear the page profile-header banner (jumps to z200 while the sheet
            is open, ABOVE this z100 sheet). Spacer is bound to the header's MEASURED height
            (bannerClearH = ProfileHeader onMeasure), so W4-style header changes can't re-bury
            the sheet. +8 = a small gap below the banner. */}
        <div aria-hidden style={{ height: `calc(${bannerClearH + 8}px + env(safe-area-inset-top, 0px))`, flexShrink: 0 }} />
        {/* ── SHEET HEADER (Brief 2.4a) — opaque, in-scroll identity block: PFP +
            name + handle + expanded 3-group stats (node 141:733's Haas header). ── */}
        <div style={{ position: 'relative', padding: '13px 12px 8px', minHeight: 104 }}>
          <div style={{ position: 'absolute', left: 6, top: 13, width: 86, height: 86, border: '1px solid var(--avatar-frame)', boxSizing: 'border-box', overflow: 'hidden' }}>
            {pfpUrl
              ? <img src={feedImage(pfpUrl, 172)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <div style={{ width: '100%', height: '100%', background: '#222' }} />}
          </div>
          <div style={{ marginLeft: 92 }}>
            {/* Name (wide first/last gap) + PRO, with the handle centered beneath. */}
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 28 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{firstName}</span>
                {(lastName || isPro) && (
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                    {lastName && <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{lastName}</span>}
                    {isPro && <span style={{ fontFamily: 'var(--font-black)', fontWeight: 900, fontSize: 6.7, color: 'rgba(229,225,219,0.64)', letterSpacing: 'var(--track-wide)', alignSelf: 'flex-start', transform: 'translateY(1px)' }}>PRO</span>}
                  </span>
                )}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, opacity: 0.64, marginTop: 3 }}>
                <span style={{ fontFamily: 'var(--font-light)', fontWeight: 400, fontSize: 8, color: 'var(--ink-100)', letterSpacing: 'var(--track-wide)' }}>[ at ]</span>
                <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 10, color: 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)' }}>{handle}</span>
              </div>
            </div>
            {/* Expanded stats — 3 groups, vertical hairline separators between. */}
            <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 14 }}>
              {statGroups.map((group, gi) => (
                <div key={gi} style={{ display: 'flex', alignItems: 'stretch' }}>
                  {gi > 0 && <div style={{ width: 1, background: 'var(--hairline)', margin: '0 7px', alignSelf: 'stretch' }} />}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {group.map((row) => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 8.2, color: 'rgba(229,225,219,0.71)', letterSpacing: 'var(--track-body)', whiteSpace: 'nowrap' }}>{row.label}</span>
                        <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 8.5, color: 'rgba(229,225,219,0.71)', letterSpacing: 'var(--track-body)', whiteSpace: 'nowrap', textAlign: 'right' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── META LINE — location · primary link (desktop meta language, scaled).
            Renders nothing when both are absent (no orphan spacing). ── */}
        {(metaLoc || metaPrimary) && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, padding: '0 12px 6px' }}>
            {metaLoc && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, color: 'rgba(229,225,219,0.58)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.58)" strokeWidth="1.6"><path d="M12 21s-6.5-5.4-6.5-10.5A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.5C18.5 15.6 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></svg>
                {metaLoc}
              </span>
            )}
            {metaPrimary && (
              <a href={metaPrimary.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, color: 'rgba(229,225,219,0.58)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)', textDecoration: 'none' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.58)" strokeWidth="1.6"><path d="M10 14l7-7M13 5h6v6M11 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
                {metaPrimary.title || getDomain(metaPrimary.url)}
              </a>
            )}
          </div>
        )}

        {sectionNodes.map((node, i) => (
          <Fragment key={i}>
            {i > 0 && <Divider />}
            {node}
          </Fragment>
        ))}

        {/* Return (+ UNFOLLOW for a followed profile — existing affordance kept). */}
        <div style={{ display: 'flex', justifyContent: isFollowing && !isOwnProfile && onUnfollow ? 'space-between' : 'flex-end', alignItems: 'center', padding: '24px 8px 0', ...sec(400) }}>
          {isFollowing && !isOwnProfile && onUnfollow && (
            <button
              onClick={(e) => { e.stopPropagation(); if (!followBusy) onUnfollow(); }}
              disabled={followBusy}
              style={{ background: 'transparent', border: '1px solid var(--hairline-strong)', cursor: followBusy ? 'default' : 'pointer', padding: '7px 14px', fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 'var(--fs-10)', letterSpacing: '0.04em', color: 'rgba(229,225,219,0.7)', textTransform: 'uppercase' }}
            >
              UNFOLLOW
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            aria-label="Close bio sheet"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 4px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: 'var(--track-display)', color: 'rgba(229,225,219,0.67)', lineHeight: 1 }}
          >
            Return
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
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 340, background: '#000', border: '1px solid #E5E1DB', padding: '18px 18px', animation: 'blurbIn 240ms cubic-bezier(0.16,0.84,0.3,1)' }}>
          <button onClick={(e) => { e.stopPropagation(); setActiveBlurb(null); }} aria-label="Close" style={{ position: 'absolute', top: 8, right: 10, ...SKB, fontSize: 'var(--fs-15)', lineHeight: 1, color: 'rgba(229,225,219,0.55)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>×</button>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <img
              key={activeBlurb}
              className="focus-pull"
              src={BADGES[activeBlurb].bannerSrc ?? BADGES[activeBlurb].src}
              alt={BADGES[activeBlurb].title}
              style={{ width: 60, height: 60, objectFit: 'contain', flexShrink: 0, animation: 'focusPull 1.2s cubic-bezier(0.16,0.84,0.3,1) both' }}
            />
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.16em', margin: '0 0 6px' }}>{BADGE_DISPLAY_NAME[activeBlurb]}</p>
              <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(229,225,219,0.70)', lineHeight: 1.45, margin: 0 }}>{BADGE_SHORT_BLURB[activeBlurb]}</p>
            </div>
          </div>

          {/* EXPLORE SCOPE BADGES — opens the full "Badges on Scope" tier list
              (BadgeExplainerSheet) via the parent; falls back to the /badges route. */}
          <button
            onClick={(e) => { e.stopPropagation(); setActiveBlurb(null); if (onExploreBadges) { onClose(); onExploreBadges(); } else { onClose(); router.push('/badges'); } }}
            style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.12em', color: '#E5E1DB', textTransform: 'uppercase', background: 'transparent', border: '1px solid #E5E1DB', cursor: 'pointer', padding: '9px 14px', marginTop: 14, width: '100%' }}
          >
            EXPLORE SCOPE BADGES →
          </button>

          {activeBlurb === 'firstCut' && economyPreviewEnabled() && profile?.username && (
            <button
              onClick={(e) => { e.stopPropagation(); setActiveBlurb(null); onClose(); router.push(`/first-cut/${profile.username}`); }}
              style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.12em', color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', background: 'transparent', border: '1px solid rgba(229,225,219,0.25)', cursor: 'pointer', padding: '8px 14px', marginTop: 8, width: '100%' }}
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
