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
      <div style={{ maxWidth: 375, margin: '0 auto', position: 'relative', height: '100%' }}>
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
            <span style={{ ...SKB, fontSize: 9, letterSpacing: '-0.18px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.4 }}>{label}</span>
            <span style={{ ...SKB, fontSize: 9, letterSpacing: '-0.18px', color: '#FF0000', lineHeight: 1.4 }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: `rgba(0,0,0,${bgVisible ? 0.95 : 0})`,
        transition: 'background 200ms ease',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 375, margin: '0 auto', paddingBottom: 60 }}>

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
              <div style={{ flex: 1, paddingRight: 8, ...SKR, fontSize: 10, letterSpacing: '-0.2px', color: '#FFF', lineHeight: 1.12, whiteSpace: 'pre-wrap' }}>
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
                    <span style={{ ...SKB, fontSize: 10, letterSpacing: '-0.2px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
                      {row.label}
                    </span>
                    <span style={{ ...SKR, fontSize: 10, letterSpacing: '-0.2px', color: '#FFF', textTransform: 'uppercase', lineHeight: 1.12 }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
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
                      <div style={{ ...SKB, fontSize: 10, letterSpacing: '-0.2px', color: '#FFF', textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.12, marginBottom: 4, width: 185 }}>
                        {link.title || domain}
                      </div>
                      <div style={{ position: 'relative', width: 185, height: 78, overflow: 'hidden', background: '#111' }}>
                        {thumb
                          ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ ...SKB, fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{domain}</span>
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
                  <div style={{ ...SKB, fontSize: 10, letterSpacing: '-0.2px', lineHeight: 1.12, marginBottom: 11 }}>
                    <span style={{ color: '#FF0000' }}>EMAIL:</span>
                    <span style={{ color: '#FFF' }}> {profile.contact_email.toUpperCase()}</span>
                  </div>
                )}
                <div
                  onClick={e => e.stopPropagation()}
                  style={{ ...SKB, fontSize: 10, letterSpacing: '-0.2px', color: '#FFF', textTransform: 'uppercase' as const, lineHeight: 1.12, cursor: 'pointer' }}
                >
                  DIRECT MESSAGE ON SCOPE
                </div>
              </div>
            </div>
            <Divider />
          </>
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
    </>
  );
}
