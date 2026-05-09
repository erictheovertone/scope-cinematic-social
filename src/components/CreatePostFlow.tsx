"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { baseSepolia } from "viem/chains";
import { createPost, updatePostMintData } from '@/lib/postsService';
import MediaRenderer from '@/components/MediaRenderer';
import { mintNewPost } from '@/lib/zora';
import {
  getUserByPrivyId, getProfile, uploadImage,
  getUserDecks, createDeck, addPostToDeck,
  type Deck,
} from '@/lib/userService';

// ── Client-side image compression via Canvas API ──────────────────
// Max 1920px longest side, JPEG 0.82 quality, all formats → JPEG.
// Falls back to the original file on any error so uploads never break.
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const MAX = 1920;
    const QUALITY = 0.82;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      // Wrap everything so a canvas/toBlob failure never leaves the Promise hanging
      try {
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width >= height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            const base = file.name.replace(/\.[^.]+$/, "");
            resolve(new File([blob], `${base}-compressed.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          QUALITY
        );
      } catch (e) {
        resolve(file); // canvas failed — use original, never hang
      }
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

interface MediaItem {
  id: string;
  file: File;
  url: string;
  type: 'image' | 'video';
}

interface GridLayout {
  id: string;
  name: string;
  aspectRatio: string;
  gridTemplate: string;
  preview: string;
}

const GRID_LAYOUTS: GridLayout[] = [
  { id: 'single', name: 'Single', aspectRatio: '1:1', gridTemplate: 'grid-cols-1 grid-rows-1', preview: '□' },
  { id: 'horizontal', name: 'Horizontal', aspectRatio: '2.39:1', gridTemplate: 'grid-cols-1 grid-rows-1', preview: '▬' },
  { id: 'vertical', name: 'Vertical', aspectRatio: '9:16', gridTemplate: 'grid-cols-1 grid-rows-1', preview: '▮' },
  { id: 'grid2x2', name: '2x2 Grid', aspectRatio: '1:1', gridTemplate: 'grid-cols-2 grid-rows-2', preview: '⊞' },
  { id: 'grid3x1', name: '3x1 Strip', aspectRatio: '3:1', gridTemplate: 'grid-cols-3 grid-rows-1', preview: '⊟' }
];

const PROFILE_TO_POST_LAYOUT: { [key: string]: string } = {
  '2x-super-wide': 'horizontal',
  '1x-super-wide': 'horizontal',
  '2x-regular-wide': 'horizontal',
  '3x-square': 'single',
  'collage': 'grid2x2'
};

interface CreatePostFlowProps {
  isOpen: boolean;
  onClose: () => void;
  userLayoutId?: string;
}

export default function CreatePostFlow({ isOpen, onClose, userLayoutId = '3x-square' }: CreatePostFlowProps) {
  const [step, setStep] = useState<'media' | 'edit' | 'deck' | 'posting'>('media');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<GridLayout>(GRID_LAYOUTS[0]);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimising, setIsOptimising] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [mintStatus, setMintStatus] = useState<'idle' | 'minting' | 'minted' | 'mint-failed'>('idle');
  const [customThumbnail, setCustomThumbnail] = useState<File | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Crop overlay state
  const [cropY, setCropY] = useState(0.15);
  const [cropHeight, setCropHeight] = useState(0.70);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const cropDragRef = useRef<{ startY: number; startCropY: number; startCropH: number; mode: 'move' | 'top' | 'bottom' } | null>(null);

  // Deck step state
  const [userDecks, setUserDecks] = useState<(Deck & { item_count: number })[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckUsername, setDeckUsername] = useState('');
  const [showNewDeckForm, setShowNewDeckForm] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [creatingDeck, setCreatingDeck] = useState(false);

  useEffect(() => {
    const mappedId = PROFILE_TO_POST_LAYOUT[userLayoutId] || 'single';
    const layout = GRID_LAYOUTS.find(l => l.id === mappedId) || GRID_LAYOUTS[0];
    setSelectedLayout(layout);
  }, [userLayoutId, isOpen]);

  const handleMediaSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[handleMediaSelect] onChange fired');

    // IMPORTANT: convert to Array *before* clearing the input.
    // Setting value="" clears the FileList object in-place on Chrome/Firefox/Safari,
    // so any FileList reference held after that point would be empty.
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) {
      console.log('[handleMediaSelect] no files in event');
      return;
    }

    console.log(`[handleMediaSelect] File selected: ${files.map(f => `${f.name} (${(f.size / 1024).toFixed(1)} KB, ${f.type || 'no type'})`).join(' | ')}`);

    setIsOptimising(true);
    setVideoError(null);

    const newMedia: MediaItem[] = [];

    for (const file of files) {
      if (file.type.startsWith("video/")) {
        if (file.size > VIDEO_MAX_BYTES) {
          setVideoError("Video must be under 50MB. Please trim or compress before uploading.");
          continue;
        }
        newMedia.push({
          id: `${Date.now()}-${Math.random()}`,
          file,
          url: URL.createObjectURL(file),
          type: "video",
        });
      } else if (file.type.startsWith("image/")) {
        console.log(`[handleMediaSelect] Starting compression for ${file.name}…`);
        let processedFile = file;
        try {
          processedFile = await compressImage(file);
          console.log(`[handleMediaSelect] Compression complete: ${(processedFile.size / 1024).toFixed(1)} KB (was ${(file.size / 1024).toFixed(1)} KB)`);
        } catch (e) {
          console.error('[handleMediaSelect] Compression threw — using original:', e);
        }
        console.log('[handleMediaSelect] Adding to selectedMedia');
        newMedia.push({
          id: `${Date.now()}-${Math.random()}`,
          file: processedFile,
          url: URL.createObjectURL(processedFile),
          type: "image",
        });
      } else {
        console.log(`[handleMediaSelect] Skipping unrecognised type: "${file.type}" (${file.name})`);
      }
    }

    setSelectedMedia(prev => [...prev, ...newMedia]);
    setIsOptimising(false);
    setCropY(0.15);
    setCropHeight(0.70);
  }, []);

  const clampCrop = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

  const handleCropPointerDown = (e: React.PointerEvent, mode: 'move' | 'top' | 'bottom') => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    cropDragRef.current = { startY: e.clientY, startCropY: cropY, startCropH: cropHeight, mode };
  };

  const handleCropPointerMove = (e: React.PointerEvent) => {
    if (!cropDragRef.current || !cropContainerRef.current) return;
    const containerH = cropContainerRef.current.getBoundingClientRect().height;
    if (containerH === 0) return;
    const deltaFrac = (e.clientY - cropDragRef.current.startY) / containerH;
    const { startCropY, startCropH, mode } = cropDragRef.current;
    if (mode === 'move') {
      setCropY(clampCrop(startCropY + deltaFrac, 0, 1 - cropHeight));
    } else if (mode === 'top') {
      const newY = clampCrop(startCropY + deltaFrac, 0, startCropY + startCropH - 0.1);
      setCropY(newY);
      setCropHeight(clampCrop(startCropH - deltaFrac, 0.1, 1 - newY));
    } else {
      setCropHeight(clampCrop(startCropH + deltaFrac, 0.1, 1 - startCropY));
    }
  };

  const handleCropPointerUp = () => { cropDragRef.current = null; };

  const handleRemoveMedia = useCallback((id: string) => {
    setSelectedMedia(prev => {
      const removed = prev.find(item => item.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter(item => item.id !== id);
    });
  }, []);

  const loadDecksForStep = async () => {
    if (!user) return;
    setDecksLoading(true);
    try {
      const [decks, sbUser] = await Promise.all([
        getUserDecks(user.id),
        getUserByPrivyId(user.id),
      ]);
      setUserDecks(decks);
      if (sbUser) {
        const profile = await getProfile(sbUser.id);
        if (profile?.username) setDeckUsername(profile.username);
      }
    } catch (e) {
      console.error('loadDecksForStep error:', e);
    } finally {
      setDecksLoading(false);
    }
  };

  const handlePost = async (deckId?: string | null) => {
    if (!user || selectedMedia.length === 0) return;
    console.log('[handlePost] start — deckId:', deckId, 'media:', selectedMedia.length);

    setIsUploading(true);
    setPostError(null);

    try {
      const supabaseUser = await getUserByPrivyId(user.id);
      if (!supabaseUser) throw new Error('User not found in database');
      console.log('[handlePost] supabaseUser:', supabaseUser.id);

      const profile = await getProfile(supabaseUser.id);
      if (!profile?.username) throw new Error('Profile or username not found');
      console.log('[handlePost] profile:', profile.username, 'grid_layout:', (profile as any).grid_layout);

      const mediaUrls: string[] = [];
      for (const media of selectedMedia) {
        console.log('[handlePost] uploading:', media.file.name);
        const url = await uploadImage(media.file, 'post-media', user.id);
        mediaUrls.push(url);
        console.log('[handlePost] uploaded:', url);
      }

      let thumbnailUrl: string | null = null;
      if (customThumbnail) {
        thumbnailUrl = await uploadImage(customThumbnail, 'post-media', user.id);
        console.log('[handlePost] thumbnail uploaded:', thumbnailUrl);
      }

      const postPayload = {
        userId: user.id,
        username: profile.username,
        caption,
        mediaUrls,
        layoutId: (profile as any).grid_layout || selectedLayout.id,
        mediaType: selectedMedia[0]?.type || 'image',
        thumbnailUrl,
      };
      console.log('[handlePost] createPost payload:', postPayload);
      const newPost = await createPost(postPayload);
      console.log('[handlePost] post created:', newPost?.id);

      if (deckId && newPost?.id) {
        addPostToDeck(deckId, newPost.id).catch(e => console.error('addPostToDeck error:', e));
      }

      // Post saved — move to minting step
      selectedMedia.forEach(item => URL.revokeObjectURL(item.url));
      setIsUploading(false);
      setStep('posting');
      setMintStatus('minting');

      // Attempt mint — never blocks if it fails
      try {
        const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
        if (!embeddedWallet) throw new Error('No embedded wallet found');

        console.log('[mint] Switching to Base Sepolia...');
        await embeddedWallet.switchChain(baseSepolia.id);

        const provider = await embeddedWallet.getEthereumProvider();
        const walletClient = createWalletClient({
          account: embeddedWallet.address as `0x${string}`,
          chain: baseSepolia,
          transport: custom(provider),
        });

        console.log('[mint] Minting post:', newPost.id);
        const { contractAddress, hash } = await mintNewPost({
          walletClient,
          creatorAddress: embeddedWallet.address,
          postMetadata: {
            name: caption || 'Scope Post',
            description: caption,
            image: mediaUrls[0],
          },
        });
        console.log('[mint] Success — contract:', contractAddress, 'hash:', hash);

        await updatePostMintData(newPost.id, {
          contract_address: contractAddress as string,
          token_id: '1',
          tx_hash: hash as string,
          is_minted: true,
        });

        setMintStatus('minted');
      } catch (mintError) {
        console.error('[mint] Failed:', mintError);
        setMintStatus('mint-failed');
      }

      // Navigate regardless of mint result
      setTimeout(() => {
        onClose();
        setStep('media');
        setSelectedMedia([]);
        setCaption('');
        setSelectedDeckId(null);
        setMintStatus('idle');
        setCustomThumbnail(null);
        router.push('/profile');
      }, 2200);

    } catch (error) {
      console.error('[handlePost] FAILED:', error);
      setPostError('Failed to create post. Please try again.');
      setIsUploading(false);
    }
  };

  const handleCreateDeckAndSelect = async () => {
    if (!newDeckTitle.trim() || !user) return;
    setCreatingDeck(true);
    try {
      const deck = await createDeck(user.id, deckUsername, newDeckTitle.trim(), '');
      setUserDecks(prev => [{ ...deck, item_count: 0 }, ...prev]);
      setSelectedDeckId(deck.id);
      setShowNewDeckForm(false);
      setNewDeckTitle('');
    } catch (e) {
      console.error('createDeck error:', e);
    } finally {
      setCreatingDeck(false);
    }
  };

  const renderPostingStep = () => {
    const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6">
        {mintStatus === 'minting' && (
          <>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF0000' }} />
            <p style={{ ...SKB, fontSize: 10, color: 'white', textAlign: 'center', lineHeight: 1.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Your post is being minted on Base...
            </p>
          </>
        )}
        {mintStatus === 'minted' && (
          <p style={{ ...SKB, fontSize: 10, color: 'white', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Posted &amp; minted ✓
          </p>
        )}
        {mintStatus === 'mint-failed' && (
          <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 1.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Posted (mint failed — retry later)
          </p>
        )}
      </div>
    );
  };

  const renderMediaStep = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-[#333333]">
        <button onClick={onClose} className="text-white text-lg">×</button>
        <h2 style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 16, color: 'white', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>New Post</h2>
        <button
          onClick={() => setStep('edit')}
          disabled={selectedMedia.length === 0}
          style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'none', border: 'none', cursor: selectedMedia.length > 0 ? 'pointer' : 'default', color: selectedMedia.length > 0 ? '#FF0000' : '#666666' }}
        >
          Next
        </button>
      </div>

      <div className="flex-1 p-4 flex flex-col">
        {/* Optimising indicator */}
        {isOptimising && (
          <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 11, color: '#888888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12, textAlign: 'center' }}>
            Optimising…
          </p>
        )}

        {/* Video error */}
        {videoError && (
          <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 11, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
            {videoError}
          </p>
        )}

        {selectedMedia.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-24 h-24 border-2 border-dashed border-[#333333] rounded-lg flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M21 19V5C21 3.9 20.1 3 19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19ZM8.5 13.5L11 16.51L14.5 12L19 18H5L8.5 13.5Z" fill="#666666"/>
              </svg>
            </div>
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 11, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, textAlign: 'center' }}>
              Select photos and videos from your library
            </p>
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 24, textAlign: 'center' }}>
              Videos up to 50MB · MP4 recommended
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#FF0000', color: 'white', border: 'none', padding: '12px 24px', cursor: 'pointer' }}
            >
              Choose from Library
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleMediaSelect} className="hidden" />
          </div>
        ) : (
          <div className="flex-1">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {selectedMedia.map((item) => (
                <div key={item.id} className="relative aspect-square bg-[#333333] rounded-lg overflow-hidden">
                  {item.type === 'image' ? (
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={item.url} className="w-full h-full object-cover" />
                  )}
                  <button
                    onClick={() => handleRemoveMedia(item.id)}
                    className="absolute top-2 right-2 w-6 h-6 bg-black bg-opacity-70 rounded-full flex items-center justify-center text-white text-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square bg-[#333333] rounded-lg border-2 border-dashed border-[#666666] flex items-center justify-center"
              >
                <span className="text-[#666666] text-2xl">+</span>
              </button>
            </div>
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>
              Videos up to 50MB · MP4 recommended
            </p>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleMediaSelect} className="hidden" />
          </div>
        )}
      </div>
    </div>
  );

  const renderEditStep = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-[#333333]">
        <button onClick={() => setStep('media')} className="text-white text-lg">←</button>
        <h2 style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 14, color: 'white', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>Edit & Post</h2>
        <button
          onClick={() => { setStep('deck'); loadDecksForStep(); }}
          disabled={isUploading}
          style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'none', border: 'none', cursor: isUploading ? 'default' : 'pointer', color: isUploading ? '#666666' : '#FF0000' }}
        >
          Next
        </button>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-4">
          <div style={{ position: 'relative', width: '100%', marginBottom: 16, backgroundColor: '#000' }}>
            {selectedMedia[0]?.type === 'video' ? (
              <div
                ref={cropContainerRef}
                style={{ position: 'relative', width: '100%', backgroundColor: '#000', marginBottom: 16, touchAction: 'none' }}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerLeave={handleCropPointerUp}
              >
                <video
                  src={selectedMedia[0].url}
                  autoPlay muted loop playsInline
                  style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: '60vh' }}
                />
                {/* Dark bars — non-interactive overlay */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${cropY * 100}%`, background: 'rgba(0,0,0,0.72)' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${(1 - cropY - cropHeight) * 100}%`, background: 'rgba(0,0,0,0.72)' }} />
                </div>
                {/* Crop box — interactive */}
                <div
                  style={{ position: 'absolute', left: 0, right: 0, top: `${cropY * 100}%`, height: `${cropHeight * 100}%`, zIndex: 6, cursor: 'grab', pointerEvents: 'auto' }}
                  onPointerDown={(e) => handleCropPointerDown(e, 'move')}
                >
                  {/* Top handle */}
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'top')}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
                  >
                    <div style={{ width: 32, height: 1.5, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
                  </div>
                  {/* Bottom handle */}
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'bottom')}
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
                  >
                    <div style={{ width: 32, height: 1.5, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
                  </div>
                  {/* Corner markers */}
                  {([
                    { top: 0, left: 0, borderTop: '1px solid rgba(255,255,255,0.7)', borderLeft: '1px solid rgba(255,255,255,0.7)' },
                    { top: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.7)', borderRight: '1px solid rgba(255,255,255,0.7)' },
                    { bottom: 0, left: 0, borderBottom: '1px solid rgba(255,255,255,0.7)', borderLeft: '1px solid rgba(255,255,255,0.7)' },
                    { bottom: 0, right: 0, borderBottom: '1px solid rgba(255,255,255,0.7)', borderRight: '1px solid rgba(255,255,255,0.7)' },
                  ] as React.CSSProperties[]).map((corner, i) => (
                    <div key={i} style={{ position: 'absolute', width: 12, height: 12, ...corner }} />
                  ))}
                  {/* Aspect ratio label */}
                  <div style={{ position: 'absolute', bottom: 28, right: 8, background: 'rgba(0,0,0,0.55)', padding: '2px 5px' }}>
                    <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>
                      {selectedLayout.aspectRatio}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ width: '100%', aspectRatio: selectedLayout.aspectRatio.replace(':', '/'), overflow: 'hidden', backgroundColor: '#1A1A1A', border: '1px solid #333' }}>
                {selectedMedia[0] && (
                  <img
                    src={selectedMedia[0].url}
                    alt="Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
              </div>
            )}
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a caption..."
            className="w-full bg-transparent text-[14px] resize-none border-none outline-none placeholder-[#666666]"
            style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, color: '#FFFFFF', caretColor: '#FFFFFF', backgroundColor: 'transparent' }}
            rows={4}
          />
          {selectedMedia[0]?.type === 'video' && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
                CUSTOM THUMBNAIL (OPTIONAL)
              </p>
              {customThumbnail ? (
                <div style={{ position: 'relative', width: 80, height: 45 }}>
                  <img src={URL.createObjectURL(customThumbnail)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <button
                    onClick={() => setCustomThumbnail(null)}
                    style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: '#FF0000', border: 'none', cursor: 'pointer', color: 'white', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >×</button>
                </div>
              ) : (
                <button
                  onClick={() => thumbnailInputRef.current?.click()}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', cursor: 'pointer' }}
                >
                  <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>+ ADD THUMBNAIL</span>
                </button>
              )}
              <input ref={thumbnailInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCustomThumbnail(f); e.target.value = ''; }} style={{ display: 'none' }} />
            </div>
          )}
        </div>

        <div className="border-t border-[#333333] p-4">
          <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 10, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Layout: {selectedLayout.name} ({selectedLayout.aspectRatio})
          </p>
          <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {selectedMedia.length} media item{selectedMedia.length !== 1 ? 's' : ''} selected
          </p>
          {postError && (
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 10, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 8 }}>
              {postError}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderDeckStep = () => {
    const MONO_S: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <button onClick={() => setStep('edit')} className="text-white text-lg">←</button>
          <span style={{ ...MONO_S, fontSize: 11, color: 'white', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Add to a deck?</span>
          <button
            onClick={() => handlePost(null)}
            disabled={isUploading}
            style={{ ...MONO_S, fontSize: 11, color: 'white', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            Skip
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {decksLoading ? (
            <div className="flex items-center justify-center mt-8">
              <div style={{ width: 8, height: 8, background: '#FF0000', borderRadius: '50%' }} />
            </div>
          ) : (
            <>
              {userDecks.length === 0 && !showNewDeckForm && (
                <p style={{ ...MONO_S, fontSize: 8, color: 'rgba(255,255,255,0.35)', padding: '16px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  No decks yet — create one below
                </p>
              )}
              {userDecks.map(deck => (
                <button
                  key={deck.id}
                  onClick={() => setSelectedDeckId(selectedDeckId === deck.id ? null : deck.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: '10px 16px',
                    borderLeft: selectedDeckId === deck.id ? '2px solid #FF0000' : '2px solid transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div style={{ width: 32, height: 32, background: '#1a1a1a', flexShrink: 0, overflow: 'hidden' }}>
                    {deck.cover_image_url && (
                      <img src={deck.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ ...MONO_S, fontSize: 9, color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{deck.title}</p>
                    <p style={{ ...MONO_S, fontSize: 7, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {deck.item_count} frames
                    </p>
                  </div>
                  {selectedDeckId === deck.id && (
                    <span style={{ marginLeft: 'auto', ...MONO_S, fontSize: 9, color: '#FF0000' }}>✓</span>
                  )}
                </button>
              ))}

              {!showNewDeckForm ? (
                <button
                  onClick={() => setShowNewDeckForm(true)}
                  style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 16px', textAlign: 'left' }}
                >
                  <span style={{ ...MONO_S, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>+ Create new deck</span>
                </button>
              ) : (
                <div style={{ padding: '14px 16px' }}>
                  <input
                    autoFocus
                    type="text"
                    value={newDeckTitle}
                    onChange={e => setNewDeckTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateDeckAndSelect()}
                    placeholder="Deck title…"
                    style={{
                      display: 'block', width: '100%', background: 'transparent',
                      border: 'none', borderBottom: '1px solid rgba(255,255,255,0.2)',
                      outline: 'none', ...MONO_S, fontSize: 10, color: 'white',
                      padding: '4px 0', marginBottom: 12, boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 16 }}>
                    <button
                      onClick={handleCreateDeckAndSelect}
                      disabled={!newDeckTitle.trim() || creatingDeck}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', ...MONO_S, fontSize: 9, color: newDeckTitle.trim() ? 'white' : 'rgba(255,255,255,0.3)', padding: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    >
                      {creatingDeck ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      onClick={() => { setShowNewDeckForm(false); setNewDeckTitle(''); }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', ...MONO_S, fontSize: 9, color: 'rgba(255,255,255,0.4)', padding: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-[#1a1a1a] p-4">
          {postError && (
            <p style={{ ...MONO_S, fontSize: 10, color: '#FF0000', marginBottom: 10 }}>{postError}</p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handlePost(null)}
              disabled={isUploading}
              style={{
                flex: 1, background: 'transparent', border: '1px solid white',
                padding: '8px', cursor: isUploading ? 'default' : 'pointer',
              }}
            >
              <span style={{ ...MONO_S, fontSize: 11, color: isUploading ? 'rgba(255,255,255,0.4)' : 'white', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isUploading ? 'Posting…' : 'Skip'}
              </span>
            </button>
            <button
              onClick={() => handlePost(selectedDeckId)}
              disabled={isUploading || !selectedDeckId}
              style={{
                flex: 1, background: 'transparent', cursor: isUploading || !selectedDeckId ? 'default' : 'pointer',
                border: selectedDeckId ? '1px solid white' : '1px solid rgba(255,255,255,0.25)',
                padding: '8px',
              }}
            >
              <span style={{ ...MONO_S, fontSize: 11, color: isUploading || !selectedDeckId ? 'rgba(255,255,255,0.4)' : 'white', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isUploading ? 'Posting…' : 'Add to deck'}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000000', opacity: 1, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="bg-black border border-[#333333] w-[375px] h-[600px] relative overflow-hidden">
        {step === 'media' && renderMediaStep()}
        {step === 'edit' && renderEditStep()}
        {step === 'deck' && renderDeckStep()}
        {step === 'posting' && renderPostingStep()}
      </div>
    </div>
  );
}
