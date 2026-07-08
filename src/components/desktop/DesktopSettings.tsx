'use client';
// ── DESKTOP SETTINGS — MASTER-DETAIL (Eric's mock) ────────────────────────────
// Two panes over a vertical hairline: LEFT = categories (red text + short red
// bar when active — the rail-marker language at settings scale), RIGHT = the
// active panel, swapped in place (120ms fade, no navigation). Deep-linkable
// via ?section= (read on mount, replaceState on switch). Desktop only —
// mobile settings untouched.
//
// CATEGORY MAPPING (mock ∪ shipped reorg — nothing dropped):
//   EDIT PROFILE  → the full form panel (display name / handle / bio /
//                   display-bio+counter / links incl. primary / location /
//                   change photo / save)
//   MEMBERSHIP    → manage (paid) / become (upsell)
//   EXPERIENCE    → change grid layout · While You Were Away toggle ·
//                   notifications · add to home screen
//   PRIVACY & SAFETY → privacy settings (pre-existing no-op) · blocked accounts
//   LEGAL         → terms / privacy / DMCA — open in a NEW TAB (keeps the
//                   settings context; reported choice)
//   SUPPORT       → help & support
//   LOG OUT       → pinned at the list's bottom, red.
// KIT field (mock's "Sony FX3 · …"): NOT built — flagged as a future product
// decision (gear lists on profiles), not a settings pass.

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import {
  getUserByPrivyId, getProfile, saveProfile, uploadImage, setShowRecap, isProMember,
  getProfileLinks, addProfileLink, deleteProfileLink, setPrimaryLink, type ProfileLink,
} from '@/lib/userService';
import { useUpsell } from '@/components/UpsellProvider';
import { feedImage } from '@/lib/mediaUrl';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(255,255,255,0.12)';
const RED = '#f20d0d';

const SECTIONS = ['edit-profile', 'membership', 'experience', 'privacy', 'legal', 'support'] as const;
type Section = typeof SECTIONS[number];
const SECTION_LABELS: Record<Section, string> = {
  'edit-profile': 'EDIT PROFILE', membership: 'MEMBERSHIP', experience: 'EXPERIENCE',
  privacy: 'PRIVACY & SAFETY', legal: 'LEGAL', support: 'SUPPORT',
};

const LABEL: React.CSSProperties = { ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.14em', display: 'block', margin: '0 0 7px' };
const INPUT: React.CSSProperties = { ...SKR, fontSize: 13, color: '#FFF', background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIR}`, outline: 'none', padding: '10px 12px', width: '100%', boxSizing: 'border-box' };

export default function DesktopSettings() {
  const router = useRouter();
  const { logout, user } = usePrivy();
  const { showUpsell } = useUpsell();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [section, setSection] = useState<Section>('edit-profile');
  const [fade, setFade] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const [sbUserId, setSbUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [shortBio, setShortBio] = useState('');
  const [location, setLocation] = useState('');
  const [pfp, setPfp] = useState<string | null>(null);
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [showRecap, setShowRecapState] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [photoState, setPhotoState] = useState<'idle' | 'uploading' | 'done'>('idle');

  // Deep-link: ?section= (read once; replaceState on switch — no navigation)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('section') as Section | null;
    if (q && (SECTIONS as readonly string[]).includes(q)) setSection(q);
  }, []);
  const switchTo = (s: Section) => {
    if (s === section) return;
    setFade(true);
    window.setTimeout(() => {
      setSection(s);
      setFade(false);
      window.history.replaceState(null, '', `?section=${s}`);
    }, 120);
  };

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        setSbUserId(sbUser.id);
        const profile = await getProfile(sbUser.id);
        if (profile) {
          setDisplayName(profile.display_name || '');
          setUsername(profile.username || '');
          setBio(profile.bio || '');
          setShortBio((profile as { short_bio?: string | null }).short_bio || '');
          setLocation((profile as { location?: string | null }).location || '');
          setPfp(profile.profile_image_url || null);
          setShowRecapState(profile.show_recap !== false);
          setIsPaid(isProMember(profile as { is_paid_member?: boolean; paid_member_until?: string | null }));
        }
        const ln = await getProfileLinks(user.id).catch(() => []);
        setLinks(ln);
      } catch (e) { console.error('[desktop-settings] load error:', e); }
    })();
  }, [user?.id]);

  const save = async () => {
    if (!sbUserId || saveState === 'saving') return;
    setSaveState('saving');
    try {
      await saveProfile(sbUserId, { displayName, username, bio, shortBio, location, profileImageUrl: pfp ?? undefined });
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 2500);
    } catch (e) {
      console.error('[desktop-settings] save error:', e);
      setSaveState('error');
    }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !sbUserId) return;
    e.target.value = '';
    setPhotoState('uploading');
    try {
      const url = await uploadImage(file, 'profile-images', user.id);
      await saveProfile(sbUserId, { displayName, username, bio, profileImageUrl: url });
      setPfp(url);
      setPhotoState('done');
      window.setTimeout(() => setPhotoState('idle'), 2500);
    } catch { setPhotoState('idle'); }
  };

  const addLink = async () => {
    const url = newLinkUrl.trim();
    if (!url || !user) return;
    setNewLinkUrl('');
    try {
      const created = await addProfileLink(user.id, { url: url.startsWith('http') ? url : `https://${url}`, position: links.length });
      setLinks((prev) => [...prev, created]);
    } catch (e) { console.error('[desktop-settings] add link failed:', e); }
  };

  const row = (label: string, action: () => void, key?: string) => (
    <button
      key={key ?? label}
      onClick={action}
      onMouseEnter={() => setHovered(key ?? label)}
      onMouseLeave={() => setHovered(null)}
      style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: hovered === (key ?? label) ? 'rgba(255,255,255,0.045)' : 'transparent', border: 'none', borderBottom: `1px solid ${HAIR}`, padding: '15px 10px', transition: 'background 120ms ease' }}
    >
      <span style={{ ...SKB, fontSize: 12.5, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </button>
  );

  const panel = () => {
    switch (section) {
      case 'edit-profile':
        return (
          <div style={{ maxWidth: 520 }}>
            {/* avatar + CHANGE PHOTO */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '0 0 26px' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: '#141414', flexShrink: 0 }}>
                {pfp && <img src={feedImage(pfp, 160)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <button onClick={() => photoInputRef.current?.click()} style={{ ...SKB, fontSize: 11, color: RED, textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                {photoState === 'uploading' ? 'UPLOADING…' : photoState === 'done' ? 'PHOTO UPDATED ✓' : 'CHANGE PHOTO'}
              </button>
            </div>

            <div style={{ marginBottom: 20 }}><label style={LABEL}>DISPLAY NAME</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={INPUT} /></div>
            <div style={{ marginBottom: 20 }}><label style={LABEL}>HANDLE</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} style={INPUT} /></div>
            <div style={{ marginBottom: 20 }}><label style={LABEL}>BIO</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} style={{ ...INPUT, resize: 'vertical' }} /></div>
            <div style={{ marginBottom: 20 }}>
              <label style={LABEL}>DISPLAY BIO · SHOWS ON YOUR DESKTOP PROFILE</label>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <input value={shortBio} onChange={(e) => setShortBio(e.target.value.slice(0, 80))} maxLength={80} style={INPUT} />
                <span style={{ ...SKR, fontSize: 10, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{shortBio.length}/80</span>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}><label style={LABEL}>LOCATION</label>
              <input value={location} onChange={(e) => setLocation(e.target.value.slice(0, 40))} placeholder="CITY, COUNTRY" style={INPUT} /></div>

            {/* LINKS — the link manager incl. the primary selector */}
            <div style={{ marginBottom: 26 }}>
              <label style={LABEL}>LINKS</label>
              {links.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${HAIR}` }}>
                  <span style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title || l.url}</span>
                  <button
                    onClick={async () => { if (user && await setPrimaryLink(user.id, l.id)) setLinks((prev) => prev.map((x) => ({ ...x, is_primary: x.id === l.id } as ProfileLink))); }}
                    style={{ ...SKB, fontSize: 9, color: (l as { is_primary?: boolean }).is_primary ? RED : 'rgba(255,255,255,0.4)', background: 'transparent', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}
                  >
                    {(l as { is_primary?: boolean }).is_primary ? 'PRIMARY' : 'SET PRIMARY'}
                  </button>
                  <button onClick={async () => { await deleteProfileLink(l.id); setLinks((prev) => prev.filter((x) => x.id !== l.id)); }} style={{ ...SKB, fontSize: 13, color: 'rgba(255,255,255,0.35)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }} placeholder="ADD A LINK (URL)" style={{ ...INPUT, flex: 1 }} />
                <button onClick={addLink} style={{ ...SKB, fontSize: 11, color: '#FFF', textTransform: 'uppercase', background: 'transparent', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: '0 14px' }}>ADD</button>
              </div>
            </div>

            {/* KIT — NOT BUILT (flagged): the mock's gear field is a product
                decision (gear lists on profiles), not a settings pass. */}

            <button onClick={save} style={{ display: 'block', width: '100%', background: saveState === 'error' ? RED : '#FFF', border: 'none', cursor: 'pointer', padding: '13px 0' }}>
              <span style={{ ...SKB, fontSize: 12, color: saveState === 'error' ? '#FFF' : '#000', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {saveState === 'saving' ? 'SAVING…' : saveState === 'saved' ? 'SAVED ✓' : saveState === 'error' ? 'SAVE FAILED — RETRY' : 'SAVE CHANGES'}
              </span>
            </button>
          </div>
        );
      case 'membership':
        return (
          <div style={{ maxWidth: 520 }}>
            {isPaid
              ? row('Manage Membership', () => router.push('/membership/manage'))
              : row('Become a Member', () => showUpsell('posts'))}
          </div>
        );
      case 'experience':
        return (
          <div style={{ maxWidth: 520 }}>
            {row('Change Grid Layout', () => router.push('/profile/grid-layout'))}
            {row(`While You Were Away · ${showRecap ? 'ON' : 'OFF'}`, () => { const next = !showRecap; setShowRecapState(next); if (sbUserId) void setShowRecap(sbUserId, next); }, 'wywa')}
            {row('Notifications', () => router.push('/profile/notifications'))}
            {row('Add to Home Screen', () => router.push('/profile/preferences'))}
          </div>
        );
      case 'privacy':
        return (
          <div style={{ maxWidth: 520 }}>
            {row('Privacy Settings', () => {})}
            {row('Blocked Accounts', () => router.push('/profile/hidden'))}
          </div>
        );
      case 'legal':
        return (
          <div style={{ maxWidth: 520 }}>
            {/* new tab — keeps the settings context (reported choice) */}
            {row('Terms of Service', () => window.open('/legal/terms', '_blank'))}
            {row('Privacy Policy', () => window.open('/legal/privacy', '_blank'))}
            {row('Copyright / DMCA', () => window.open('/legal/terms#dmca', '_blank'))}
          </div>
        );
      case 'support':
        return (
          <div style={{ maxWidth: 520 }}>
            {row('Help & Support', () => router.push('/profile/contact'))}
          </div>
        );
    }
  };

  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, left: 71, overflowY: 'auto' }}>
      <div style={{ display: 'flex', minHeight: '100%', maxWidth: 1100, margin: '0 auto' }}>
        {/* ═══ LEFT — the category list ═══ */}
        <div style={{ width: 250, flexShrink: 0, borderRight: `1px solid ${HAIR}`, padding: '44px 0 40px', display: 'flex', flexDirection: 'column' }}>
          <p style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.22em', margin: '0 0 18px', paddingLeft: 18 }}>SETTINGS</p>
          {SECTIONS.map((s) => {
            const active = section === s;
            return (
              <button
                key={s}
                onClick={() => switchTo(s)}
                onMouseEnter={() => setHovered(`cat-${s}`)}
                onMouseLeave={() => setHovered(null)}
                style={{ position: 'relative', display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '13px 18px', transition: 'color 120ms ease' }}
              >
                {active && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, background: RED }} />}
                <span style={{ ...SKB, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: active ? RED : hovered === `cat-${s}` ? '#FFF' : 'rgba(255,255,255,0.55)', transition: 'color 120ms ease' }}>
                  {SECTION_LABELS[s]}
                </span>
              </button>
            );
          })}
          {/* LOG OUT — pinned at the list's bottom */}
          <button
            onClick={async () => { await logout(); router.push('/welcome'); }}
            style={{ marginTop: 'auto', display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '13px 18px' }}
          >
            <span style={{ ...SKB, fontSize: 12.5, color: RED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>LOG OUT</span>
          </button>
        </div>

        {/* ═══ RIGHT — the active panel (120ms in-place swap) ═══ */}
        <div style={{ flex: 1, padding: '44px 36px 80px', opacity: fade ? 0 : 1, transition: 'opacity 120ms ease' }}>
          <h2 style={{ ...SKB, fontSize: 16, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 26px' }}>{SECTION_LABELS[section]}</h2>
          {panel()}
        </div>
      </div>
      <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
    </div>
  );
}
