'use client';
// ── DESKTOP SETTINGS — the reorganized sections as a proper desktop page ─────
// (rail present, centered 640px column). Same data/logic as the mobile page —
// presentation only. Row actions open desktop-appropriately: EDIT PROFILE
// routes to the existing edit page (the cheaper-clean option vs a modal —
// reported); hover = subtle background lift.

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { getUserByPrivyId, getProfile, saveProfile, uploadImage, setShowRecap, isProMember } from '@/lib/userService';
import { useUpsell } from '@/components/UpsellProvider';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function DesktopSettings() {
  const router = useRouter();
  const { logout, user } = usePrivy();
  const { showUpsell } = useUpsell();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [sbUserId, setSbUserId] = useState('');
  const [current, setCurrent] = useState({ displayName: '', username: '', bio: '' });
  const [showRecap, setShowRecapState] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [photoLabel, setPhotoLabel] = useState('Change Profile Photo');
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        setSbUserId(sbUser.id);
        const profile = await getProfile(sbUser.id);
        if (profile) {
          setCurrent({ displayName: profile.display_name || '', username: profile.username || '', bio: profile.bio || '' });
          setShowRecapState(profile.show_recap !== false);
          setIsPaid(isProMember(profile as { is_paid_member?: boolean; paid_member_until?: string | null }));
        }
      } catch (e) { console.error('[desktop-settings] load error:', e); }
    })();
  }, [user?.id]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !sbUserId) return;
    e.target.value = '';
    setPhotoLabel('Uploading…');
    try {
      const url = await uploadImage(file, 'profile-images', user.id);
      await saveProfile(sbUserId, { ...current, profileImageUrl: url });
      setPhotoLabel('Photo updated ✓');
      setTimeout(() => setPhotoLabel('Change Profile Photo'), 3000);
    } catch {
      setPhotoLabel('Upload failed — try again');
    }
  };

  const toggleShowRecap = () => {
    const next = !showRecap;
    setShowRecapState(next);
    if (sbUserId) void setShowRecap(sbUserId, next);
  };

  type Row = { label: string; action: () => void };
  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'PROFILE',
      rows: [
        { label: 'Edit Profile', action: () => router.push('/profile/edit') },
        { label: photoLabel, action: () => photoInputRef.current?.click() },
        { label: 'Change Grid Layout', action: () => router.push('/profile/grid-layout') },
        { label: 'Link Manager', action: () => router.push('/profile/edit') },
      ],
    },
    {
      title: 'MEMBERSHIP',
      rows: [
        isPaid
          ? { label: 'Manage Membership', action: () => router.push('/membership/manage') }
          : { label: 'Become a Member', action: () => showUpsell('posts') },
      ],
    },
    {
      title: 'EXPERIENCE',
      rows: [
        { label: `While You Were Away · ${showRecap ? 'ON' : 'OFF'}`, action: toggleShowRecap },
        { label: 'Notifications', action: () => router.push('/profile/notifications') },
      ],
    },
    {
      title: 'PRIVACY & SAFETY',
      rows: [
        { label: 'Privacy Settings', action: () => {} },
        { label: 'Blocked Accounts', action: () => router.push('/profile/hidden') },
      ],
    },
    {
      title: 'LEGAL',
      rows: [
        { label: 'Terms of Service', action: () => router.push('/legal/terms') },
        { label: 'Privacy Policy', action: () => router.push('/legal/privacy') },
        { label: 'Copyright / DMCA', action: () => router.push('/legal/terms#dmca') },
      ],
    },
    {
      title: 'SUPPORT',
      rows: [
        { label: 'Help & Support', action: () => router.push('/profile/contact') },
      ],
    },
  ];

  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, left: 71, overflowY: 'auto' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '44px 24px 80px' }}>
        <h1 style={{ ...SKB, fontSize: 22, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>SETTINGS</h1>

        {sections.map((sec) => (
          <div key={sec.title}>
            <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '30px 0 4px' }}>
              {sec.title}
            </p>
            {sec.rows.map((row) => (
              <button
                key={row.label}
                onClick={row.action}
                onMouseEnter={() => setHovered(row.label)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: hovered === row.label ? 'rgba(255,255,255,0.045)' : 'transparent',
                  border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)',
                  padding: '15px 10px', transition: 'background 120ms ease',
                }}
              >
                <span style={{ ...SKB, fontSize: 12.5, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.label}</span>
              </button>
            ))}
          </div>
        ))}

        <button
          onClick={async () => { await logout(); router.push('/welcome'); }}
          onMouseEnter={() => setHovered('__logout')}
          onMouseLeave={() => setHovered(null)}
          style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: hovered === '__logout' ? 'rgba(242,13,13,0.06)' : 'transparent', border: 'none', padding: '34px 10px 10px', transition: 'background 120ms ease' }}
        >
          <span style={{ ...SKB, fontSize: 12.5, color: '#f20d0d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Log Out</span>
        </button>

        <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
