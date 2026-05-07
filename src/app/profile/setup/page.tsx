"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { saveProfile, uploadImage, getUserByPrivyId, getProfileByUsername, syncUserWithSupabase } from "@/lib/userService";

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

      router.push('/profile/grid-layout');
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
    <div className="bg-black relative w-[375px] h-[900px] mx-auto">
      {/* Red dot logo */}
      <div className="absolute left-[10px] top-[10px] w-[15px] h-[15px]">
        <div className="w-[15px] h-[15px] bg-[#FF0000] rounded-full" />
      </div>

      {/* Title */}
      <div className="absolute left-[50px] top-[75px]">
        <p style={{ ...SKB, fontSize: 11, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: '140%', margin: 0 }}>Profile</p>
        <p style={{ ...SKB, fontSize: 11, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: '140%', margin: 0 }}>Setup</p>
      </div>

      {/* Profile Picture Upload */}
      <div className="absolute left-[130px] top-[143px] w-[114px] h-[114px] border border-white bg-transparent cursor-pointer" onClick={triggerFileInput}>
        {profileImage ? (
          <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-white text-[60px] font-thin select-none" style={{ lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</span>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

      {/* Name Input */}
      <div className="absolute left-[50px] top-[300px] w-[275px] h-[45px] border border-white bg-transparent">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full h-full bg-transparent text-white outline-none px-[5px] font-['SK-Modernist'] font-bold text-[9px] leading-[140%]"
          style={{ color: 'white' }}
        />
        {!displayName && (
          <div className="absolute left-[5px] top-[14.5px] transform -translate-y-1/2 pointer-events-none">
            <span style={{ ...SKB, fontSize: 9, color: '#818181', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</span>
          </div>
        )}
      </div>

      {/* Username Input */}
      <div className="absolute left-[50px] top-[365px] w-[275px] h-[45px] border border-white bg-transparent">
        <div className="relative w-full h-full flex items-center">
          <span className="absolute left-[5px] pointer-events-none z-10" style={{ ...SKB, fontSize: 9, color: 'white' }}>@</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full h-full bg-transparent text-white outline-none pl-[15px] pr-[5px] font-['SK-Modernist'] font-bold text-[9px] leading-[140%]"
            style={{ color: 'white' }}
          />
        </div>
        {!username && (
          <div className="absolute left-[15px] top-[14.5px] transform -translate-y-1/2 pointer-events-none">
            <span style={{ ...SKB, fontSize: 9, color: '#818181', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Username</span>
          </div>
        )}
      </div>

      {usernameError && (
        <div className="absolute left-[50px] top-[412px]">
          <span style={{ ...SKB, fontSize: 9, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {usernameError}
          </span>
        </div>
      )}

      {/* Bio Input */}
      <div className="absolute left-[50px] top-[430px] w-[275px] h-[130px] border border-white bg-transparent">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={160}
          className="w-full h-full bg-transparent text-white outline-none px-[5px] py-[14.5px] font-['SK-Modernist'] font-bold text-[9px] leading-[140%] resize-none"
          style={{ color: 'white' }}
        />
        {!bio && (
          <div className="absolute left-[5px] top-[14.5px] transform -translate-y-1/2 pointer-events-none">
            <span style={{ ...SKB, fontSize: 9, color: '#818181', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bio [ 160 character max ]</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="absolute left-[50px] top-[590px] w-[275px]">
          <p style={{ ...SKB, fontSize: 9, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* Upload status */}
      {imageUploading && (
        <div className="absolute left-[50px] top-[620px] w-[275px]">
          <p style={{ ...SKB, fontSize: 9, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Uploading photo…
          </p>
        </div>
      )}
      {imageUploadError && (
        <div className="absolute left-[50px] top-[620px] w-[275px]">
          <p style={{ ...SKB, fontSize: 9, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            {imageUploadError}
          </p>
        </div>
      )}

      {/* Continue Button */}
      <div className="absolute left-[122px] top-[760px] w-[130px] h-[45px] z-50">
        <button
          onClick={handleContinue}
          disabled={isLoading || imageUploading || !!imageUploadError}
          className="w-full h-full border border-white bg-black text-white flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span style={{ ...SKB, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isLoading ? 'Saving...' : 'Continue'}
          </span>
        </button>
      </div>
    </div>
  );
}
