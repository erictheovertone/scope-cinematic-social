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
import { updateProfileFields } from '@/lib/userService';
import { DIVIDER_LINES, DIVIDER_ORDER, TIER_UNLOCK_LABEL, dividerTier, isDividerUnlocked, type DividerLineKey } from '@/lib/economy/dividerLines';
import { useEconomy } from '@/components/EconomyProvider';
import { feedImage } from '@/lib/mediaUrl';
import PfpCropStage from '@/components/desktop/PfpCropStage';
import DesktopGridPicker from '@/components/desktop/DesktopGridPicker';
import { deriveDesktopLayout, type DesktopLayout } from '@/lib/desktopLayout';

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
  const { goPro } = useUpsell();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [gridPickerOpen, setGridPickerOpen] = useState(false);
  const [gridInitial, setGridInitial] = useState<DesktopLayout>({ aspect: 'scope', count: 4 });
  // parity round 2: the mobile-only fields join the desktop form
  const economy = useEconomy();
  const [kitCamera, setKitCamera] = useState('');
  const [kitLens, setKitLens] = useState('');
  const [kitTool, setKitTool] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPublic, setContactPublic] = useState(false);
  const [dividerLine, setDividerLine] = useState<DividerLineKey>('default');
  const [holoBanner, setHoloBanner] = useState(false);
  const [tierFlags, setTierFlags] = useState({ isPaidMember: false, isFoundingMember: false, isTopCollector: false, isInHouseCreator: false, isScreeningRoomHolder: false, firstCutCount: 0 });

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
          setGridInitial(deriveDesktopLayout((profile as { desktop_layout?: unknown }).desktop_layout, profile.grid_layout));
          const px = profile as unknown as Record<string, unknown>;
          setKitCamera((px.kit_camera as string) || '');
          setKitLens((px.kit_lens as string) || '');
          setKitTool((px.kit_favorite_tool as string) || '');
          setContactEmail((px.contact_email as string) || '');
          setContactPublic(!!px.contact_email_public);
          setDividerLine((px.divider_line as DividerLineKey) || 'default');
          setHoloBanner(!!px.holo_banner);
          const badges = await economy.getBadges(sbUser.id).catch(() => ({} as { firstCutCount?: number }));
          setTierFlags({
            isPaidMember: isProMember(profile as { is_paid_member?: boolean; paid_member_until?: string | null }),
            isFoundingMember: !!px.is_founding_member,
            isTopCollector: !!px.is_top_collector,
            isInHouseCreator: !!px.is_in_house_creator,
            isScreeningRoomHolder: !!px.is_screening_room_holder,
            firstCutCount: badges.firstCutCount ?? 0,
          });
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
      // the same field-update mutation mobile uses (one path, both surfaces)
      await updateProfileFields(sbUserId, {
        kit_camera: kitCamera.trim() || undefined,
        kit_lens: kitLens.trim() || undefined,
        kit_favorite_tool: kitTool.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
        contact_email_public: contactPublic,
        divider_line: dividerLine === 'default' ? null : dividerLine,
        holo_banner: holoBanner,
      });
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 2500);
    } catch (e) {
      console.error('[desktop-settings] save error:', e);
      setSaveState('error');
    }
  };

  // CHANGE PHOTO → the CROP STAGE (drag/zoom) → bake → the existing avatar
  // path (unique filenames = fresh URL every upload; profileCache invalidated
  // by saveProfile → header/comments/rail reflect immediately).
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setCropFile(file);
  };
  const applyCrop = async (blob: Blob) => {
    if (!user || !sbUserId) return;
    setCropFile(null);
    setPhotoState('uploading');
    try {
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
      const file = new File([blob], `pfp-${sbUserId.slice(0, 8)}.${ext}`, { type: blob.type });
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

            {/* DIVIDING LINE — Piece 2 (tier-gated swatches, same rules as mobile) */}
            <div style={{ marginBottom: 22 }}>
              <label style={LABEL}>DIVIDING LINE</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DIVIDER_ORDER.map((k) => {
                  const line = DIVIDER_LINES[k];
                  const tier = dividerTier(tierFlags);
                  const unlocked = isDividerUnlocked(k, tier);
                  const active = dividerLine === k;
                  return (
                    <button
                      key={k}
                      onClick={() => unlocked && setDividerLine(k)}
                      disabled={!unlocked}
                      title={unlocked ? line.name : TIER_UNLOCK_LABEL[line.tier as 1 | 2 | 3]}
                      style={{ width: 56, background: 'transparent', border: 'none', cursor: unlocked ? 'pointer' : 'default', padding: 0, opacity: unlocked ? 1 : 0.3 }}
                    >
                      <span style={{ display: 'block', width: 8, height: 44, margin: '0 auto', background: line.gradient, border: active ? '1px solid #FFF' : '1px solid rgba(255,255,255,0.15)' }} />
                      <span style={{ ...SKB, fontSize: 8, color: active ? '#FFF' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginTop: 5 }}>{line.name}</span>
                    </button>
                  );
                })}
              </div>
              {tierFlags.isFoundingMember && (
                <button onClick={() => setHoloBanner((h) => !h)} style={{ ...SKB, fontSize: 10, color: holoBanner ? '#FFF' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: '6px 12px', marginTop: 10 }}>
                  HOLO BANNER · {holoBanner ? 'ON' : 'OFF'}
                </button>
              )}
            </div>

            {/* KIT — camera / lens / favorite tool (profiles.kit_*) */}
            <div style={{ marginBottom: 22 }}>
              <label style={LABEL}>KIT</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={kitCamera} onChange={(e) => setKitCamera(e.target.value)} placeholder="CAMERA" style={INPUT} />
                <input value={kitLens} onChange={(e) => setKitLens(e.target.value)} placeholder="LENS" style={INPUT} />
                <input value={kitTool} onChange={(e) => setKitTool(e.target.value)} placeholder="FAVORITE TOOL" style={INPUT} />
              </div>
            </div>

            {/* CONTACT — email + public toggle (profiles.contact_email*) */}
            <div style={{ marginBottom: 22 }}>
              <label style={LABEL}>CONTACT</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="EMAIL" style={{ ...INPUT, flex: 1 }} />
                <button onClick={() => setContactPublic((p) => !p)} style={{ ...SKB, fontSize: 10, color: contactPublic ? '#FFF' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'transparent', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: '0 12px', flexShrink: 0 }}>
                  {contactPublic ? 'PUBLIC' : 'PRIVATE'}
                </button>
              </div>
            </div>

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
              : row('Become a Member', () => goPro())}
          </div>
        );
      case 'experience':
        return (
          <div style={{ maxWidth: 520 }}>
            {/* the 3-step desktop picker (replaces the mobile route on desktop) */}
            {row('Grid Layout', () => setGridPickerOpen(true))}
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
            {row('Terms of Service', () => window.open('/terms', '_blank'))}
            {row('Privacy Policy', () => window.open('/privacy', '_blank'))}
            {row('Copyright / DMCA', () => window.open('/terms#dmca', '_blank'))}
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
    // THE SCROLL TRAP (fixed): the root scrolled the WHOLE two-pane (or clipped
    // it) — the RIGHT panel now owns its own overflow-y scroller at full
    // height; the LEFT list stays fixed. Momentum scrolling included.
    <div
      className="bg-black"
      style={{ position: 'fixed', inset: 0, left: 71, overflow: 'hidden' }}
      // WHEEL FORWARDING (round-2 evidence): the pane scrolls correctly when
      // content overflows, but the root is overflow:hidden — wheeling over the
      // LEFT list or the margins was a dead zone. Forward every wheel to the
      // right panel so scroll works from anywhere on the page.
      onWheel={(e) => {
        const panel = panelRef.current;
        if (!panel) return;
        if ((e.target as Element).closest('[data-own-scroll]')) return;
        if (!panel.contains(e.target as Node)) panel.scrollTop += e.deltaY;
      }}
    >
      <div style={{ display: 'flex', height: '100%', maxWidth: 1100, margin: '0 auto' }}>
        {/* ═══ LEFT — the category list ═══ */}
        <div style={{ width: 250, flexShrink: 0, borderRight: `1px solid ${HAIR}`, padding: '44px 0 40px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
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
        <div ref={panelRef} style={{ flex: 1, padding: '44px 36px 80px', opacity: fade ? 0 : 1, transition: 'opacity 120ms ease', height: '100%', boxSizing: 'border-box', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <h2 style={{ ...SKB, fontSize: 16, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 26px' }}>{SECTION_LABELS[section]}</h2>
          {panel()}
        </div>
      </div>
      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} style={{ display: 'none' }} />
      {cropFile && <PfpCropStage file={cropFile} onApply={applyCrop} onCancel={() => setCropFile(null)} />}
      {gridPickerOpen && sbUserId && (
        <DesktopGridPicker
          initial={gridInitial}
          userId={sbUserId}
          onApplied={(l) => setGridInitial(l)}
          onClose={() => setGridPickerOpen(false)}
        />
      )}
    </div>
  );
}
