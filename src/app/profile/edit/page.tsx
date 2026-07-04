"use client";

import { useState, useEffect, useRef } from "react";
import { feedImage } from "@/lib/mediaUrl";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getUserByPrivyId, getProfile, saveProfile, updateProfileFields, uploadImage, isProMember,
  getProfileLinks, addProfileLink, deleteProfileLink,
  type ProfileLink,
} from "@/lib/userService";
import FrameLoader from "@/components/FrameLoader";
import { useEconomy } from "@/components/EconomyProvider";
import { economyPreviewEnabled } from "@/lib/economy/flag";
import { DIVIDER_ORDER, DIVIDER_LINES, dividerTier, isDividerUnlocked, TIER_UNLOCK_LABEL, type DividerLineKey } from "@/lib/economy/dividerLines";
import PfpCropModal from "@/components/PfpCropModal";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const INPUT: React.CSSProperties = {
  display: 'block', width: '100%', background: 'transparent',
  border: '1px solid rgba(255,255,255,0.2)', color: 'white',
  fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400,
  fontSize: 'max(16px, var(--fs-12))', /* iOS zoom floor */ padding: '10px 12px', outline: 'none',
  boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = {
  ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.12em',
  color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
  display: 'block', marginBottom: 6,
};

const BTN: React.CSSProperties = {
  width: '100%', padding: '12px 0',
  background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
  color: 'white', cursor: 'pointer',
  ...SKB, fontSize: 'var(--fs-10)', letterSpacing: '0.1em', textTransform: 'uppercase',
};

const DIVIDER = () => <div style={{ height: 1, background: '#FF0000', margin: '28px -20px 20px' }} />;
const SECTION = ({ label }: { label: string }) => (
  <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', margin: '0 0 16px' }}>{label}</p>
);

export default function EditProfilePage() {
  const router = useRouter();
  const { user } = usePrivy();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [sbUserId, setSbUserId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [floatingSaving, setFloatingSaving] = useState(false);

  // PROFILE BASICS
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  // KIT
  const [kitCamera, setKitCamera] = useState('');
  const [kitLens, setKitLens] = useState('');
  const [kitTool, setKitTool] = useState('');
  const [savingKit, setSavingKit] = useState(false);
  const [kitSaved, setKitSaved] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);

  // CONTACT
  const [contactEmail, setContactEmail] = useState('');
  const [contactPublic, setContactPublic] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // DIVIDING LINE (Piece 2) — tier from held badges; persists on select.
  const economy = useEconomy();
  const [firstCutCount, setFirstCutCount] = useState(0);
  const [lineFlags, setLineFlags] = useState({ isPaidMember: false, isFoundingMember: false, isTopCollector: false, isInHouseCreator: false });
  const [selectedLine, setSelectedLine] = useState<DividerLineKey>('default');
  const [holoBanner, setHoloBanner] = useState(false); // Piece 3 — Augmented only

  // LINKS
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        setSbUserId(sbUser.id);
        const [profile, fetchedLinks] = await Promise.all([
          getProfile(sbUser.id) as Promise<any>,
          getProfileLinks(user.id),
        ]);
        if (profile) {
          setDisplayName(profile.display_name || '');
          setUsername(profile.username || '');
          setBio(profile.bio || '');
          setProfileImageUrl(profile.profile_image_url || '');
          setKitCamera(profile.kit_camera || '');
          setKitLens(profile.kit_lens || '');
          setKitTool(profile.kit_favorite_tool || '');
          setContactEmail(profile.contact_email || '');
          setContactPublic(profile.contact_email_public || false);
          setLineFlags({
            isPaidMember: isProMember(profile),
            isFoundingMember: !!profile.is_founding_member,
            isTopCollector: !!profile.is_top_collector,
            isInHouseCreator: !!profile.is_in_house_creator,
          });
          setSelectedLine((profile.divider_line as DividerLineKey) || 'default');
          setHoloBanner(!!profile.holo_banner);
        }
        setLinks(fetchedLinks);
      } catch (e) {
        console.error('Edit profile load error:', e);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, [user?.id]);

  // First Cut count (gated economy boundary) completes the tier computation.
  useEffect(() => {
    if (!economyPreviewEnabled() || !sbUserId) { setFirstCutCount(0); return; }
    let cancelled = false;
    economy.getBadges(sbUserId).then((b) => { if (!cancelled) setFirstCutCount(b.firstCutCount ?? 0); }).catch(() => {});
    return () => { cancelled = true; };
  }, [economy, sbUserId]);

  const lineTier = dividerTier({ ...lineFlags, firstCutCount });

  const selectLine = (key: DividerLineKey) => {
    if (!isDividerUnlocked(key, lineTier)) return;
    setSelectedLine(key); // previewed in the swatch; applied to the profile on SAVE
    setIsDirty(true);     // hydrate the top-right SAVE button (any edit change does)
  };

  // Photo selected → open the square crop UI (bake happens on confirm).
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setCropFile(file);
  };

  // Crop confirmed → a small baked SQUARE blob. Optimistic preview + upload; SAVE persists.
  const handleCropConfirm = async (blob: Blob) => {
    setCropFile(null);
    if (!user || !sbUserId) return;
    // OPTIMISTIC: show the baked square INSTANTLY (feedImage passes blob: through unchanged).
    const localUrl = URL.createObjectURL(blob);
    setProfileImageUrl(localUrl);
    setIsDirty(true);   // the PFP is a change like any other → SAVE appears; persisted on SAVE
    setPhotoUploading(true);
    try {
      // The baked square is already small (512² JPEG) → fast upload; cacheControl set by uploadImage.
      const cropped = new File([blob], `avatar-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
      const url = await uploadImage(cropped, 'profile-images', user.id);
      setProfileImageUrl(url);          // swap blob → real URL (feedImage sizes it on display)
      URL.revokeObjectURL(localUrl);
      // No auto-save — SAVE (handleSaveProfile) persists it, consistent with the text fields.
    } catch (err) {
      console.error('Photo upload error:', err);
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSaveProfile = async (): Promise<boolean> => {
    if (!sbUserId || savingProfile) return false;
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      // Guard: never persist a still-uploading blob: URL (undefined → keeps the existing image).
      const savableImage = profileImageUrl && !profileImageUrl.startsWith('blob:') ? profileImageUrl : undefined;
      await saveProfile(sbUserId, { displayName, username, bio, profileImageUrl: savableImage });
      await updateProfileFields(sbUserId, { divider_line: selectedLine === 'default' ? null : selectedLine, holo_banner: holoBanner });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
      return true;
    } catch (e: any) {
      setProfileError(e?.message || 'SAVE FAILED');
      return false;
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveKit = async (): Promise<boolean> => {
    if (!sbUserId || savingKit) return false;
    setSavingKit(true);
    setKitError(null);
    setKitSaved(false);
    try {
      await updateProfileFields(sbUserId, {
        kit_camera: kitCamera.trim() || undefined,
        kit_lens: kitLens.trim() || undefined,
        kit_favorite_tool: kitTool.trim() || undefined,
      } as any);
      setKitSaved(true);
      setTimeout(() => setKitSaved(false), 2500);
      return true;
    } catch (e: any) {
      setKitError(e?.message || 'SAVE FAILED');
      return false;
    } finally {
      setSavingKit(false);
    }
  };

  const handleSaveContact = async (): Promise<boolean> => {
    if (!sbUserId || savingContact) return false;
    setSavingContact(true);
    setContactError(null);
    setContactSaved(false);
    try {
      await updateProfileFields(sbUserId, {
        contact_email: contactEmail.trim() || undefined,
        contact_email_public: contactPublic,
      } as any);
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 2500);
      return true;
    } catch (e: any) {
      setContactError(e?.message || 'SAVE FAILED');
      return false;
    } finally {
      setSavingContact(false);
    }
  };

  const handleSaveAll = async () => {
    setFloatingSaving(true);
    const [a, b, c] = await Promise.all([handleSaveProfile(), handleSaveKit(), handleSaveContact()]);
    setFloatingSaving(false);
    if (a && b && c) { setIsDirty(false); router.push('/profile'); }
  };

  const handleAddLink = async () => {
    if (!newLinkUrl.trim() || !user || addingLink) return;
    setAddingLink(true);
    setLinkError(null);
    try {
      const url = newLinkUrl.trim().startsWith('http') ? newLinkUrl.trim() : `https://${newLinkUrl.trim()}`;
      const added = await addProfileLink(user.id, {
        url,
        title: newLinkTitle.trim() || null,
        position: links.length,
      });
      setLinks(prev => [...prev, added]);
      setNewLinkUrl('');
      setNewLinkTitle('');
      setShowAddLink(false);
    } catch (e: any) {
      setLinkError(e?.message || 'ADD FAILED');
    } finally {
      setAddingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      await deleteProfileLink(linkId);
      setLinks(prev => prev.filter(l => l.id !== linkId));
    } catch (e) {
      console.error('Delete link error:', e);
    }
  };

  if (!loaded) return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <FrameLoader variant="page" />
    </div>
  );

  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>

      {isDirty && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, background: '#000', borderBottom: '1px solid rgba(255,255,255,0.15)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>UNSAVED CHANGES</span>
          <button
            onClick={handleSaveAll}
            disabled={floatingSaving}
            style={{ background: '#FF0000', border: 'none', cursor: floatingSaving ? 'default' : 'pointer', padding: '8px 18px' }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'white', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {floatingSaving ? 'SAVING…' : 'SAVE'}
            </span>
          </button>
        </div>
      )}

      <div style={{ maxWidth: '30rem', margin: '0 auto', padding: isDirty ? '44px 20px 60px' : '0 20px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 0 20px', position: 'relative' }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'white', letterSpacing: '0.1em', textTransform: 'uppercase' }}>← BACK</span>
          </button>
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'white', position: 'absolute', left: '50%', transform: 'translateX(-50%)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>EDIT PROFILE</span>
        </div>

        <div style={{ height: 1, background: '#FF0000', margin: '0 -20px 24px' }} />

        {/* PROFILE BASICS */}
        <SECTION label="PROFILE" />

        {/* PFP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, flexShrink: 0, overflow: 'hidden', background: '#222', cursor: 'pointer' }} onClick={() => photoInputRef.current?.click()}>
            {profileImageUrl
              ? <img src={feedImage(profileImageUrl, 160)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ ...SKB, fontSize: 'var(--fs-22)', color: 'white' }}>{(displayName || username || '?')[0].toUpperCase()}</span></div>
            }
          </div>
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={photoUploading}
            style={{ ...BTN, width: 'auto', padding: '8px 16px', opacity: photoUploading ? 0.5 : 1 }}
          >
            {photoUploading ? 'UPLOADING...' : 'CHANGE PHOTO'}
          </button>
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
        {cropFile && (
          <PfpCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={handleCropConfirm} />
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>DISPLAY NAME</label>
          <input style={INPUT} value={displayName} onChange={e => { setDisplayName(e.target.value); setIsDirty(true); }} placeholder="Your name" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>USERNAME</label>
          <input style={INPUT} value={username} onChange={e => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setIsDirty(true); }} placeholder="username" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={LABEL}>BIO</label>
          <textarea
            style={{ ...INPUT, resize: 'none', minHeight: 72, lineHeight: 1.5 } as React.CSSProperties}
            value={bio}
            onChange={e => { setBio(e.target.value); setIsDirty(true); }}
            placeholder="Tell your story"
          />
        </div>

        {profileError && <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#FF0000', margin: '0 0 10px', letterSpacing: '0.06em' }}>{profileError}</p>}
        <button
          onClick={handleSaveProfile}
          disabled={savingProfile}
          style={{ ...BTN, marginBottom: 4, border: profileSaved ? '1px solid #FF0000' : BTN.border }}
        >
          {savingProfile ? 'SAVING...' : profileSaved ? 'SAVED ✓' : 'SAVE PROFILE'}
        </button>

        <DIVIDER />

        {/* DIVIDING LINE — Piece 2. The line between your badges and photo; tier
            unlocks the gradients. THICK swatches (real preview); locked lines
            shown dimmed with the tier needed. Persists on select. Shows for
            EVERYONE — free users see the default + locked/dimmed options. */}
        <SECTION label="DIVIDING LINE" />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          {DIVIDER_ORDER.map((key) => {
            const line = DIVIDER_LINES[key];
            const unlocked = isDividerUnlocked(key, lineTier);
            const selected = selectedLine === key;
            return (
              <button
                key={key}
                onClick={() => selectLine(key)}
                disabled={!unlocked}
                style={{ background: 'transparent', border: 'none', padding: 0, cursor: unlocked ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: unlocked ? 1 : 0.32 }}
              >
                {/* THICK swatch — gradient preview (the real divider is 0.5px). */}
                <div style={{ width: 20, height: 60, background: line.gradient, border: selected ? '1.5px solid #FF0000' : '1px solid rgba(255,255,255,0.18)', boxSizing: 'border-box' }} />
                <span style={{ ...SKB, fontSize: 'var(--fs-7_5)', letterSpacing: '0.05em', color: selected ? '#FF0000' : 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{line.name}</span>
                {!unlocked && line.tier > 0 && (
                  <span style={{ ...SKR, fontSize: 'var(--fs-6)', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{TIER_UNLOCK_LABEL[line.tier as 1 | 2 | 3]}</span>
                )}
              </button>
            );
          })}
        </div>
        <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, margin: '0 0 4px' }}>
          The line between your badges and your photo. Default is invisible — climb tiers to unlock colours.
        </p>

        {/* HOLO BANNER — Piece 3. Augmented (Founding 500) ONLY: an iridescent
            fill for the badge backdrop. Default OFF. Persists on SAVE. */}
        {lineFlags.isFoundingMember && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
            <div style={{ width: 20, height: 60, position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.18)', boxSizing: 'border-box', background: '#000', flexShrink: 0 }}>
              {holoBanner && (
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #FF0DBF 0%, #991F77 22%, #7F2366 38%, #FF9AD0 55%, #B14FD6 72%, #FF0DBF 100%)', backgroundSize: '100% 300%', opacity: 0.6, animation: 'holoDrift 14s ease-in-out infinite' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ ...LABEL, marginBottom: 4 }}>HOLO BANNER</p>
              <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.35)', lineHeight: 1.4, margin: 0 }}>Augmented only — an iridescent backdrop for the founding 500.</p>
            </div>
            <button
              onClick={() => { setHoloBanner(v => !v); setIsDirty(true); }}
              style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 14px', cursor: 'pointer', flexShrink: 0, background: holoBanner ? '#FF0000' : 'transparent', color: holoBanner ? '#fff' : 'rgba(255,255,255,0.6)', border: holoBanner ? 'none' : '1px solid rgba(255,255,255,0.3)' }}
            >
              {holoBanner ? 'ON' : 'OFF'}
            </button>
          </div>
        )}

        <DIVIDER />

        {/* KIT */}
        <SECTION label="KIT" />
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>CAMERA</label>
          <input style={INPUT} value={kitCamera} onChange={e => { setKitCamera(e.target.value); setIsDirty(true); }} placeholder="e.g. Sony A7R IV" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>LENS</label>
          <input style={INPUT} value={kitLens} onChange={e => { setKitLens(e.target.value); setIsDirty(true); }} placeholder="e.g. Sigma 35mm f/1.4" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={LABEL}>FAVORITE TOOL</label>
          <input style={INPUT} value={kitTool} onChange={e => { setKitTool(e.target.value); setIsDirty(true); }} placeholder="e.g. Lightroom, DaVinci" />
        </div>

        {kitError && <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#FF0000', margin: '0 0 10px', letterSpacing: '0.06em' }}>{kitError}</p>}
        <button
          onClick={handleSaveKit}
          disabled={savingKit}
          style={{ ...BTN, marginBottom: 4, border: kitSaved ? '1px solid #FF0000' : BTN.border }}
        >
          {savingKit ? 'SAVING...' : kitSaved ? 'SAVED ✓' : 'SAVE KIT'}
        </button>

        <DIVIDER />

        {/* LINKS */}
        <SECTION label="LINKS" />

        {links.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {links.map(link => {
              const domain = (() => { try { return new URL(link.url).hostname.replace('www.', ''); } catch { return link.url; } })();
              return (
                <div key={link.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'white', margin: '0 0 2px', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {link.title || domain}
                    </p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.4)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {domain}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteLink(link.id)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 0 14px', ...SKB, fontSize: 'var(--fs-16)', color: 'rgba(255,255,255,0.35)', lineHeight: 1, flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {showAddLink ? (
          <div style={{ marginBottom: 16 }}>
            <input
              autoFocus
              style={{ ...INPUT, marginBottom: 8 }}
              value={newLinkUrl}
              onChange={e => setNewLinkUrl(e.target.value)}
              placeholder="https://..."
              type="url"
            />
            <input
              style={{ ...INPUT, marginBottom: 10 }}
              value={newLinkTitle}
              onChange={e => setNewLinkTitle(e.target.value)}
              placeholder="Title (optional)"
            />
            {linkError && <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#FF0000', margin: '0 0 8px', letterSpacing: '0.06em' }}>{linkError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAddLink} disabled={!newLinkUrl.trim() || addingLink} style={{ ...BTN, flex: 1, opacity: newLinkUrl.trim() ? 1 : 0.4 }}>
                {addingLink ? 'ADDING...' : 'ADD'}
              </button>
              <button onClick={() => { setShowAddLink(false); setNewLinkUrl(''); setNewLinkTitle(''); setLinkError(null); }} style={{ ...BTN, flex: 1, border: '1px solid rgba(255,255,255,0.15)' }}>
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddLink(true)} style={{ ...BTN, marginBottom: 10 }}>
            + ADD LINK
          </button>
        )}

        <a href="/profile/links" style={{ display: 'block', marginTop: 8, marginBottom: 4 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em' }}>Advanced link settings ↗</span>
        </a>

        <DIVIDER />

        {/* CONTACT */}
        <SECTION label="CONTACT" />
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>EMAIL</label>
          <input style={INPUT} value={contactEmail} onChange={e => { setContactEmail(e.target.value); setIsDirty(true); }} placeholder="your@email.com" type="email" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <button
            onClick={() => { setContactPublic(v => !v); setIsDirty(true); }}
            style={{ width: 32, height: 18, background: contactPublic ? '#FF0000' : 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
          >
            <div style={{ position: 'absolute', top: 3, left: contactPublic ? 16 : 3, width: 12, height: 12, background: 'white', transition: 'left 0.2s' }} />
          </button>
          <span style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.6)' }}>Show publicly on profile</span>
        </div>

        {contactError && <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#FF0000', margin: '0 0 10px', letterSpacing: '0.06em' }}>{contactError}</p>}
        <button
          onClick={handleSaveContact}
          disabled={savingContact}
          style={{ ...BTN, marginBottom: 4, border: contactSaved ? '1px solid #FF0000' : BTN.border }}
        >
          {savingContact ? 'SAVING...' : contactSaved ? 'SAVED ✓' : 'SAVE CONTACT'}
        </button>

      </div>
    </div>
  );
}
