'use client';
// ── DESKTOP BIO SHEET — the personal-site treatment (Eric's reference) ────────
// Opened from the profile ⓘ (replaces the ProfileDataSheet presentation on
// desktop). A full-height takeover (reads better than a modal for a rich,
// scrollable personal site), black, hairline-separated bands. Every band hides
// when its data is unset. All data from existing fields. Desktop only.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { feedImage } from '@/lib/mediaUrl';
import { useEconomy } from '@/components/EconomyProvider';
import type { ProfileLink } from '@/lib/userService';
import type { BadgeMeta } from '@/lib/economy/badges';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(229,225,219,0.12)';
const RED = '#E5E1DB';
const TOTAL_BADGES = 7;

// ── Brief D11 — auto-banner portrait geometry ────────────────────────────────
const BANNER_H = 460;                 // band height
const PORTRAIT_TARGET = 420;          // square edge = BANNER_H − 40 vertical breathing (§1)
const PORTRAIT_FEATHER = 68;          // rectangular-feather falloff, ~60–80px (§2)
// §2 — TWO intersecting linear-gradient masks = a soft-cornered RECTANGLE feather (a photograph
// dissolving into the band), never a radial spotlight. `intersect`/`source-in` so a pixel shows
// only where BOTH axes are opaque (default `add` would union into a plus shape).
const PORTRAIT_MASK = `linear-gradient(to right, transparent 0, #000 ${PORTRAIT_FEATHER}px, #000 calc(100% - ${PORTRAIT_FEATHER}px), transparent 100%), linear-gradient(to bottom, transparent 0, #000 ${PORTRAIT_FEATHER}px, #000 calc(100% - ${PORTRAIT_FEATHER}px), transparent 100%)`;

type P = Record<string, unknown>;
const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);

interface Props {
  profile: P | null;
  isOwn: boolean;
  links: ProfileLink[];
  badges: BadgeMeta[];
  posts: P[];
  followers: number; following: number; collectors: number; totalPosts: number;
  decks: number; // Brief W11 §2 — decks count (desktop parity with the mobile bio sheet)
  firstCutCount: number;
  onClose: () => void;
  onViewBadges: () => void;
  onMessage: () => void;
}

// One shared band frame: full-width row, hairline top, left label column.
function Band({ label, sub, action, children }: { label: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 44, padding: '44px 0', borderTop: `1px solid ${HAIR}` }}>
      <div style={{ width: 250, flexShrink: 0 }}>
        {/* big left-column section title + red underline accent (per the reference) */}
        <p style={{ ...SKB, fontSize: 'calc(32px * var(--type-scale))', lineHeight: 1, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0 }}>{label}</p>
        <div style={{ width: 32, height: 2, background: RED, margin: '13px 0 0' }} />
        {sub && <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '13px 0 0' }}>{sub}</p>}
        {action && <div style={{ marginTop: 16 }}>{action}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>{children}</div>
    </div>
  );
}

export default function DesktopBioSheet({ profile, isOwn, links, badges, posts, followers, following, collectors, totalPosts, decks, firstCutCount, onClose, onViewBadges, onMessage }: Props) {
  const router = useRouter();
  const economy = useEconomy();
  const [portfolioMc, setPortfolioMc] = useState<number | null>(null);
  // Brief D11 §1 — the loaded avatar's native px, read on <img> load. Caps the portrait render
  // size at native × 1.25 so a small master never upscales to softness (avatars have no rendition
  // tiers and top out at a 512 master — see report; a truly sharp large PFP is a Q1 follow-up).
  const [pfpNat, setPfpNat] = useState<number | null>(null);

  const name = String(profile?.display_name ?? profile?.username ?? '');
  const handle = String(profile?.username ?? '');
  const pfp = profile?.profile_image_url ? String(profile.profile_image_url) : null;
  const portraitSize = pfpNat ? Math.min(PORTRAIT_TARGET, Math.round(pfpNat * 1.25)) : PORTRAIT_TARGET;
  const shortBio = String(profile?.short_bio ?? '');
  const longBio = String(profile?.bio ?? '');
  const kit = [
    { cat: 'CAMERA', val: String(profile?.kit_camera ?? '') },
    { cat: 'LENSES', val: String(profile?.kit_lens ?? '') },
    { cat: 'FAVORITE TOOL', val: String(profile?.kit_favorite_tool ?? '') },
  ].filter((k) => k.val);
  const email = profile?.contact_email && (profile?.contact_email_public || isOwn) ? String(profile.contact_email) : '';
  const srhCount = Math.max(0, Number(profile?.srh_count ?? 0) || 0);
  const recentPostImg = (posts.find((p) => (p.media_urls as string[])?.[0]) as P | undefined);
  const linkFallback = recentPostImg ? ((recentPostImg.poster_url as string) || (recentPostImg.thumbnail_url as string) || (recentPostImg.media_urls as string[])?.[0]) : null;

  // PORTFOLIO MC — sum of the user's MINTED posts' market caps (economy
  // getPostMarket, the same boundary the panel/tiles read). Untraded → 0.
  useEffect(() => {
    let dead = false;
    const coinPosts = posts.filter((p) => p.coin_address);
    if (!coinPosts.length) { setPortfolioMc(0); return; }
    (async () => {
      const vals = await Promise.all(coinPosts.map(async (p) => {
        try { return (await economy.getPostMarket(String(p.id))).mcUsd || 0; } catch { return 0; }
      }));
      if (!dead) setPortfolioMc(vals.reduce((a, b) => a + b, 0));
    })();
    return () => { dead = true; };
  }, [posts, economy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const stat = (label: string, value: string | number) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, padding: '7px 0' }}>
      <span style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</span>
      <span style={{ ...SKB, fontSize: 14, color: RED, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );

  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 'var(--rail-w)', zIndex: 150, background: '#000', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <button onClick={onClose} aria-label="Close" style={{ position: 'fixed', top: 20, right: 30, zIndex: 4, background: 'transparent', border: 'none', cursor: 'pointer', ...SKR, fontSize: 22, color: 'rgba(229,225,219,0.6)', lineHeight: 1, padding: 4 }}>✕</button>

      <div style={{ maxWidth: 'var(--shell-narrow)', margin: '0 auto', padding: '0 40px 80px' }}>{/* Brief R1 — reading/detail width = --shell-narrow (1180), intentionally tighter than the grid --shell-max */}

        {/* ═══ 1. AUTO-BANNER HERO — the portrait-composition model (Brief D11) ═══ */}
        {/* One composition, layered bottom→top: a heavily-blurred underlay carries the portrait's
            colour across the whole band (letterbox-via-blur); text-zone scrims darken the sides
            UNDER the portrait (so its opaque pixels never dim — only its feathered edges blend);
            the sharp 1:1 square portrait sits between the columns, its rectangular edges feathering
            into the band. A photograph dissolving into the banner — never a spotlight. */}
        <div style={{ position: 'relative', height: BANNER_H, margin: '0 -40px', overflow: 'hidden', background: '#000' }}>
          {/* §3 — LETTERBOX-VIA-BLUR underlay: same PFP, heavily blurred + dimmed to ~30% luminance
              (blur 64 · brightness 0.55 · opacity 0.42), scale 1.2 hides the blur's soft band edges. */}
          {pfp && (
            <img src={feedImage(pfp, 720)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(64px) brightness(0.55)', opacity: 0.42, transform: 'scale(1.2)' }} />
          )}
          {/* Text-zone scrims — BELOW the portrait so the face never dims; they only darken the
              underlay behind the header text (left identity zone, right stats zone) + edge feather. */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #000 0%, rgba(0,0,0,0.82) 26%, rgba(0,0,0,0.22) 50%, transparent 70%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(270deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 20%, transparent 40%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 18%, transparent 82%, #000 100%)' }} />
          {/* §1/§2 — the SHARP square portrait at its OWN 1:1 aspect (never cover-stretched into a
              non-square zone), sized to the band height − breathing (portraitSize, ≤420²), centred
              right-of-band-centre (calc(50%+90px)) between the text (ends ~x480) and stats (starts
              ~x880) columns. object-position center 30% keeps a face (upper third) framed for a
              non-square source. Edges FEATHER via PORTRAIT_MASK; render caps at native×1.25. */}
          {pfp && (
            <div style={{ position: 'absolute', top: '50%', left: 'calc(50% + 90px)', transform: 'translate(-50%, -50%)', width: portraitSize, height: portraitSize }}>
              <img
                src={feedImage(pfp, 900)}
                alt=""
                onLoad={(e) => setPfpNat(e.currentTarget.naturalWidth || null)}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', display: 'block', filter: 'brightness(1.04)',
                  WebkitMaskImage: PORTRAIT_MASK, maskImage: PORTRAIT_MASK,
                  WebkitMaskComposite: 'source-in', maskComposite: 'intersect',
                }}
              />
            </div>
          )}

          {/* left overlay — identity */}
          <div style={{ position: 'absolute', left: 40, top: 0, bottom: 0, width: 440, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ ...SKB, fontSize: 11, color: RED, textTransform: 'uppercase', letterSpacing: '0.22em', margin: '0 0 14px' }}>CREATOR</p>
            <h1 style={{ ...SKB, fontSize: 'calc(46px * var(--type-scale))', lineHeight: 1, letterSpacing: '-0.02em', color: '#E5E1DB', textTransform: 'uppercase', margin: 0 }}>{name}</h1>
            {handle && <p style={{ ...SKR, fontSize: 14, color: 'rgba(229,225,219,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '10px 0 0' }}>@{handle}</p>}
            {shortBio && <p style={{ ...SKR, fontSize: 14, color: 'rgba(229,225,219,0.7)', lineHeight: 1.6, margin: '18px 0 0', maxWidth: 400 }}>{shortBio}</p>}
            <button onClick={onMessage} style={{ ...SKB, alignSelf: 'flex-start', fontSize: 11, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: '1px solid rgba(229,225,219,0.4)', cursor: 'pointer', padding: '12px 22px', margin: '26px 0 0' }}>MESSAGE {name.split(' ')[0]}</button>
          </div>

          {/* right overlay — stats + portfolio MC */}
          <div style={{ position: 'absolute', right: 40, top: 0, bottom: 0, width: 260, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {stat('FOLLOWERS', followers)}
            {stat('FOLLOWING', following)}
            {stat('COLLECTORS', collectors)}
            {stat('TOTAL POSTS', totalPosts)}
            {/* Brief W11 §2 — DECKS column (was absent on desktop); same source as mobile. */}
            {stat('DECKS', decks)}
            <div style={{ height: 1, background: HAIR, margin: '10px 0' }} />
            {stat('PORTFOLIO MC', portfolioMc == null ? '…' : usd(portfolioMc))}
          </div>
        </div>

        {/* ═══ 2. BANDS ═══ */}
        {badges.length > 0 && (
          <Band label="BADGES" sub={`${badges.length} / ${TOTAL_BADGES} UNLOCKED`} action={<button onClick={onViewBadges} style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>VIEW ALL BADGES →</button>}>
            {/* Brief D12 — badges ~1.5× (art 40→60, card 76→112, label 9→10 one step) and
                CLICKABLE: a HELD composer badge routes to the viewed profile's discography
                (M11 parity — /composer/[handle] exists on desktop); every other badge opens
                DesktopBadgesSheet via the SAME opener as VIEW ALL (onViewBadges). Native
                <button> → focusable + Enter/Space. Hover = a slight opacity/border lift (no
                art scale) per the press system. This strip lists only UNLOCKED badges; the
                locked "how to earn" copy lives in the sheet these open. */}
            <style>{`
              .d12-badge{display:flex;flex-direction:column;align-items:center;gap:10px;width:112px;background:transparent;border:1px solid transparent;cursor:pointer;padding:12px 10px;opacity:0.92;transition:opacity 140ms ease,border-color 140ms ease,background 140ms ease}
              .d12-badge:hover,.d12-badge:focus-visible{opacity:1;border-color:rgba(229,225,219,0.18);background:rgba(229,225,219,0.03);outline:none}
            `}</style>
            <div style={{ display: 'flex', gap: 34, flexWrap: 'wrap' }}>
              {badges.map((b) => (
                <button
                  key={b.key}
                  className="d12-badge"
                  onClick={() => { if (b.key === 'composer' && handle) { onClose(); router.push(`/composer/${handle}`); } else { onViewBadges(); } }}
                  aria-label={`${b.key === 'top1k' ? 'Collector' : b.title} badge — view details`}
                >
                  <img src={b.bannerSrc ?? b.src} alt="" style={{ width: 60, height: 60, objectFit: 'contain' }} />
                  <span style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.65)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>{b.key === 'top1k' ? 'COLLECTOR' : b.title}</span>
                  {b.key === 'firstCut' && firstCutCount > 0 && <span style={{ ...SKB, fontSize: 9, color: RED }}>{firstCutCount} SLOTS</span>}
                  {b.key === 'srh' && srhCount > 0 && <span style={{ ...SKB, fontSize: 9, color: RED }}>×{srhCount}</span>}
                </button>
              ))}
            </div>
          </Band>
        )}

        {longBio && (
          <Band label="BIO">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', top: -18, right: 0, ...SKB, fontSize: 'calc(70px * var(--type-scale))', color: 'rgba(229,225,219,0.08)', lineHeight: 1 }}>&rdquo;</span>
              <p style={{ ...SKR, fontSize: 15, color: 'rgba(229,225,219,0.72)', lineHeight: 1.7, margin: 0, maxWidth: 620 }}>{longBio}</p>
            </div>
          </Band>
        )}

        {kit.length > 0 && (
          <Band label="KIT">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {kit.map((k) => (
                <div key={k.cat} style={{ width: 200, border: `1px solid ${HAIR}`, background: '#050505', padding: '18px 18px 20px' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ display: 'block', marginBottom: 14 }}><rect x="3" y="6.5" width="18" height="12" rx="1.5" stroke="rgba(229,225,219,0.55)" strokeWidth="1.3"/><circle cx="12" cy="12.5" r="3.2" stroke="rgba(229,225,219,0.55)" strokeWidth="1.3"/><path d="M8 6.5l1-2h6l1 2" stroke="rgba(229,225,219,0.55)" strokeWidth="1.3"/></svg>
                  <p style={{ ...SKB, fontSize: 9, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 6px' }}>{k.cat}</p>
                  <p style={{ ...SKB, fontSize: 13, color: '#E5E1DB', margin: 0 }}>{k.val}</p>
                </div>
              ))}
            </div>
          </Band>
        )}

        {links.length > 0 && (
          <Band label="LINKS" action={<span style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>VIEW ALL LINKS →</span>}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[...links].sort((a, b) => Number((b as { is_primary?: boolean }).is_primary) - Number((a as { is_primary?: boolean }).is_primary)).slice(0, 6).map((l) => {
                const img = (l as { custom_thumbnail_url?: string }).custom_thumbnail_url || l.thumbnail_url || linkFallback;
                return (
                  <button key={l.id} onClick={() => window.open(l.url, '_blank')} style={{ width: 236, textAlign: 'left', background: '#050505', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
                    <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#0d0d0d', overflow: 'hidden' }}>
                      {img && <img src={feedImage(img as string, 480)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.85 }} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '11px 13px' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ ...SKB, fontSize: 11, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title || l.url}</p>
                        <p style={{ ...SKR, fontSize: 9.5, color: 'rgba(229,225,219,0.4)', margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.url.replace(/^https?:\/\//, '')}</p>
                      </div>
                      <span style={{ ...SKB, fontSize: 13, color: 'rgba(229,225,219,0.5)', flexShrink: 0 }}>→</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Band>
        )}

        <Band label="CONTACT">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <button onClick={onMessage} style={{ width: 260, textAlign: 'left', background: '#050505', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: '18px 20px' }}>
              <p style={{ ...SKB, fontSize: 9, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 6px' }}>DIRECT MESSAGE</p>
              <p style={{ ...SKB, fontSize: 13, color: '#E5E1DB', margin: 0 }}>MESSAGE {name.split(' ')[0]} →</p>
            </button>
            {email && (
              <a href={`mailto:${email}`} style={{ width: 260, textDecoration: 'none', background: '#050505', border: `1px solid ${HAIR}`, padding: '18px 20px', display: 'block' }}>
                <p style={{ ...SKB, fontSize: 9, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 6px' }}>EMAIL</p>
                <p style={{ ...SKB, fontSize: 13, color: '#E5E1DB', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</p>
              </a>
            )}
          </div>
        </Band>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '48px 0 0', borderTop: `1px solid ${HAIR}`, marginTop: 12 }}>
          <span style={{ ...SKB, fontSize: 20, color: RED, lineHeight: 1 }}>[</span>
          <span style={{ ...SKB, fontSize: 11, color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', letterSpacing: '0.3em' }}>CREATE. CONNECT. COLLECT.</span>
          <span style={{ ...SKB, fontSize: 20, color: RED, lineHeight: 1 }}>]</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
