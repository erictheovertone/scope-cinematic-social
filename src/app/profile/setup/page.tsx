"use client";

import { useState, useRef, useEffect } from "react";
import { feedImage } from "@/lib/mediaUrl";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { saveProfile, uploadImage, getUserByPrivyId, getProfileByUsername, syncUserWithSupabase } from "@/lib/userService";
import FrameLoader from "@/components/FrameLoader";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

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

export default function ProfileSetup() {
  const router = useRouter();
  const { user } = usePrivy();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const syncUser = async () => {
      if (user) {
        try {
          await syncUserWithSupabase(user);
        } catch (err) {
          console.error('Failed to sync user with Supabase:', err);
        }
      }
    };
    syncUser();
  }, [user]);

  const handleContinue = async () => {
    setIsLoading(true);
    setError(null);
    setUsernameError(null);

    try {
      if (!user) {
        setError('You must be logged in to set up your profile.');
        return;
      }

      // Look up the user row; if missing, attempt a sync (handles RLS race on mount)
      let supabaseUser = await getUserByPrivyId(user.id);
      console.log('[ProfileSetup] getUserByPrivyId:', supabaseUser?.id ?? 'null', '(privy_id:', user.id, ')');

      if (!supabaseUser) {
        console.log('[ProfileSetup] user row missing — attempting sync...');
        const synced = await syncUserWithSupabase(user);
        console.log('[ProfileSetup] syncUserWithSupabase result:', synced?.id ?? 'null');
        supabaseUser = synced;
      }

      if (!supabaseUser) {
        console.error('[ProfileSetup] FAILED TO CREATE USER — privy_id:', user.id,
          '— likely an RLS policy issue on the users table (needs public INSERT policy)');
        setError('Failed to create your account. Please try again or contact support.');
        return;
      }

      // Check username availability
      if (username) {
        const existing = await getProfileByUsername(username);
        if (existing && existing.user_id !== supabaseUser.id) {
          setUsernameError('That username is already taken');
          return;
        }
      }

      // Save profile — image URL is already uploaded (or null if none selected)
      console.log('[ProfileSetup] saving profile for user_id:', supabaseUser.id);
      await saveProfile(supabaseUser.id, {
        displayName,
        username,
        bio,
        profileImageUrl: uploadedImageUrl ?? undefined,
      });

      router.push('/profile/grid-layout?from=setup');
    } catch (err) {
      const e = err && typeof err === 'object' ? err as Record<string, unknown> : {};
      const detail = [e.message, e.code, e.details, e.hint].filter(Boolean).join(' | ') || String(err);
      console.error('[ProfileSetup] handleContinue error:', detail);
      setError('Failed to save your profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    event.target.value = '';

    // Show preview immediately from local object URL
    const previewUrl = URL.createObjectURL(file);
    setProfileImage(previewUrl);
    setProfileImageFile(file);
    setImageUploadError(null);
    setUploadedImageUrl(null);
    setImageUploading(true);

    try {
      const compressed = await compressImage(file);
      const url = await uploadImage(compressed, 'profile-images', user.id);
      setUploadedImageUrl(url);
    } catch (err) {
      console.error('[ProfileSetup] image upload failed:', err);
      setImageUploadError('Photo upload failed. Please try again.');
      setProfileImage(null);
      setProfileImageFile(null);
    } finally {
      URL.revokeObjectURL(previewUrl);
      setImageUploading(false);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  return (
    <div style={{ background: '#000', position: 'relative', width: 375, minHeight: 820, margin: '0 auto' }}>

      {/* Scope logo — top right */}
      <img
        src="/scope-logo-new.png"
        alt="Scope"
        style={{ position: 'absolute', top: 7, right: 6, height: 23, width: 'auto' }}
      />

      {/* "PROFILE / SETUP" — left of photo box */}
      <div style={{ position: 'absolute', left: 40, top: 163, transform: 'translateY(-50%)' }}>
        <p style={{ ...SKB, fontSize: 'var(--fs-14)', color: 'white', textTransform: 'uppercase', letterSpacing: '-0.28px', lineHeight: 1.4, margin: 0 }}>PROFILE</p>
        <p style={{ ...SKB, fontSize: 'var(--fs-14)', color: 'white', textTransform: 'uppercase', letterSpacing: '-0.28px', lineHeight: 1.4, margin: 0 }}>SETUP</p>
      </div>

      {/* Profile photo box — 130×130 with crosshair */}
      <div
        onClick={triggerFileInput}
        style={{ position: 'absolute', left: 122, top: 146, width: 130, height: 130, border: '1px solid white', background: 'transparent', cursor: 'pointer', overflow: 'hidden' }}
      >
        {profileImage ? (
          <img src={feedImage(profileImage, 320)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 1, height: 82, background: '#d9d9d9' }} />
            {/* Horizontal line */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 82, height: 1, background: '#d9d9d9' }} />
          </>
        )}
        {imageUploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FrameLoader />
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />

      {/* Username field */}
      <div style={{ position: 'absolute', left: 38, top: 349, width: 298, height: 25, border: '1px solid white', background: 'transparent', display: 'flex', alignItems: 'center' }}>
        <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'white', paddingLeft: 6, flexShrink: 0 }}>@</span>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toUpperCase())}
          placeholder="USERNAME"
          style={{ flex: 1, height: '100%', background: 'transparent', border: 'none', outline: 'none', ...SKB, fontSize: 'var(--fs-9)', color: 'white', letterSpacing: '-0.18px', paddingLeft: 3, paddingRight: 6 }}
        />
      </div>
      {usernameError && (
        <div style={{ position: 'absolute', left: 38, top: 378 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '-0.18px' }}>{usernameError}</span>
        </div>
      )}

      {/* Display name field */}
      <div style={{ position: 'absolute', left: 38, top: 406, width: 298, height: 24, border: '1px solid white', background: 'transparent', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.toUpperCase())}
          placeholder="DISPLAY NAME"
          style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', outline: 'none', ...SKB, fontSize: 'var(--fs-9)', color: 'white', letterSpacing: '-0.18px', paddingLeft: 6, paddingRight: 6 }}
        />
      </div>

      {/* Bio field */}
      <div style={{ position: 'absolute', left: 38, top: 462, width: 298, height: 83, border: '1px solid white', background: 'transparent' }}>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={160}
          placeholder="BIO [ 160 CHARACTER MAX ]"
          style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', ...SKB, fontSize: 'var(--fs-9)', color: 'white', letterSpacing: '-0.18px', padding: '6px 6px', boxSizing: 'border-box' }}
        />
      </div>

      {/* Image upload error */}
      {imageUploadError && (
        <div style={{ position: 'absolute', left: 38, top: 556 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '-0.18px' }}>{imageUploadError}</span>
        </div>
      )}

      {/* General error */}
      {error && (
        <div style={{ position: 'absolute', left: 38, top: 572, width: 298 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '-0.18px' }}>{error}</span>
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={isLoading || imageUploading || !!imageUploadError}
        style={{
          position: 'absolute', left: 122, top: 736, width: 130, height: 45,
          border: '1px solid white', background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: (isLoading || imageUploading || !!imageUploadError) ? 0.4 : 1,
        }}
      >
        <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'white', textTransform: 'uppercase', letterSpacing: '-0.2px' }}>
          {isLoading ? 'SAVING...' : 'CONTINUE'}
        </span>
      </button>
    </div>
  );
}
