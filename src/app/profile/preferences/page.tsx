"use client";

import { useState, useEffect, useRef } from "react";
import DesktopSettings from '@/components/desktop/DesktopSettings';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, saveProfile, uploadImage, setShowRecap, isProMember } from "@/lib/userService";
import { useUpsell } from "@/components/UpsellProvider";
import AddToHomeScreenSheet from "@/components/AddToHomeScreenSheet";
import { isStandalone } from "@/lib/pwaUtils";

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const MAX = 1920, QUALITY = 0.82;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width >= height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '-compressed.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', QUALITY);
      } catch { resolve(file); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

const MONO: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

export default function Preferences() {
  const router = useRouter();
  const { logout } = usePrivy();
  const { user } = usePrivy();
  const { showUpsell } = useUpsell();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isDesktop = useIsDesktop();
  const [mounted, setMounted] = useState(false);
  const [sbUserId, setSbUserId] = useState("");
  const [showA2HS, setShowA2HS] = useState(false);
  const [currentProfile, setCurrentProfile] = useState({ displayName: "", username: "", bio: "" });
  const [showRecap, setShowRecapState] = useState(true); // "While you were away" on return (default ON)
  // Membership state rides the SAME profile fetch below — zero extra requests
  // (the cheapest state logic: the page already loads the profile).
  const [isPaid, setIsPaid] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoSuccess, setPhotoSuccess] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        setSbUserId(sbUser.id);
        const profile = await getProfile(sbUser.id);
        if (profile) {
          setCurrentProfile({
            displayName: profile.display_name || "",
            username: profile.username || "",
            bio: profile.bio || "",
          });
          setShowRecapState(profile.show_recap !== false); // default ON
          setIsPaid(isProMember(profile as { is_paid_member?: boolean; paid_member_until?: string | null }));
        }
      } catch (e) {
        console.error("Preferences load error:", e);
      }
    };
    load();
  }, [user?.id]);

  const handleLogout = async () => {
    await logout();
    router.push('/welcome');
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !sbUserId) return;
    e.target.value = '';
    setPhotoUploading(true);
    setPhotoSuccess(false);
    setPhotoError(null);
    try {
      const compressed = await compressImage(file);
      const url = await uploadImage(compressed, 'profile-images', user.id);
      await saveProfile(sbUserId, {
        displayName: currentProfile.displayName,
        username: currentProfile.username,
        bio: currentProfile.bio,
        profileImageUrl: url,
      });
      setPhotoSuccess(true);
      setTimeout(() => setPhotoSuccess(false), 3000);
    } catch (err) {
      console.error("Photo update error:", err);
      setPhotoError("Upload failed. Please try again.");
    } finally {
      setPhotoUploading(false);
    }
  };

  if (!mounted) return <div className="bg-black" style={{ position: 'fixed', inset: 0 }} />;

  // ── DESKTOP SEAM: ≥1024 renders the desktop settings page (same data/logic,
  // desktop presentation — its own component, zero mobile CSS threading). ──
  if (isDesktop) return <DesktopSettings />;

  const photoLabel = photoUploading ? 'Uploading…' : photoSuccess ? 'Photo updated ✓' : photoError ?? 'Change Profile Photo';

  const toggleShowRecap = () => {
    const next = !showRecap;
    setShowRecapState(next);            // optimistic
    if (sbUserId) void setShowRecap(sbUserId, next);
  };

  // ── Grouped IA (the reorg): every prior item survives; MEMBERSHIP + LEGAL
  // are the two additions. Row styling unchanged — sections are the only new
  // visual element. (PRIVACY SETTINGS is still the pre-existing no-op row —
  // renamed only, flagged for a future destination.)
  type Row = { label: string; action: () => void; danger?: boolean };
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
          : { label: 'Become a Member', action: () => showUpsell('posts') }, // generic pitch context (UpsellLimit has no neutral key)
      ],
    },
    {
      title: 'EXPERIENCE',
      rows: [
        { label: `While You Were Away · ${showRecap ? 'ON' : 'OFF'}`, action: toggleShowRecap },
        { label: 'Notifications', action: () => router.push('/profile/notifications') },
        ...(mounted && !isStandalone() ? [{ label: 'Add to Home Screen', action: () => setShowA2HS(true) }] : []),
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
    <>
    <div className="bg-black" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>

      {/* Header — top padding rides the safe-area inset so the back button clears the
          status bar on notched devices (iPhone 12 etc.), not a hardcoded 14px. */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '14px 16px', paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))' }}>
        <button
          onClick={() => router.back()}
          style={{ ...MONO, fontSize: 'var(--fs-11)', color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          ← Back
        </button>
        <span style={{ ...MONO, fontSize: 'var(--fs-15)', color: 'white', position: 'absolute', left: '50%', transform: 'translateX(-50%)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          SETTINGS
        </span>
      </div>

      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />

      {/* Grouped sections — small tracked muted labels, hairline-separated rows */}
      {sections.map((sec) => (
        <div key={sec.title}>
          <p style={{ ...MONO, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '26px 20px 6px' }}>
            {sec.title}
          </p>
          {sec.rows.map((item) => (
            <div key={item.label}>
              <button
                onClick={item.action}
                style={{
                  display: 'block', width: '100%', background: 'transparent',
                  border: 'none', cursor: 'pointer', padding: '18px 20px', textAlign: 'left',
                }}
              >
                <span style={{ ...MONO, fontSize: 'var(--fs-11)', color: photoError && item.label === photoLabel ? '#FF0000' : 'white', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {item.label}
                </span>
              </button>
              <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)', margin: '0 20px' }} />
            </div>
          ))}
        </div>
      ))}

      {/* LOG OUT — bottom, red, its own space below the last section */}
      <button
        onClick={handleLogout}
        style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '34px 20px 46px', textAlign: 'left' }}
      >
        <span style={{ ...MONO, fontSize: 'var(--fs-11)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Log Out</span>
      </button>

      <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
    </div>
    <AddToHomeScreenSheet
      isOpen={showA2HS}
      onClose={() => setShowA2HS(false)}
      privyId={user?.id ?? ''}
      forceShow
    />
    </>
  );
}
