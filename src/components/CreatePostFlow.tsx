"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { base } from "viem/chains";
import { createPost, updatePostMintData } from '@/lib/postsService';
import MediaRenderer from '@/components/MediaRenderer';
import { mintNewPost } from '@/lib/zora';
import MintPromptSheet from '@/components/MintPromptSheet';
import {
  getUserByPrivyId, getProfile, uploadImage,
  getUserDecks, createDeck, addPostToDeck,
  type Deck,
} from '@/lib/userService';

function profileLayoutToAspect(layoutId: string): number {
  switch (layoutId) {
    case '2x-pana': case '1x-pana': case 'pana-wide': case 'pana-wide-2col': case 'pana-wide-2x': return 2.75;
    case '2x-scope': case '1x-scope': case 'scope': case 'scope-2col': case 'scope-2x': return 2.39;
    case '2x-cine': case '1x-cine': case 'cine-wide': case 'cine-wide-2col': case 'cine-wide-2x': return 1.85;
    case '3x-legacy': case 'legacy': return 4 / 3;
    case '3x-square': case 'collage': return 1;
    case '2x-super-wide': case '1x-super-wide': return 2.39;
    case '2x-regular-wide': return 16 / 9;
    default: return 2.39;
  }
}

function profileLayoutLabel(layoutId: string): string {
  switch (layoutId) {
    case '2x-pana': case '1x-pana': case 'pana-wide': case 'pana-wide-2col': case 'pana-wide-2x': return '2.75:1';
    case '2x-scope': case '1x-scope': case 'scope': case 'scope-2col': case 'scope-2x': return '2.39:1';
    case '2x-cine': case '1x-cine': case 'cine-wide': case 'cine-wide-2col': case 'cine-wide-2x': return '1.85:1';
    case '3x-legacy': case 'legacy': return '4:3';
    case '3x-square': case 'collage': return '1:1';
    case '2x-regular-wide': return '16:9';
    default: return '2.39:1';
  }
}

function profileLayoutName(layoutId: string): string {
  switch (layoutId) {
    case 'pana-wide': case '1x-pana': return '1X ULTRA-PAN';
    case 'pana-wide-2col': case 'pana-wide-2x': case '2x-pana': return '2X ULTRA-PAN';
    case 'scope': case '1x-scope': return '1X SCOPE';
    case 'scope-2col': case 'scope-2x': case '2x-scope': return '2X SCOPE';
    case 'cine-wide': case '1x-cine': return '1X CINE WIDE';
    case 'cine-wide-2col': case 'cine-wide-2x': case '2x-cine': return '2X CINE WIDE';
    case '3x-legacy': case 'legacy': return '3X LEGACY';
    case '3x-square': return '3X SQUARE';
    case 'collage': return 'COLLAGE';
    case '2x-super-wide': case '1x-super-wide': return 'SUPER WIDE';
    case '2x-regular-wide': return 'REGULAR WIDE';
    default: return layoutId.toUpperCase();
  }
}

async function cropImageToAspect(file: File, cropXFrac: number, cropYFrac: number, cropWidthFrac: number, naturalAr: number, targetAr: number): Promise<File> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const nW = img.naturalWidth;
        const nH = img.naturalHeight;
        const sw = Math.round(cropWidthFrac * nW);
        const sh = Math.round(sw / targetAr);
        const sx = Math.round(cropXFrac * nW);
        const sy = Math.round(Math.min(cropYFrac * nH, nH - sh));
        const outW = Math.min(nW, 2048);
        const outH = Math.round(outW / targetAr);
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          const base = file.name.replace(/\.[^.]+$/, '');
          resolve(new File([blob], `${base}-cropped.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.9);
      } catch { resolve(file); }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

function captureVideoThumbnail(videoUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.src = videoUrl;
    video.onloadedmetadata = () => { video.currentTime = 0.5; };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch { resolve(null); }
    };
    video.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 5000);
  });
}

async function uploadAutoThumbnail(dataUrl: string, userId: string): Promise<string | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'auto-thumb.jpg', { type: 'image/jpeg' });
    return await uploadImage(file, 'post-media', userId);
  } catch (e) {
    console.error('[uploadAutoThumbnail] error:', e);
    return null;
  }
}

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

// Normalises legacy prefixed layout IDs (e.g. '2x-cine', '1x-pana') to canonical form.
// Used at post-write time so posts.layout_id is always canonical regardless of
// what value is still stored in profiles.grid_layout.
const LEGACY_TO_CANONICAL: Record<string, string> = {
  '2x-pana': 'pana-wide-2col', '1x-pana': 'pana-wide',
  '2x-scope': 'scope-2col',    '1x-scope': 'scope',
  '2x-cine': 'cine-wide-2col', '1x-cine': 'cine-wide',
  '3x-legacy': 'legacy',
};

interface CreatePostFlowProps {
  isOpen: boolean;
  onClose: () => void;
  userLayoutId?: string;
}

export default function CreatePostFlow({ isOpen, onClose, userLayoutId = 'scope' }: CreatePostFlowProps) {
  const [step, setStep] = useState<'media' | 'edit' | 'deck' | 'posting'>('media');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
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
  const [videoAutoplay, setVideoAutoplay] = useState(true);
  const [autoThumbnail, setAutoThumbnail] = useState<string | null>(null);

  // Video crop state
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(1);
  const [cropHeight, setCropHeight] = useState(1);
  const [videoNaturalAr, setVideoNaturalAr] = useState(0);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const cropDragRef = useRef<{ startX: number; startY: number; startCropX: number; startCropY: number; startCropW: number; startCropH: number; mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; cW: number; cH: number } | null>(null);

  // Image crop state
  const [imageCropX, setImageCropX] = useState(0);
  const [imageCropY, setImageCropY] = useState(0);
  const [imageCropWidth, setImageCropWidth] = useState(1);
  const [imageCropHeight, setImageCropHeight] = useState(1);
  const [imgNaturalAr, setImgNaturalAr] = useState(0);
  const imageCropContainerRef = useRef<HTMLDivElement>(null);
  const imageCropDragRef = useRef<{ startX: number; startY: number; startCropX: number; startCropY: number; startCropW: number; startCropH: number; mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; cW: number; cH: number } | null>(null);

  // Mint prompt state
  const [showMintPrompt, setShowMintPrompt] = useState(false);
  const [justPostedId, setJustPostedId] = useState<string | null>(null);
  const [pendingMintData, setPendingMintData] = useState<{ postId: string; mediaUrls: string[]; postCaption: string } | null>(null);

  // Deck step state
  const [userDecks, setUserDecks] = useState<(Deck & { item_count: number })[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckUsername, setDeckUsername] = useState('');
  const [showNewDeckForm, setShowNewDeckForm] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [creatingDeck, setCreatingDeck] = useState(false);

  useEffect(() => {
    const tAR = profileLayoutToAspect(userLayoutId);
    if (imgNaturalAr > 0) {
      if (imgNaturalAr > tAR) {
        const cw = tAR / imgNaturalAr;
        setImageCropX((1 - cw) / 2); setImageCropY(0); setImageCropWidth(cw); setImageCropHeight(1);
      } else {
        const ch = imgNaturalAr / tAR;
        setImageCropX(0); setImageCropY((1 - ch) / 2); setImageCropWidth(1); setImageCropHeight(ch);
      }
    }
    if (videoNaturalAr > 0) {
      if (videoNaturalAr > tAR) {
        const cw = tAR / videoNaturalAr;
        setCropX((1 - cw) / 2); setCropY(0); setCropWidth(cw); setCropHeight(1);
      } else {
        const ch = videoNaturalAr / tAR;
        setCropX(0); setCropY((1 - ch) / 2); setCropWidth(1); setCropHeight(ch);
      }
    }
  }, [userLayoutId, isOpen, imgNaturalAr, videoNaturalAr]);

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
        const objUrl = URL.createObjectURL(file);
        newMedia.push({ id: `${Date.now()}-${Math.random()}`, file, url: objUrl, type: "video" });
        captureVideoThumbnail(objUrl).then(thumb => { if (thumb) setAutoThumbnail(thumb); });
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
    setCropX(0); setCropY(0); setCropWidth(1); setCropHeight(1); setVideoNaturalAr(0);
    setImageCropX(0); setImageCropY(0); setImageCropWidth(1); setImageCropHeight(1); setImgNaturalAr(0);
    if (!newMedia.some(m => m.type === 'video')) setAutoThumbnail(null);
  }, []);

  const clampCrop = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const handleCropPointerDown = (e: React.PointerEvent, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = cropContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    cropDragRef.current = { startX: e.clientX, startY: e.clientY, startCropX: cropX, startCropY: cropY, startCropW: cropWidth, startCropH: cropHeight, mode, cW: rect.width, cH: rect.height };
  };

  const handleCropPointerMove = (e: React.PointerEvent) => {
    if (!cropDragRef.current) return;
    const { startX, startY, startCropX: scX, startCropY: scY, startCropW: scW, startCropH: scH, mode, cW, cH } = cropDragRef.current;
    const dx = (e.clientX - startX) / cW;
    const dy = (e.clientY - startY) / cH;
    const tAR = profileLayoutToAspect(userLayoutId);
    const natAr = videoNaturalAr || tAR;
    const MIN = 0.08;
    let nX = scX, nY = scY, nW = scW, nH = scH;
    if (mode === 'move') {
      nX = clampCrop(scX + dx, 0, 1 - scW);
      nY = clampCrop(scY + dy, 0, 1 - scH);
    } else if (mode === 'se') {
      nW = clampCrop(scW + dx, MIN, 1 - scX);
      nH = nW * natAr / tAR;
      if (scY + nH > 1) { nH = 1 - scY; nW = nH * tAR / natAr; }
    } else if (mode === 'sw') {
      nW = clampCrop(scW - dx, MIN, scX + scW);
      nH = nW * natAr / tAR;
      if (scY + nH > 1) { nH = 1 - scY; nW = nH * tAR / natAr; }
      nX = scX + scW - nW;
    } else if (mode === 'ne') {
      nW = clampCrop(scW + dx, MIN, 1 - scX);
      nH = nW * natAr / tAR;
      nY = scY + scH - nH;
      if (nY < 0) { nY = 0; nH = scY + scH; nW = nH * tAR / natAr; }
    } else if (mode === 'nw') {
      nW = clampCrop(scW - dx, MIN, scX + scW);
      nH = nW * natAr / tAR;
      nX = scX + scW - nW; nY = scY + scH - nH;
      if (nX < 0) { nX = 0; nW = scX + scW; nH = nW * natAr / tAR; nY = scY + scH - nH; }
      if (nY < 0) { nY = 0; nH = scY + scH; nW = nH * tAR / natAr; nX = scX + scW - nW; }
    }
    setCropX(nX); setCropY(nY); setCropWidth(nW); setCropHeight(nH);
  };

  const handleCropPointerUp = () => { cropDragRef.current = null; };

  const handleImageCropPointerDown = (e: React.PointerEvent, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = imageCropContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    imageCropDragRef.current = { startX: e.clientX, startY: e.clientY, startCropX: imageCropX, startCropY: imageCropY, startCropW: imageCropWidth, startCropH: imageCropHeight, mode, cW: rect.width, cH: rect.height };
  };

  const handleImageCropPointerMove = (e: React.PointerEvent) => {
    if (!imageCropDragRef.current) return;
    const { startX, startY, startCropX: scX, startCropY: scY, startCropW: scW, startCropH: scH, mode, cW, cH } = imageCropDragRef.current;
    const dx = (e.clientX - startX) / cW;
    const dy = (e.clientY - startY) / cH;
    const tAR = profileLayoutToAspect(userLayoutId);
    const MIN = 0.08;
    let nX = scX, nY = scY, nW = scW, nH = scH;
    if (mode === 'move') {
      nX = clampCrop(scX + dx, 0, 1 - scW);
      nY = clampCrop(scY + dy, 0, 1 - scH);
    } else if (mode === 'se') {
      nW = clampCrop(scW + dx, MIN, 1 - scX);
      nH = nW * imgNaturalAr / tAR;
      if (scY + nH > 1) { nH = 1 - scY; nW = nH * tAR / imgNaturalAr; }
    } else if (mode === 'sw') {
      nW = clampCrop(scW - dx, MIN, scX + scW);
      nH = nW * imgNaturalAr / tAR;
      if (scY + nH > 1) { nH = 1 - scY; nW = nH * tAR / imgNaturalAr; }
      nX = scX + scW - nW;
    } else if (mode === 'ne') {
      nW = clampCrop(scW + dx, MIN, 1 - scX);
      nH = nW * imgNaturalAr / tAR;
      nY = scY + scH - nH;
      if (nY < 0) { nY = 0; nH = scY + scH; nW = nH * tAR / imgNaturalAr; }
    } else if (mode === 'nw') {
      nW = clampCrop(scW - dx, MIN, scX + scW);
      nH = nW * imgNaturalAr / tAR;
      nX = scX + scW - nW; nY = scY + scH - nH;
      if (nX < 0) { nX = 0; nW = scX + scW; nH = nW * imgNaturalAr / tAR; nY = scY + scH - nH; }
      if (nY < 0) { nY = 0; nH = scY + scH; nW = nH * tAR / imgNaturalAr; nX = scX + scW - nW; }
    }
    setImageCropX(nX); setImageCropY(nY); setImageCropWidth(nW); setImageCropHeight(nH);
  };

  const handleImageCropPointerUp = () => { imageCropDragRef.current = null; };

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

    setIsPosting(true);
    setIsUploading(true);
    setPostError(null);

    try {
      const supabaseUser = await getUserByPrivyId(user.id);
      if (!supabaseUser) throw new Error('User not found in database');
      console.log('[handlePost] supabaseUser:', supabaseUser.id, '| privy_id:', (supabaseUser as any).privy_id);

      const profile = await getProfile(supabaseUser.id);
      console.log('[handlePost] profile result — id:', profile?.id, '| user_id:', (profile as any)?.user_id, '| username:', profile?.username);
      if (!profile) throw new Error('Profile not found — please complete profile setup at /profile/setup');
      if (!profile.username) throw new Error('Username not set — please add a username at /profile/setup');
      console.log('[handlePost] profile:', profile.username, 'grid_layout:', (profile as any).grid_layout);

      const mediaUrls: string[] = [];
      for (const media of selectedMedia) {
        console.log('[handlePost] uploading:', media.file.name);
        let fileToUpload = media.file;
        if (media.type === 'image' && imgNaturalAr > 0) {
          fileToUpload = await cropImageToAspect(media.file, imageCropX, imageCropY, imageCropWidth, imgNaturalAr, profileLayoutToAspect(userLayoutId));
          console.log('[handlePost] image cropped to', profileLayoutToAspect(userLayoutId).toFixed(2), ':1');
        }
        const url = await uploadImage(fileToUpload, 'post-media', user.id);
        mediaUrls.push(url);
        console.log('[handlePost] uploaded:', url);
      }

      let thumbnailUrl: string | null = null;
      if (customThumbnail) {
        thumbnailUrl = await uploadImage(customThumbnail, 'post-media', user.id);
        console.log('[handlePost] thumbnail uploaded:', thumbnailUrl);
      } else if (selectedMedia[0]?.type === 'video' && autoThumbnail) {
        thumbnailUrl = await uploadAutoThumbnail(autoThumbnail, user.id);
        console.log('[handlePost] auto thumbnail uploaded:', thumbnailUrl);
      }

      const rawLayoutId: string = (profile as any).grid_layout || userLayoutId;
      const canonicalLayoutId = LEGACY_TO_CANONICAL[rawLayoutId] ?? rawLayoutId;

      const postPayload = {
        userId: supabaseUser.id,
        username: profile.username,
        caption,
        mediaUrls,
        layoutId: canonicalLayoutId,
        mediaType: selectedMedia[0]?.type || 'image',
        thumbnailUrl,
        autoplay: selectedMedia[0]?.type === 'video' ? videoAutoplay : true,
      };
      console.log('[handlePost] createPost payload:', postPayload);
      const newPost = await createPost(postPayload);
      console.log('[handlePost] post created:', newPost?.id);

      if (deckId && newPost?.id) {
        addPostToDeck(deckId, newPost.id).catch(e => console.error('addPostToDeck error:', e));
      }

      // Post saved — show mint prompt instead of auto-minting
      // Minting now triggered manually by user via MintPromptSheet
      selectedMedia.forEach(item => URL.revokeObjectURL(item.url));
      setIsUploading(false);
      setPendingMintData({ postId: newPost.id, mediaUrls, postCaption: caption });
      setJustPostedId(newPost.id);
      setShowMintPrompt(true);

    } catch (e: any) {
      console.error('[handlePost] FAILED:', e);
      console.error('[handlePost] error message:', e?.message);
      console.error('[handlePost] error code:', e?.code);
      console.error('[handlePost] error details:', JSON.stringify(e, null, 2));
      setPostError('Failed to create post. Please try again.');
      setIsUploading(false);
    }
  };

  const completeFlow = () => {
    onClose();
    setStep('media');
    setSelectedMedia([]);
    setCaption('');
    setSelectedDeckId(null);
    setMintStatus('idle');
    setCustomThumbnail(null);
    setVideoAutoplay(true);
    setAutoThumbnail(null);
    setPendingMintData(null);
    setShowMintPrompt(false);
    setJustPostedId(null);
    setIsPosting(false);
    router.push('/profile');
  };

  const handleDoMint = async () => {
    if (!pendingMintData) return;
    setShowMintPrompt(false);
    setStep('posting');
    setMintStatus('minting');
    try {
      const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
      if (!embeddedWallet) throw new Error('No embedded wallet found');
      console.log('[mint] Switching to Base...');
      await embeddedWallet.switchChain(base.id);
      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: base,
        transport: custom(provider),
      });
      console.log('[mint] Minting post:', pendingMintData.postId);
      const { contractAddress, hash } = await mintNewPost({
        walletClient,
        creatorAddress: embeddedWallet.address,
        postMetadata: {
          name: pendingMintData.postCaption || 'Scope Post',
          description: pendingMintData.postCaption,
          image: pendingMintData.mediaUrls[0],
        },
      });
      console.log('[mint] Success — contract:', contractAddress, 'hash:', hash);
      await updatePostMintData(pendingMintData.postId, {
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
    setTimeout(() => completeFlow(), 2200);
  };

  const handleSkipMint = () => {
    completeFlow();
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
                style={{ position: 'relative', width: '100%', backgroundColor: '#000', marginBottom: 16, touchAction: 'none', overflow: 'hidden' }}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerLeave={handleCropPointerUp}
              >
                <video
                  src={selectedMedia[0].url}
                  autoPlay muted loop playsInline
                  style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: '60vh' }}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget as HTMLVideoElement;
                    setVideoNaturalAr(v.videoWidth / v.videoHeight);
                  }}
                />
                {videoNaturalAr > 0 && (
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'move')}
                    style={{
                      position: 'absolute', zIndex: 6,
                      left: `${cropX * 100}%`, top: `${cropY * 100}%`,
                      width: `${cropWidth * 100}%`, height: `${cropHeight * 100}%`,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
                      outline: '1px solid rgba(255,255,255,0.45)',
                      cursor: 'grab', pointerEvents: 'auto', touchAction: 'none',
                    }}
                  >
                    {([
                      { id: 'nw', s: { top: 0, left: 0 }, tf: 'translate(-50%,-50%)', bt: true, bl: true, br: false, bb: false },
                      { id: 'ne', s: { top: 0, right: 0 }, tf: 'translate(50%,-50%)', bt: true, br: true, bl: false, bb: false },
                      { id: 'sw', s: { bottom: 0, left: 0 }, tf: 'translate(-50%,50%)', bb: true, bl: true, bt: false, br: false },
                      { id: 'se', s: { bottom: 0, right: 0 }, tf: 'translate(50%,50%)', bb: true, br: true, bt: false, bl: false },
                    ] as any[]).map(({ id, s, tf, bt, br, bb, bl }) => (
                      <div key={id} onPointerDown={(e) => { e.stopPropagation(); handleCropPointerDown(e, id); }}
                        style={{ position: 'absolute', width: 28, height: 28, cursor: `${id}-resize`, touchAction: 'none', transform: tf, ...s, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 14, height: 14, borderTop: bt ? '2px solid white' : 'none', borderRight: br ? '2px solid white' : 'none', borderBottom: bb ? '2px solid white' : 'none', borderLeft: bl ? '2px solid white' : 'none' }} />
                      </div>
                    ))}
                    <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.55)', padding: '2px 5px' }}>
                      <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>{profileLayoutLabel(userLayoutId)}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                ref={imageCropContainerRef}
                style={{ position: 'relative', width: '100%', backgroundColor: '#000', touchAction: 'none', marginBottom: 16, overflow: 'hidden' }}
                onPointerMove={handleImageCropPointerMove}
                onPointerUp={handleImageCropPointerUp}
                onPointerLeave={handleImageCropPointerUp}
              >
                {selectedMedia[0] && (
                  <img
                    src={selectedMedia[0].url}
                    alt="Preview"
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setImgNaturalAr(img.naturalWidth / img.naturalHeight);
                    }}
                    style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '65vh', objectFit: 'contain' }}
                  />
                )}
                {imgNaturalAr > 0 && (
                  <div
                    onPointerDown={(e) => handleImageCropPointerDown(e, 'move')}
                    style={{
                      position: 'absolute', zIndex: 6,
                      left: `${imageCropX * 100}%`, top: `${imageCropY * 100}%`,
                      width: `${imageCropWidth * 100}%`, height: `${imageCropHeight * 100}%`,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
                      outline: '1px solid rgba(255,255,255,0.45)',
                      cursor: 'grab', pointerEvents: 'auto', touchAction: 'none',
                    }}
                  >
                    {([
                      { id: 'nw', s: { top: 0, left: 0 }, tf: 'translate(-50%,-50%)', bt: true, bl: true, br: false, bb: false },
                      { id: 'ne', s: { top: 0, right: 0 }, tf: 'translate(50%,-50%)', bt: true, br: true, bl: false, bb: false },
                      { id: 'sw', s: { bottom: 0, left: 0 }, tf: 'translate(-50%,50%)', bb: true, bl: true, bt: false, br: false },
                      { id: 'se', s: { bottom: 0, right: 0 }, tf: 'translate(50%,50%)', bb: true, br: true, bt: false, bl: false },
                    ] as any[]).map(({ id, s, tf, bt, br, bb, bl }) => (
                      <div key={id} onPointerDown={(e) => { e.stopPropagation(); handleImageCropPointerDown(e, id); }}
                        style={{ position: 'absolute', width: 28, height: 28, cursor: `${id}-resize`, touchAction: 'none', transform: tf, ...s, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 14, height: 14, borderTop: bt ? '2px solid white' : 'none', borderRight: br ? '2px solid white' : 'none', borderBottom: bb ? '2px solid white' : 'none', borderLeft: bl ? '2px solid white' : 'none' }} />
                      </div>
                    ))}
                    <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.55)', padding: '2px 5px' }}>
                      <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>{profileLayoutLabel(userLayoutId)}</span>
                    </div>
                  </div>
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
            <>
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
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                AUTOPLAY
              </p>
              <button
                onClick={() => setVideoAutoplay(v => !v)}
                style={{ width: 36, height: 20, borderRadius: 0, background: videoAutoplay ? '#FF0000' : 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease', padding: 0 }}
              >
                <div style={{ position: 'absolute', top: 2, left: videoAutoplay ? 18 : 2, width: 16, height: 16, borderRadius: 0, background: 'white', transition: 'left 0.2s ease' }} />
              </button>
            </div>
            </>
          )}
        </div>

        <div className="border-t border-[#333333] p-4">
          <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 10, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            LAYOUT: {profileLayoutName(userLayoutId)} ({profileLayoutLabel(userLayoutId)})
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
                transition: 'transform 0.1s ease',
              }}
              onPointerDown={(e) => { if (!isUploading) e.currentTarget.style.transform = 'scale(0.96)'; }}
              onPointerUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onPointerLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <span style={{ ...MONO_S, fontSize: 11, color: isUploading ? 'rgba(255,255,255,0.4)' : 'white', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isPosting ? 'POSTING...' : 'Skip'}
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
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000000', opacity: 1, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="bg-black border border-[#333333] w-[375px] h-[600px] relative overflow-hidden">
          {step === 'media' && renderMediaStep()}
          {step === 'edit' && renderEditStep()}
          {step === 'deck' && renderDeckStep()}
          {step === 'posting' && renderPostingStep()}
        </div>
      </div>
      <MintPromptSheet
        visible={showMintPrompt}
        onMint={handleDoMint}
        onSkip={handleSkipMint}
      />
      {isPosting && !showMintPrompt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 600,
          backgroundColor: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeInBlack 0.2s ease forwards',
        }}>
          <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 12, color: 'white', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            POSTING...
          </p>
        </div>
      )}
    </>
  );
}
