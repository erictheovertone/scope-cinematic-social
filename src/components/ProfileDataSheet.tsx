"use client";

import { useState, useEffect } from "react";
import type { ProfileLink } from "@/lib/userService";

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
}

export default function ProfileDataSheet({
  isOpen, onClose, profile, links, isOwnProfile,
  followers, following, totalPosts, collectors = 0, portfolioMc = 0,
}: Props) {
  const [bgVisible, setBgVisible] = useState(false);
  const [sectionsVisible, setSectionsVisible] = useState(false);

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

  const hasBio = !!profile?.bio;
  const hasKit = !!(profile?.kit_camera || profile?.kit_lens || profile?.kit_favorite_tool);
  const hasLinks = links.length > 0;
  const showContact = !isOwnProfile && !!(profile?.contact_email && profile?.contact_email_public);
  const numLinks = Math.min(links.length, 3);

  const sec = (delay: number): React.CSSProperties => ({
    opacity: sectionsVisible ? 1 : 0,
    transform: sectionsVisible ? 'translateY(0)' : 'translateY(-8px)',
    transition: sectionsVisible
      ? `opacity 220ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 220ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`
      : 'none',
  });

  const RULE = () => (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: '#FF0000' }} />
  );

  const kitRows = [
    { label: 'CAMERA:', value: profile?.kit_camera },
    { label: 'LENSES:', value: profile?.kit_lens },
    { label: 'FAVORITE TOOL:', value: profile?.kit_favorite_tool },
  ].filter(r => r.value);

  // LINKS section height: last card media bottom + 30px padding
  const linksHeight = numLinks > 0
    ? Math.max((numLinks - 1) * 108 + 93 + 30, 182) // ensure BIG label fits
    : 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: `rgba(0,0,0,${bgVisible ? 0.95 : 0})`,
        transition: 'background 200ms ease',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 375, margin: '0 auto', paddingBottom: 60 }}>

        {/* ── HEADER ── always shown ── */}
        <div style={{ position: 'relative', height: 161, ...sec(0) }}>

          {/* PFP */}
          <div style={{ position: 'absolute', top: 8, left: 7, width: 80, height: 80, overflow: 'hidden' }}>
            {profile?.profile_image_url
              ? <img src={profile.profile_image_url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', display: 'block' }} />
              : <div style={{ width: 80, height: 80, background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ ...SKB, fontSize: 22, color: '#fff' }}>{(profile?.username || '?')[0].toUpperCase()}</span>
                </div>
            }
          </div>

          {/* Red accent line — right of PFP */}
          <div style={{ position: 'absolute', top: 8, left: 89, width: 1, height: 66, background: '#FF0000' }} />

          {/* Name */}
          <div style={{ position: 'absolute', top: 80, left: 7, ...SKB, fontSize: 13, letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.4 }}>
            {profile?.display_name || profile?.username}
          </div>

          {/* Handle */}
          <div style={{ position: 'absolute', top: 95, left: 6, ...SKB, fontSize: 10, letterSpacing: '-0.02em', color: '#FFF', lineHeight: 1.4 }}>
            @{profile?.username}
          </div>

          {/* Stats — two-column, right side */}
          {([
            ['FOLLOWERS', fmt(followers)],
            ['FOLLOWING', fmt(following)],
            ['COLLECTORS', fmt(collectors)],
            ['TOTAL POSTS', fmt(totalPosts)],
            ['PORTFOLIO MC', `$${fmt(portfolioMc)}`],
          ] as [string, string][]).map(([label, value], i) => (
            <div key={label} style={{ position: 'absolute', top: 32 + i * 14, left: 161, right: 7, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ ...SKB, fontSize: 9, letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.4 }}>{label}</span>
              <span style={{ ...SKB, fontSize: 9, letterSpacing: '-0.02em', color: '#FF0000', lineHeight: 1.4 }}>{value}</span>
            </div>
          ))}

          <RULE />
        </div>

        {/* ── BIO ── */}
        {hasBio && (
          <div style={{ position: 'relative', height: 97, marginTop: 26, ...sec(80) }}>
            {/* Big section label */}
            <div style={{ position: 'absolute', top: 11, left: 7, ...SKB, fontSize: 40, letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
              BIO
            </div>
            {/* Body text */}
            <div style={{ position: 'absolute', top: 0, left: 184, width: 183, ...SKR, fontSize: 10, letterSpacing: '-0.02em', color: '#FFF', lineHeight: 1.12, whiteSpace: 'pre-wrap' }}>
              {profile.bio}
            </div>
            <RULE />
          </div>
        )}

        {/* ── KIT ── */}
        {hasKit && (
          <div style={{ position: 'relative', height: Math.max(99, kitRows.length * 26 + 18), marginTop: 26, ...sec(160) }}>
            {/* Big section label */}
            <div style={{ position: 'absolute', top: 14, left: 7, ...SKB, fontSize: 40, letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
              KIT
            </div>
            {/* Label + Value rows */}
            {kitRows.map((row, i) => (
              <div key={row.label} style={{ position: 'absolute', top: i * 26, left: 192, right: 7, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ ...SKB, fontSize: 10, letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase', textAlign: 'right', width: 72, flexShrink: 0 }}>
                  {row.label}
                </span>
                <span style={{ ...SKR, fontSize: 10, letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase' }}>
                  {row.value}
                </span>
              </div>
            ))}
            <RULE />
          </div>
        )}

        {/* ── LINKS ── */}
        {hasLinks && (
          <div style={{ position: 'relative', height: linksHeight, marginTop: 23, ...sec(240) }}>
            {/* Big section label — appears behind cards */}
            <div style={{ position: 'absolute', top: 130, left: 4, zIndex: 0, ...SKB, fontSize: 40, letterSpacing: '-0.06em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
              LINKS
            </div>

            {links.slice(0, 3).map((link, i) => {
              const localLabelTop = i * 108;
              const localMediaTop = localLabelTop + 15;
              const thumb = link.custom_thumbnail_url || link.thumbnail_url;
              const domain = (() => { try { return new URL(link.url).hostname.replace('www.', ''); } catch { return link.url; } })();
              return (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none', position: 'relative', display: 'block', zIndex: 1 }}
                >
                  {/* Card title */}
                  <div style={{ position: 'absolute', top: localLabelTop, right: 8, ...SKB, fontSize: 10, letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.12 }}>
                    {link.title || domain}
                  </div>
                  {/* Card media */}
                  <div style={{ position: 'absolute', top: localMediaTop, left: 175, width: 185, height: 78, overflow: 'hidden', background: '#1a1a1a' }}>
                    {thumb && <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    {link.is_video && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: thumb ? 'rgba(0,0,0,0.35)' : 'transparent' }}>
                        <div style={{ width: 0, height: 0, borderLeft: '12px solid white', borderTop: '7px solid transparent', borderBottom: '7px solid transparent' }} />
                      </div>
                    )}
                  </div>
                </a>
              );
            })}

            <RULE />
          </div>
        )}

        {/* ── CONTACT ── hidden on own profile */}
        {showContact && (
          <div style={{ position: 'relative', height: 139, marginTop: 100, ...sec(320) }}>
            {/* Big section label */}
            <div style={{ position: 'absolute', top: 0, left: 4, ...SKB, fontSize: 40, letterSpacing: '-0.05em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
              CONTACT
            </div>
            {/* Email */}
            <div style={{ position: 'absolute', top: 6, right: 8, ...SKB, fontSize: 10, letterSpacing: '-0.02em', textAlign: 'right', lineHeight: 1.4 }}>
              <span style={{ color: '#FF0000' }}>EMAIL:</span>
              <span style={{ color: '#FFF' }}> {(profile.contact_email || '').toUpperCase()}</span>
            </div>
            {/* DM row */}
            <div style={{ position: 'absolute', top: 28, right: 8, ...SKB, fontSize: 10, letterSpacing: '-0.02em', color: '#FFF', textAlign: 'right', textTransform: 'uppercase', lineHeight: 1.12 }}>
              DIRECT MESSAGE ON SCOPE
            </div>
            <RULE />
          </div>
        )}

        {/* ── BACK ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 8px 0', ...sec(400) }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              ...SKB, fontSize: 10, letterSpacing: '-0.02em', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12,
            }}
          >
            BACK
          </button>
        </div>

      </div>
    </div>
  );
}
