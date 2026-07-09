'use client';
// ── DESKTOP PROFILE SETUP — the card, before the grid picker ─────────────────
// Collects mobile setup's exact fields (HANDLE · DISPLAY NAME · BIO · PFP) in
// the onboarding card language (red brackets) with settings' edit-profile field
// styling. PFP uses the desktop crop stage; direct-upload is the bake path.
// On complete → saveProfile → hands to the caller (the grid picker follows).

import { useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  getUserByPrivyId, getProfileByUsername, saveProfile, uploadImage, syncUserWithSupabase,
} from '@/lib/userService';
import { feedImage } from '@/lib/mediaUrl';
import PfpCropStage from '@/components/desktop/PfpCropStage';
import RedBrackets from '@/components/desktop/RedBrackets';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const HAIR = 'rgba(255,255,255,0.12)';
const RED = '#f20d0d';
const LABEL: React.CSSProperties = { ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.14em', display: 'block', margin: '0 0 7px' };
const INPUT: React.CSSProperties = { ...SKB, fontSize: 13, color: '#FFF', background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIR}`, outline: 'none', padding: '10px 12px', width: '100%', boxSizing: 'border-box', letterSpacing: '0.02em' };

export default function DesktopProfileSetup({ onComplete }: { onComplete: (userId: string) => void }) {
  const { user } = usePrivy();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [pfp, setPfp] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyCrop = async (blob: Blob) => {
    if (!user) return;
    setCropFile(null); setUploading(true);
    try {
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
      const file = new File([blob], `pfp.${ext}`, { type: blob.type });
      const url = await uploadImage(file, 'profile-images', user.id);
      setPfp(url);
    } catch { setError('Photo upload failed — try again.'); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!user || saving) return;
    if (!username.trim()) { setError('Pick a username.'); return; }
    setSaving(true); setError(null);
    try {
      await syncUserWithSupabase(user);
      const sbUser = await getUserByPrivyId(user.id);
      if (!sbUser) throw new Error('account not ready');
      const existing = await getProfileByUsername(username.trim());
      if (existing && existing.user_id !== sbUser.id) { setError('That username is already taken.'); setSaving(false); return; }
      await saveProfile(sbUser.id, { displayName, username, bio, profileImageUrl: pfp ?? undefined });
      onComplete(sbUser.id);
    } catch (e) {
      console.error('[desktop-setup] save error:', e);
      setError('Couldn’t save your profile. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: 820, minHeight: 520, background: '#000', border: '1px solid #1a1a1a', boxSizing: 'border-box', padding: '54px 60px' }}>
        <RedBrackets inset={0} />
        <h1 style={{ ...SKB, fontSize: 34, color: '#FFF', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>SET UP YOUR PROFILE</h1>
        <p style={{ ...SKB, fontWeight: 400, fontSize: 13, color: '#9e9e9e', margin: '0 0 30px' }}>This is how the world sees you on Scope.</p>

        <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start' }}>
          {/* PFP */}
          <div style={{ flexShrink: 0 }}>
            <button onClick={() => fileRef.current?.click()} style={{ width: 120, height: 120, borderRadius: '50%', overflow: 'hidden', background: '#141414', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: 0, position: 'relative' }}>
              {pfp ? <img src={feedImage(pfp, 240)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{uploading ? '…' : 'ADD PHOTO'}</span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCropFile(f); }} style={{ display: 'none' }} />
          </div>

          {/* fields */}
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 18 }}><label style={LABEL}>USERNAME</label>
              <input value={username} onChange={(e) => setUsername(e.target.value.toUpperCase())} placeholder="@HANDLE" style={INPUT} /></div>
            <div style={{ marginBottom: 18 }}><label style={LABEL}>DISPLAY NAME</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value.toUpperCase())} placeholder="YOUR NAME" style={INPUT} /></div>
            <div><label style={LABEL}>BIO</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))} maxLength={160} rows={3} placeholder="160 CHARACTER MAX" style={{ ...INPUT, resize: 'vertical', fontWeight: 400 }} /></div>
          </div>
        </div>

        {error && <p style={{ ...SKB, fontWeight: 400, fontSize: 12, color: RED, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '22px 0 0' }}>{error}</p>}

        <button onClick={submit} disabled={saving} style={{ position: 'absolute', right: 60, bottom: 44, ...SKB, fontSize: 12, color: '#000', textTransform: 'uppercase', letterSpacing: '0.1em', background: '#FFF', border: 'none', cursor: 'pointer', width: 160, height: 48, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'SAVING…' : 'CONTINUE'}
        </button>
      </div>
      {cropFile && <PfpCropStage file={cropFile} onApply={applyCrop} onCancel={() => setCropFile(null)} />}
    </div>
  );
}
