"use client";

import { useState, useRef, useEffect } from "react";
import { feedImage } from "@/lib/mediaUrl";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { saveProfile, uploadImage, getUserByPrivyId, getProfileByUsername, syncUserWithSupabase } from "@/lib/userService";
import ScopeLoader from "@/components/ScopeLoader";

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    // PFP only — it renders at avatar sizes, so 512² WebP (~80–150KB) is plenty and
    // uploads near-instant on cell. (Post media stays full-res in CreatePostFlow.)
    const MAX = 512, QUALITY = 0.85;
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
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '-pfp.webp', { type: 'image/webp' }));
        }, 'image/webp', QUALITY);
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

  const disabled = isLoading || imageUploading || !!imageUploadError;
  const fieldStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'transparent',
    border: '1px solid rgba(229,225,219,0.19)', borderRadius: 0, outline: 'none',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
    color: 'var(--ink-100)', letterSpacing: 'var(--track-body)',
  };
  const errStyle: React.CSSProperties = {
    display: 'block', marginTop: 5, fontFamily: 'var(--font-display)', fontWeight: 700,
    fontSize: 9, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em',
  };

  // Brief S3 — presentation rebuilt to frame 93:708; upload/validation/submit untouched.
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', boxSizing: 'border-box', overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', padding: 'calc(8px + var(--safe-top)) 13px calc(24px + var(--safe-bottom))' }}>
      {/* Placeholder labels = small tracked dim caps (Haas). ::placeholder carries its OWN
          font-size, so the INPUT text can stay ≥16px (iOS zoom trap) while labels read tiny. */}
      <style>{`
        .s3-input::placeholder {
          font-family: var(--font-display); font-weight: 700;
          font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(229,225,219,0.28);
        }
      `}</style>

      {/* Logomark — top-right, 44×28, 60%. */}
      <img src="/design-updates-071526/scope-logomark-offwhite.png" alt="Scope" style={{ position: 'absolute', top: 'calc(11px + var(--safe-top))', right: 13, width: 44, height: 'auto', opacity: 0.6 }} />

      {/* Title — centred, above the PFP. */}
      <p style={{ alignSelf: 'center', margin: '70px 0 0', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', textAlign: 'center' }}>Set up your profile</p>

      {/* PFP upload — 130×130 hairline, "+" trigger. On selected image the preview covers
          and the + disappears. Upload flow (picker → compress → upload) unchanged. */}
      <div onClick={triggerFileInput} style={{ position: 'relative', width: 130, height: 130, alignSelf: 'center', marginTop: 16, border: '1px solid rgba(229,225,219,0.15)', boxSizing: 'border-box', background: 'transparent', cursor: 'pointer', overflow: 'hidden' }}>
        {profileImage ? (
          <img src={feedImage(profileImage, 320)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <>
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 1, height: 82, background: 'rgba(229,225,219,0.52)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 82, height: 1, background: 'rgba(229,225,219,0.52)' }} />
          </>
        )}
        {imageUploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ScopeLoader size="md" />
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />

      {/* Fields — hairline recipe, 294 wide, in-field placeholder labels. */}
      <div style={{ alignSelf: 'center', width: 294, maxWidth: '100%', marginTop: 66, display: 'flex', flexDirection: 'column', gap: 15 }}>
        <div>
          <input className="s3-input" type="text" value={username} onChange={(e) => setUsername(e.target.value.toUpperCase())} placeholder="@ USERNAME" style={{ ...fieldStyle, height: 40, padding: '0 12px' }} />
          {usernameError && <span style={errStyle}>{usernameError}</span>}
        </div>
        <input className="s3-input" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value.toUpperCase())} placeholder="DISPLAY NAME" style={{ ...fieldStyle, height: 40, padding: '0 12px' }} />
        <textarea className="s3-input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} placeholder="BIO [ 160 CHARACTER MAX ]" style={{ ...fieldStyle, height: 122, resize: 'none', padding: '10px 12px' }} />
        {imageUploadError && <span style={errStyle}>{imageUploadError}</span>}
        {error && <span style={errStyle}>{error}</span>}
      </div>

      {/* Continue — bottom-right, 24px 75 Bold ~67%. Same submit handler; disabled = dimmed. */}
      <button onClick={handleContinue} disabled={disabled} className="tap-target" style={{ marginTop: 'auto', alignSelf: 'flex-end', background: 'transparent', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: '10px 2px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, letterSpacing: 'var(--track-display)', color: 'rgba(229,225,219,0.67)', opacity: disabled ? 0.4 : 1 }}>
        {isLoading ? 'Saving…' : 'Continue'}
      </button>
    </div>
  );
}
