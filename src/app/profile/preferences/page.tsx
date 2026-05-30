"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, saveProfile, uploadImage } from "@/lib/userService";
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
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);
  const [sbUserId, setSbUserId] = useState("");
  const [showA2HS, setShowA2HS] = useState(false);
  const [currentProfile, setCurrentProfile] = useState({ displayName: "", username: "", bio: "" });
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

  const photoLabel = photoUploading ? 'Uploading…' : photoSuccess ? 'Photo updated ✓' : photoError ?? 'Change Profile Photo';

  const menuItems: { label: string; action: () => void; danger?: boolean }[] = [
    { label: photoLabel, action: () => photoInputRef.current?.click() },
    { label: 'Edit Profile', action: () => router.push('/profile/edit') },
    { label: 'Change Grid Layout', action: () => router.push('/profile/grid-layout') },
    ...(mounted && !isStandalone() ? [{ label: 'ADD TO HOME SCREEN', action: () => setShowA2HS(true) }] : []),
    { label: 'Link Manager', action: () => router.push('/profile/edit') },
    { label: 'Saved', action: () => router.push('/profile/bookmarks') },
    { label: 'Notifications', action: () => router.push('/profile/notifications') },
    { label: 'Privacy', action: () => {} },
    { label: 'Blocked Accounts', action: () => router.push('/profile/hidden') },
    { label: 'Help & Support', action: () => router.push('/profile/contact') },
    { label: 'Log Out', action: handleLogout, danger: true },
  ];

  return (
    <>
    <div className="bg-black" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '14px 16px' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#FF0000', flexShrink: 0, marginRight: 10 }} />
        <button
          onClick={() => router.back()}
          style={{ ...MONO, fontSize: 11, color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          ← Back
        </button>
        <span style={{ ...MONO, fontSize: 11, color: 'white', position: 'absolute', left: '50%', transform: 'translateX(-50%)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          SETTINGS
        </span>
      </div>

      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />

      {/* Menu items */}
      {menuItems.map((item) => (
        <div key={item.label}>
          <button
            onClick={item.action}
            style={{
              display: 'block', width: '100%', background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '18px 20px', textAlign: 'left',
            }}
          >
            <span style={{ ...MONO, fontSize: 11, color: item.danger ? '#FF0000' : photoError && item.label === photoLabel ? '#FF0000' : 'white', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {item.label}
            </span>
          </button>
          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)', margin: '0 20px' }} />
        </div>
      ))}

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
