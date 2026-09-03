"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { base } from "viem/chains";
import { createPost, updatePostCoinData, updatePostCoinTxHash, updatePostMusic } from '@/lib/postsService';
import { uploadVideoToStream } from '@/lib/streamUpload';
import MediaRenderer from '@/components/MediaRenderer';
// NOTE: the 1155 path (mintNewPost) is DORMANT — intact in src/lib/zora.ts as the
// rollback lifeboat, deliberately unreferenced here. New posts mint as coins.
import { createScopeCoin, backOwnCoin, errInfo, coinImageUrl, streamHlsUrl, HLS_MIME } from '@/lib/zoraCoins';
import { classifyZoraFailure } from '@/lib/zoraErrors';
import { preflightTrade, preflightMessage } from '@/lib/economy/preflight';
import { suggestTicker, normalizeTicker, isValidTicker } from '@/lib/economy/ticker';
import { useTxNarrator } from '@/components/TxNarrator';
import { notifyTradeSettled } from '@/lib/economy/tradeEvents';
import MintPromptSheet from '@/components/MintPromptSheet';
import {
  getUserByPrivyId, getProfile, uploadImage, uploadImageWithRenditions, isProMember,
  getUserDecks, createDeck, addPostToDeck,
  type Deck,
} from '@/lib/userService';
import FinishingStep from '@/components/finishing/FinishingStep';
import { DEFAULT_PARAMS, type EditParams } from '@/lib/editor/params';
import { bakeLook, hasLookEdits, decodeImageFile } from '@/lib/editor/bakeLook';
import { createLook, getLooks, uploadLookThumb, setLookThumb, type SavedLook } from '@/lib/looksService';
import { getScopeLimitType } from '@/lib/limits';
import { useUpsell } from '@/components/UpsellProvider';
import CropTool from '@/components/CropTool';
import FrameLoader from '@/components/FrameLoader';
import { chipForLayout, getAspectRatio } from '@/lib/aspectRatio';
import {
  neutralGeometry, bakeImageGeometry, type EditGeometry,
} from '@/lib/editGeometry';
import FinishingPreview from '@/components/finishing/FinishingPreview';
import SnippetSelector from '@/components/finishing/SnippetSelector';
import MusicPicker, { type LibraryTrack } from '@/components/MusicPicker';
import ClipSelector from '@/components/ClipSelector';

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

// Brief V2a — a bake/decode that never settles = a silently FROZEN "POSTING…". Wrap any
// awaited stage that could hang so a stall becomes a NAMED, caught error instead of a freeze.
function withTimeout<T>(p: Promise<T>, ms: number, stage: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${stage} timed out after ${Math.round(ms / 1000)}s`)), ms)),
  ]);
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
    console.error('[uploadAutoThumbnail] error:', errInfo(e));
    return null;
  }
}

/** Grab a single frame of a video (at `time` seconds, default 0) as a JPEG File —
 *  the raw still that the poster bake (geometry + look) then renders from. */
function captureVideoFrameFile(url: string, time = 0): Promise<File> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'auto';
    const grab = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = v.videoWidth; cv.height = v.videoHeight;
        const ctx = cv.getContext('2d');
        if (!ctx || !cv.width || !cv.height) { reject(new Error('captureVideoFrameFile: no frame')); return; }
        ctx.drawImage(v, 0, 0);
        cv.toBlob((b) => {
          v.src = '';
          b ? resolve(new File([b], 'poster-frame.jpg', { type: 'image/jpeg' })) : reject(new Error('captureVideoFrameFile: toBlob failed'));
        }, 'image/jpeg', 0.92);
      } catch (e) { reject(e as Error); }
    };
    v.onloadeddata = () => {
      const dur = isFinite(v.duration) ? v.duration : 0;
      const t = Math.min(Math.max(time, 0), dur || 0);
      if (t > 0) { v.onseeked = grab; v.currentTime = t; } else grab();
    };
    v.onerror = () => reject(new Error('captureVideoFrameFile: video load failed'));
    v.src = url;
  });
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

const VIDEO_MAX_BYTES = 500 * 1024 * 1024; // 500 MB (Brief V3 — tus handles it; 300s duration backstop stays)

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
  const { showUpsell } = useUpsell();
  const [step, setStep] = useState<'media' | 'crop' | 'finishing' | 'edit' | 'deck' | 'posting'>('media');
  const [discardConfirm, setDiscardConfirm] = useState(false); // OS back/edge-swipe guard
  // Geometry chosen in the crop tool. `chosenLayoutId` is the AR id picked by a
  // collage user; non-collage users keep their canonical grid layout_id.
  const [editGeometry, setEditGeometry] = useState<EditGeometry | null>(null);
  // Look params from FINISHING (Brief 8B). Baked into the JPEG (photo) + stored.
  const [editParams, setEditParams] = useState<EditParams>(DEFAULT_PARAMS);
  // Music (M2) — an attached library track + its layering mode. Playback flags only;
  // NEVER on the publish critical path (just columns on the create insert).
  const [musicTrackId, setMusicTrackId] = useState<string | null>(null);
  const [musicTrack, setMusicTrack] = useState<LibraryTrack | null>(null);
  const [musicMode, setMusicMode] = useState<'bed' | 'music_only' | null>(null);
  const [musicStart, setMusicStart] = useState(0); // clip start offset (seconds) → posts.music_start_seconds
  const [videoDuration, setVideoDuration] = useState(0); // selected video's length → the clip window width
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  // Real Pro status + grid gating for FINISHING, resolved via the verified path
  // (DID → getUserByPrivyId → getProfile → isProMember). uuid typing respected.
  const [finishCtx, setFinishCtx] = useState<{ isPro: boolean; gridLayout: 'standard' | 'collage'; layoutId: string; userUuid: string } | null>(null);
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([]);
  // Bumped when a Pro purchase resolves in-app → re-fetch finishCtx so the
  // editor's isPro refreshes and Pro tools unlock WITHOUT a page reload.
  const [proTick, setProTick] = useState(0);
  const [chosenLayoutId, setChosenLayoutId] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
  // Read the selected video's duration (the clip window matches it for video posts).
  useEffect(() => {
    if (selectedMedia[0]?.type !== 'video' || !selectedMedia[0]?.url) { setVideoDuration(0); return; }
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => setVideoDuration(isFinite(v.duration) ? v.duration : 0);
    v.src = selectedMedia[0].url;
    return () => { v.src = ''; };
  }, [selectedMedia]);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  // Brief V2 — Stream TUS upload progress (0–100). Set during the video upload.
  const [uploadPct, setUploadPct] = useState(0);
  // Brief V2c — the SHOWN value: interpolated toward uploadPct so the big counter ticks
  // 1-by-1 instead of jumping in 5 MiB chunk steps. Never exceeds the real value.
  const [displayPct, setDisplayPct] = useState(0);
  // Interpolate displayPct → uploadPct at ~1%/tick (4%/tick to sweep the final stretch to
  // 100). The display is clamped to the real value, so a STALLED upload freezes the counter
  // (honesty rule — the counter must not drift past real and mask a stall). A drop in
  // uploadPct (new post reset) snaps the display straight down. Reduced-motion → jump.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayPct(uploadPct);
      return;
    }
    const id = setInterval(() => {
      setDisplayPct((d) => {
        if (d >= uploadPct) return uploadPct;            // caught up / reset → sit at real
        return Math.min(uploadPct, d + (uploadPct >= 100 ? 4 : 1)); // sweep quickly at completion
      });
    }, 50);
    return () => clearInterval(id);
  }, [uploadPct]);
  const [isPosting, setIsPosting] = useState(false);
  const [isOptimising, setIsOptimising] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  // Brief V2a — the live publish stage, surfaced on the POSTING overlay so a HANG names
  // itself on Eric's device (no inspector needed). Set via the local `stage` in handlePost.
  const [postStage, setPostStage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const narrator = useTxNarrator();
  const [mintStatus, setMintStatus] = useState<'idle' | 'minting' | 'minted' | 'mint-failed' | 'coin-failed' | 'backing-failed'>('idle');
  // Coin ticker (Zora symbol) + optional creator self-buy, entered on the mint step.
  const [ticker, setTicker] = useState('');
  const [selfBuyUsd, setSelfBuyUsd] = useState('');
  // Backing-retry context: the coin already exists, so RETRY re-attempts ONLY
  // the self-buy (never the mint). Captured when the in-flow backing fires.
  const backingCtxRef = useRef<{ walletClient: any; creatorAddress: string; coinAddress: string; usdAmount: number; postId: string; sym: string } | null>(null);
  // Slim inline narration for multi-signature sequences (labeling, not gating):
  // "1 OF 2 — CREATING YOUR COIN…" → "2 OF 2 — BACKING YOUR POST · $1.00".
  const [backingNarration, setBackingNarration] = useState<string | null>(null);
  // Funds pre-flight verdict for the BACKING leg only (never gates the coin):
  // set when the wallet can't afford the typed backing → MintPromptSheet shows
  // the specific "you need ~$X more USDC" + FUND WALLET instead of the generic
  // backing-failed copy. Null = a genuine route/market failure (generic copy).
  const [backingFundsLine, setBackingFundsLine] = useState<string | null>(null);
  // CEREMONY IN THE FLOW: codified = the red corner brackets have snapped onto
  // the post's media inside the mint sheet; ceremonySub = honest sub-line when
  // a slow backing leg hands off to the global chip.
  const [codified, setCodified] = useState(false);
  const [ceremonySub, setCeremonySub] = useState<string | null>(null);
  const [customThumbnail, setCustomThumbnail] = useState<File | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLTextAreaElement>(null);
  const [videoAutoplay, setVideoAutoplay] = useState(true);
  // Brief M10 §2 — the Mirage autoplay snippet window. null → untouched → Mirage plays
  // from 0 (the default). Set only when the creator drags the SnippetSelector. Persisted
  // as plain metadata (snippet_start / snippet_length) — NO baked clip.
  const [snippetWindow, setSnippetWindow] = useState<{ start: number; length: number } | null>(null);
  const [autoThumbnail, setAutoThumbnail] = useState<string | null>(null);

  // Resolve real Pro status + grid gating for FINISHING once the user is known.
  // IDENTIFIER TYPING: DID (user.id) ONLY to getUserByPrivyId; the uuid
  // (supabaseUser.id) goes to getProfile. The editor never receives the DID.
  useEffect(() => {
    if (!user?.id) { setFinishCtx(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const supabaseUser = await getUserByPrivyId(user.id); // DID → users row (uuid)
        if (!supabaseUser || cancelled) return;
        const profile = await getProfile(supabaseUser.id);     // uuid → profile
        if (!profile || cancelled) return;
        const raw = (profile as any).grid_layout || userLayoutId;
        const canonical = LEGACY_TO_CANONICAL[raw] ?? raw;
        setFinishCtx({
          isPro: isProMember(profile as any),
          gridLayout: raw === 'collage' ? 'collage' : 'standard',
          layoutId: canonical,
          userUuid: supabaseUser.id, // uuid for looksService (NEVER the DID)
        });
        // Load saved looks (degrades to [] pre-migration; never crashes the flow).
        const looks = await getLooks(supabaseUser.id);
        if (!cancelled) setSavedLooks(looks);
      } catch (e) {
        console.error('[CreatePostFlow] finishCtx load error:', errInfo(e));
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, userLayoutId, proTick]);

  // SUITE STANDDOWN: while this flow is mounted, page-swipe navigation is OFF
  // globally (SwipeNav reads this attribute) — an editing session must be
  // un-swipe-away-able from anywhere. Removed on exit (publish/back/cancel all
  // unmount the flow), so swipe-nav resumes.
  // Keyed on isOpen, NOT mount: the profile page keeps this component MOUNTED
  // with isOpen=false (it early-returns null), so a mount-keyed effect set the
  // takeover attribute with no suite presented — hiding the footer on the
  // normal profile view (runtime-proven by the [footer] bench) and silently
  // disabling SwipeNav there too. Set only while actually presenting; the
  // cleanup covers close AND unmount.
  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.dataset.suiteOpen = '1';
    return () => { delete document.documentElement.dataset.suiteOpen; };
  }, [isOpen]);

  // ── HISTORY GUARD (the iOS edge-back-swipe) ────────────────────────────────
  // SwipeNav (in-app touch) is already stood down via data-suite-open, but the
  // browser's own edge-back-swipe is a HISTORY navigation no touch listener can
  // block in a PWA. We catch it via popstate: once there's progress to lose,
  // push a sentinel entry; a back-nav pops it → we re-assert (stay) and confirm
  // before discarding, so a swipe can never SILENTLY destroy edits. (Fully
  // standalone PWAs where the edge-swipe closes the app with no history are a
  // NATIVE-WRAPPER item — the container must own the gesture.)
  const guardPushed = useRef(false);
  useEffect(() => {
    if (!isOpen) { guardPushed.current = false; return; }
    const hasProgress = step === 'crop' || step === 'finishing' || step === 'edit' || step === 'deck';
    if (!hasProgress) return;
    if (!guardPushed.current && typeof window !== 'undefined') { window.history.pushState({ scopePostGuard: true }, ''); guardPushed.current = true; }
    const onPop = () => { window.history.pushState({ scopePostGuard: true }, ''); setDiscardConfirm(true); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isOpen, step]);

  // Re-read Pro status in place after an in-app purchase (no remount/reload).
  useEffect(() => {
    const onProActivated = () => setProTick((t) => t + 1);
    window.addEventListener('scope:pro-activated', onProActivated);
    return () => window.removeEventListener('scope:pro-activated', onProActivated);
  }, []);

  // Save the current edit stack as a Look (uuid-typed; versioned in looksService).
  // A thumbnail (source frame + look, captured at save) is layered on AFTER the
  // insert — best-effort, so a thumb upload failure never blocks the save.
  const handleSaveLook = async (name: string, p: EditParams, thumb?: Blob): Promise<boolean> => {
    if (!finishCtx?.userUuid) return false;
    try {
      const look = await createLook(finishCtx.userUuid, name, p); // the CONFIRMED insert
      let withThumb = look;
      if (thumb && user?.id) {
        try {
          const url = await uploadLookThumb(thumb, user.id, look.id); // DID-prefixed storage path
          await setLookThumb(look.id, url);
          withThumb = { ...look, thumb_url: url };
        } catch (e) {
          console.warn('[CreatePostFlow] look thumbnail upload failed (look saved without it):', e);
        }
      }
      setSavedLooks((ls) => [withThumb, ...ls]);
      return true; // drives the "added to palette" confirmation animation
    } catch (e) {
      console.error('[CreatePostFlow] saveLook failed:', errInfo(e));
      return false;
    }
  };

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
  const [pendingMintData, setPendingMintData] = useState<{
    postId: string;
    userId: string;
    mediaUrls: string[];
    postCaption: string;
    // Coin metadata image = the GRADED media: poster_url (video hero frame) for
    // video, the baked image for photos — never the raw upload. Nullable (V2e): the
    // video chain can return null only when every link is empty → the mint guard fires.
    image: string | null;
    animationUrl: string | null;
    mediaType: string;
    layoutId: string;
  } | null>(null);

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
      // Brief V2 — .mov / QuickTime / HEVC now ACCEPTED: Cloudflare Stream transcodes them
      // server-side. On iOS Safari (the primary iPhone target) the local preview + poster
      // bake decode HEVC natively; on non-Safari the best-effort client poster may skip and
      // Stream's own auto-thumbnail backfills stream_poster_url. (The 500MB guard stays for
      // V2 — raising it is a follow-up now the transcode barrier is gone.)
      const isMov = file.type === "video/quicktime" || file.name.toLowerCase().endsWith(".mov");
      if (file.type.startsWith("video/") || isMov) {
        if (file.size > VIDEO_MAX_BYTES) {
          setVideoError("Video must be under 500MB. Please trim or compress before uploading.");
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
          console.error('[handleMediaSelect] Compression threw — using original:', errInfo(e));
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
      console.error('loadDecksForStep error:', errInfo(e));
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
    setUploadPct(0);      // Brief V2c — reset the counter for this publish
    setDisplayPct(0);

    // Brief V2a — track the current stage locally (the state var is stale inside the
    // catch closure) so a failure/hang can NAME the stage on screen + in the message.
    let stage = '';
    const setStage = (s: string) => { stage = s; setPostStage(s); console.log('[handlePost] stage:', s); };

    try {
      const supabaseUser = await getUserByPrivyId(user.id);
      if (!supabaseUser) throw new Error('User not found in database');
      console.log('[handlePost] supabaseUser:', supabaseUser.id, '| privy_id:', (supabaseUser as any).privy_id);

      const profile = await getProfile(supabaseUser.id);
      console.log('[handlePost] profile result — id:', profile?.id, '| user_id:', (profile as any)?.user_id, '| username:', profile?.username);
      if (!profile) throw new Error('Profile not found — please complete profile setup at /profile/setup');
      if (!profile.username) throw new Error('Username not set — please add a username at /profile/setup');
      console.log('[handlePost] profile:', profile.username, 'grid_layout:', (profile as any).grid_layout);

      // ── layout_id + geometry resolution ──
      // layout_id stays the canonical grid layout for non-collage users (existing
      // write path, untouched). Collage users post per-AR: the chosen chip id
      // becomes layout_id. edit_geometry is additive — never replaces layout_id.
      const rawLayoutId: string = (profile as any).grid_layout || userLayoutId;
      const canonicalLayoutId = LEGACY_TO_CANONICAL[rawLayoutId] ?? rawLayoutId;
      const isCollage = rawLayoutId === 'collage';

      const geomBase: EditGeometry = editGeometry ?? neutralGeometry(chipForLayout(canonicalLayoutId).id);
      const finalLayoutId = isCollage ? (chosenLayoutId ?? geomBase.ar) : canonicalLayoutId;
      const exportChip = chipForLayout(finalLayoutId);
      const geometry: EditGeometry = { ...geomBase, ar: exportChip.id };
      console.log('[handlePost] layout_id:', finalLayoutId, '| geometry:', geometry);

      const mediaUrls: string[] = [];
      let streamUid: string | null = null;
      for (const media of selectedMedia) {
        // Brief V2 — VIDEO branch: the raw file is Cloudflare Stream's store of record
        // (NOT Supabase → no double storage). TUS straight to Stream; the post publishes
        // 'processing' and the webhook flips it 'ready'. Playback swap is V3, so media_urls
        // stays EMPTY for video until then — surfaces show the graded poster meanwhile.
        if (media.type === 'video') {
          setStage('Uploading video');
          console.log('[handlePost] uploading video to Stream:', media.file.name);
          streamUid = await uploadVideoToStream(media.file, (frac) => setUploadPct(Math.round(frac * 100)));
          console.log('[handlePost] stream upload complete, uid:', streamUid);
          continue;
        }
        console.log('[handlePost] uploading:', media.file.name);
        let fileToUpload = media.file;
        if (media.type === 'image') {
          // 1) Bake the affine geometry (crop + straighten + rotate) at canonical dims.
          fileToUpload = await bakeImageGeometry(media.file, geometry, exportChip.exportW, exportChip.exportH);
          console.log('[handlePost] geometry baked at', exportChip.exportW, 'x', exportChip.exportH);
          // 2) Bake the FINISHING look on top (color/grain/curves) via the gl-react
          //    pipeline → readback JPEG. Skipped when there are no look edits (the
          //    un-edited path stays byte-identical to before). GATE B: a bake/readback
          //    failure THROWS → caught below → publish aborts (never uploads an
          //    un-graded image as if it were graded).
          if (hasLookEdits(editParams)) {
            const baseImg = await decodeImageFile(fileToUpload);
            const lookBlob = await bakeLook(baseImg, editParams, exportChip.exportW, exportChip.exportH);
            fileToUpload = new File(
              [lookBlob],
              fileToUpload.name.replace(/\.[^.]+$/, '') + '-graded.jpg',
              { type: 'image/jpeg' },
            );
            console.log('[handlePost] look baked (graded)');
          }
        }
        // Main post image is shown through feedImage everywhere → bake its 600/1600
        // display renditions alongside the master (no transform at read time).
        const url = await uploadImageWithRenditions(fileToUpload, 'post-media', user.id);
        mediaUrls.push(url);
        console.log('[handlePost] uploaded (+renditions):', url);
      }

      // ── Poster bake (VIDEO) — ONE frame (hero frame if graded, else first),
      //    geometry + look applied, same captureAsBlob machinery as the photo bake.
      //    Cheap (one frame, no transcode). Shown wherever the video isn't playing
      //    (grid/feed/thumbnails) so the graded look is visible at zero playback
      //    cost. Best-effort: a failure never blocks publishing.
      let posterUrl: string | null = null;
      if (selectedMedia[0]?.type === 'video') {
        setStage('Baking poster');
        try {
          // Brief V2a — ONE frame (image work, NOT a re-encode → E1-compliant). Wrapped in a
          // timeout so a gl-react readback stall can't freeze POSTING: on stall it throws, is
          // caught here, and the post still publishes (poster is best-effort; the Stream
          // webhook backfills stream_poster_url anyway).
          posterUrl = await withTimeout((async () => {
            const heroT = editParams.heroFrameTime ?? 0;
            const frameFile = await captureVideoFrameFile(selectedMedia[0].url, heroT);
            let posterFile = await bakeImageGeometry(frameFile, geometry, exportChip.exportW, exportChip.exportH);
            if (hasLookEdits(editParams)) {
              const posterImg = await decodeImageFile(posterFile);
              const posterBlob = await bakeLook(posterImg, editParams, exportChip.exportW, exportChip.exportH);
              posterFile = new File([posterBlob], 'poster.jpg', { type: 'image/jpeg' });
            }
            return uploadImageWithRenditions(posterFile, 'post-media', user.id);
          })(), 25_000, 'Poster bake');
          console.log('[handlePost] poster baked (+renditions):', posterUrl);
        } catch (e) {
          console.warn('[handlePost] poster bake failed/stalled (publishing without graded poster):', e);
        }
      }

      // ── Brief V2a — the autoplay-clip bake is REMOVED for the Stream path. It re-encoded
      //    the video client-side (canvas.captureStream + MediaRecorder driving the gl-react
      //    Pipeline) — a VIOLATION of E1 (no client-side video re-encode) that V2 wrongly
      //    kept, and the FREEZE Eric hit: on iOS Safari that chain STALLS with halation and
      //    never fires recorder.onstop, so `await bakeAutoplayClip` never settled → POSTING
      //    hung forever (a try/catch can't rescue a hang). The raw video is Stream's store of
      //    record and edit_params are persisted, so graded playback is V3's job — no client
      //    re-encode here.
      const autoplayClipUrl: string | null = null;

      let thumbnailUrl: string | null = null;
      if (customThumbnail) {
        thumbnailUrl = await uploadImageWithRenditions(customThumbnail, 'post-media', user.id);
        console.log('[handlePost] thumbnail uploaded (+renditions):', thumbnailUrl);
      } else if (selectedMedia[0]?.type === 'video' && autoThumbnail) {
        thumbnailUrl = await uploadAutoThumbnail(autoThumbnail, user.id);
        console.log('[handlePost] auto thumbnail uploaded:', thumbnailUrl);
      }

      const isVideo = selectedMedia[0]?.type === 'video';
      const postPayload = {
        userId: supabaseUser.id,
        username: profile.username,
        caption,
        mediaUrls,
        layoutId: finalLayoutId,
        mediaType: selectedMedia[0]?.type || 'image',
        thumbnailUrl,
        posterUrl,
        autoplayClipUrl,
        autoplay: isVideo ? videoAutoplay : true,
        editGeometry: geometry,
        // Look params — versioned for forward-compat. Photo: already baked into the
        // JPEG above; stored for future re-editability. Video: stored, applied at
        // playback in a later brief (no playback shader yet).
        editParams: { v: 1, ...editParams },
        // Mirror the crop into the legacy crop_* columns for video playback that
        // reads them today (images are baked, so they need no runtime crop).
        ...(isVideo ? {
          cropX: geometry.crop.x, cropY: geometry.crop.y,
          cropWidth: geometry.crop.w, cropHeight: geometry.crop.h,
          // Brief V2 — Stream store-of-record + processing status. mediaUrls is empty
          // for video (V3 wires stream_playback_url into playback).
          streamUid,
          videoStatus: 'processing' as const,
          // Brief M10 §2 — Mirage snippet window (metadata, seconds). null when the creator
          // didn't set one → Mirage plays from 0. NO clip is baked (the window is data).
          snippetStart: snippetWindow ? snippetWindow.start : null,
          snippetLength: snippetWindow ? snippetWindow.length : null,
        } : {}),
      };
      console.log('[handlePost] createPost payload:', postPayload);
      setStage('Publishing');
      const newPost = await createPost(postPayload);
      console.log('[handlePost] post created:', newPost?.id);

      // Brief V2d — publish-side ready check (fire-and-forget). A short encode can finish
      // before the webhook lands; this heals the row fast without waiting for Stream's retry
      // backoff. No-op if still processing; the webhook + 5-min reconcile cron are the net.
      if (isVideo && newPost?.id) {
        const pid = newPost.id;
        setTimeout(() => {
          fetch('/api/stream/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: pid }) }).catch(() => {});
        }, 10_000);
      }

      if (deckId && newPost?.id) {
        addPostToDeck(deckId, newPost.id).catch(e => console.error('addPostToDeck error:', errInfo(e)));
      }

      // MUSIC ATTACH — STRICTLY NON-BLOCKING (the critical-path rule). The post is
      // already published above; attaching the library track is a best-effort
      // follow-up UPDATE, never awaited. A failure degrades to "published without
      // music" + a quiet log — it can never block publish or the mint that follows.
      if (newPost?.id && musicTrackId) {
        updatePostMusic(newPost.id, musicTrackId, musicMode, musicStart)
          .then((r) => { if (!r.ok) console.warn('[music] attach failed — post published without music'); })
          .catch(() => console.warn('[music] attach threw — post published without music'));
      }

      // Post saved — show mint prompt instead of auto-minting
      // Minting now triggered manually by user via MintPromptSheet
      selectedMedia.forEach(item => URL.revokeObjectURL(item.url));
      setIsUploading(false);
      setPendingMintData({
        postId: newPost.id,
        userId: supabaseUser.id,
        mediaUrls,
        postCaption: caption,
        // GRADED image: photos = baked image. Video = the Brief V2e four-link chain
        // (posterUrl ?? thumbnailUrl ?? stream_poster_url[null at publish] ?? constructed
        // Stream thumbnail from the uid) — the guard in uploadCoinMetadata is the backstop.
        image: isVideo ? coinImageUrl({ posterUrl, thumbnailUrl, streamUid }) : mediaUrls[0],
        // Brief V2e §2 — animation_url = the deterministic HLS manifest (from the uid). The
        // manifest becomes valid once encoding finishes; Zora only needs a string at mint.
        animationUrl: isVideo ? streamHlsUrl(streamUid) : null,
        mediaType: selectedMedia[0]?.type || 'image',
        layoutId: finalLayoutId,
      });
      // Caption-derived ticker suggestion; creator overwrites it on the mint step.
      setTicker(suggestTicker(caption));
      setSelfBuyUsd('');
      setJustPostedId(newPost.id);
      setShowMintPrompt(true);

    } catch (e: any) {
      const lt = getScopeLimitType(e);
      if (lt) { setIsPosting(false); setIsUploading(false); showUpsell(lt); return; }
      console.error('[handlePost] FAILED:', errInfo(e));
      console.error('[handlePost] error message:', e?.message);
      console.error('[handlePost] error code:', e?.code);
      console.error('[handlePost] error details:', JSON.stringify(e, null, 2));
      // Brief V2a — NAME the failing stage + code on screen (publish-honesty rule); the
      // stage line also shows on the POSTING overlay during a stall so a hang self-reports.
      const code = e?.code ?? e?.status ?? '';
      setPostError(`${stage || 'Publish'} failed${code ? ` [${code}]` : ''} — ${e?.message ?? 'unknown error'}. Please try again.`);
      setIsUploading(false);
      // Clear the full-screen POSTING overlay so the error is actually visible
      // (GATE B: a bake/publish failure must be loud, never a silent stuck state).
      setIsPosting(false);
    }
  };

  const completeFlow = () => {
    onClose();
    setStep('media');
    setPostStage('');
    setUploadPct(0);
    setSelectedMedia([]);
    setCaption('');
    setEditGeometry(null);
    setChosenLayoutId(null);
    setSelectedDeckId(null);
    setMintStatus('idle');
    setCustomThumbnail(null);
    setVideoAutoplay(true);
    setSnippetWindow(null);
    setAutoThumbnail(null);
    setMusicTrackId(null);
    setMusicTrack(null);
    setMusicMode(null);
    setMusicStart(0);
    setVideoDuration(0);
    setShowMusicPicker(false);
    setPendingMintData(null);
    setShowMintPrompt(false);
    setJustPostedId(null);
    setIsPosting(false);
    setTicker('');
    setSelfBuyUsd('');
    setBackingNarration(null);
    setCodified(false);
    setCeremonySub(null);
    router.push('/profile');
  };

  // Phase 1: create the post's COIN (createCoin), Scope as platformReferrer.
  // The post is ALREADY persisted (handlePost) — a coin failure can never lose
  // it. The coin step is post-hoc + isolated; on failure we set 'coin-failed'
  // (loud inline) and still complete the flow, leaving the post coin-pending
  // (no coin_address) and retryable.
  // THE CEREMONY HAPPENS IN THE FLOW (supersedes take 3's navigate-first):
  // narration, signing, codification all play INSIDE the mint sheet — the
  // user navigates only after the terminal beat. The global chip is demoted
  // to fallback narrator: it carries ONLY a slow backing remainder (or future
  // background money actions), never a mint the user is still inside.
  const handleDoMint = async () => {
    if (!pendingMintData) return;
    const sym = normalizeTicker(ticker);
    if (!isValidTicker(sym)) { setTicker(sym); return; } // backstop; MintPromptSheet gates the button
    const plannedBuyUsd = parseFloat(selfBuyUsd);
    const hasBacking = isFinite(plannedBuyUsd) && plannedBuyUsd > 0;
    const data = pendingMintData;
    const postId = data.postId;
    const beat = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    setMintStatus('minting');
    setCeremonySub(null);
    // In-sheet signing box: clean copy — no reverse brackets, no "…" (Note 1).
    setBackingNarration(hasBacking ? '1 OF 2 — FRAGMENTING POST…' : 'FRAGMENTING POST…');

    try {
      const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
      if (!embeddedWallet) throw new Error('No embedded wallet found');
      await embeddedWallet.switchChain(base.id);
      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: base,
        transport: custom(provider),
      });
      console.log('[coin] Creating coin for post:', postId, 'ticker:', sym);
      const { coinAddress, hash, currency } = await createScopeCoin({
        walletClient,
        creatorAddress: embeddedWallet.address,
        post: {
          id: postId,
          userId: data.userId,
          name: data.postCaption || 'Scope Post',
          description: data.postCaption || '',
          symbol: sym,
          image: data.image ?? '', // null → the uploadCoinMetadata guard fires (honest backstop)
          animationUrl: data.animationUrl,
          mimeType: data.mediaType === 'video' ? HLS_MIME : undefined,
        },
      });
      // Reconciliation breadcrumb BEFORE the canonical write (amendment C).
      await updatePostCoinTxHash(postId, hash).catch(() => {});
      await updatePostCoinData(postId, {
        coin_address: coinAddress,
        ticker: sym,
        coin_tx_hash: hash,
        coin_currency: currency,
        creator_address: embeddedWallet.address, // denormalized for the awarding jobs (Step A)
      });
      console.log('[coin] Success — coin:', coinAddress, 'tx:', hash);
      setMintStatus('minted');

      // THE CODIFICATION CEREMONY — the red corner brackets snap onto the
      // post's media HERE, inside the flow. The work is coined where the
      // user made it.
      setCodified(true);
      await beat(900);

      if (hasBacking) {
        setBackingNarration(`2 OF 2 — BACKING · $${plannedBuyUsd.toFixed(2)}`);
        // SAME trade as the standalone collect: backOwnCoin now delegates to
        // buyCoin (USDC, the routable currency) — one implementation, two
        // callers. The old in-flow backing FAILED because it sold ETH, for
        // which a ZORA-paired content coin has no route. A short readiness
        // window (~7.5s) absorbs a just-created pool's indexing lag; wider
        // slippage absorbs its high price impact. Context is captured for an
        // isolated retry.
        backingCtxRef.current = { walletClient, creatorAddress: embeddedWallet.address, coinAddress, usdAmount: plannedBuyUsd, postId, sym };
        // FUNDS PRE-FLIGHT (backing leg ONLY — the coin above is already live and
        // is never gated on USDC): the backing spends USDC; a wallet without it
        // was a doomed attempt ending in an opaque route-500. Answer it here
        // with the specific shortfall + fund path instead.
        setBackingFundsLine(null);
        const pf = await preflightTrade({ wallet: embeddedWallet.address, requireUsdc: plannedBuyUsd });
        if (!pf.ok) {
          console.warn('[coin] backing pre-flight blocked the attempt (coin unaffected):', pf);
          setMintStatus('backing-failed');
          setBackingFundsLine(preflightMessage(pf, { action: 'back' }));
          setBackingNarration(null);
          return;
        }
        const backingPromise = backOwnCoin({ walletClient, creatorAddress: embeddedWallet.address, coinAddress, usdAmount: plannedBuyUsd, slippage: 0.15 });
        // Generous bound: the DEFAULT path completes the backing IN-FLOW (the
        // readiness poll + trade fit comfortably on a normal pool). Only a
        // genuinely slow-to-index pool exceeds this and degrades to the global
        // chip (the exception). 32s > the ~30s poll window so an exhausted poll
        // surfaces as a proper in-flow failure, not a premature hand-off.
        const BOUND_MS = 32_000;
        const raced = await Promise.race([
          backingPromise.then((r) => ({ kind: 'landed' as const, r })).catch((e) => ({ kind: 'failed' as const, e })),
          beat(BOUND_MS).then(() => ({ kind: 'slow' as const })),
        ]);
        if (raced.kind === 'landed') {
          // Receipt-true backing count (the mint-flow path matches collect).
          setBackingNarration(raced.r.pieces != null ? `[ BACKED · ${raced.r.pieces} FRAGMENTS ]` : '[ BACKED ]');
          notifyTradeSettled(postId); // backing pieces → wallet holdings refresh
          await beat(1200);
        } else if (raced.kind === 'failed') {
          // The COIN is safe — only the backing leg failed. Hold on ONE
          // dismissible surface (MintPromptSheet 'backing-failed') whose RETRY
          // re-attempts ONLY the backing. No auto-navigation, no stuck chip.
          console.warn('[coin] backing did not land (coin unaffected):', errInfo(raced.e));
          setMintStatus('backing-failed');
          setBackingNarration(null);
          return;
        } else {
          // SLOW (exception): finish the coin ceremony, hand ONLY the backing
          // remainder to the global chip to settle in the background.
          setCeremonySub('BACKING SETTLING — FINISHING IN BACKGROUND');
          narrator.narrate({ phase: 'working', label: `] BACKING YOUR POST · $${plannedBuyUsd.toFixed(2)} [`, postId });
          backingPromise
            .then((r) => { narrator.done(r.pieces != null ? `[ BACKED · ${r.pieces} FRAGMENTS ]` : '[ BACKED ]', postId); notifyTradeSettled(postId); })
            .catch((e) => {
              console.warn('[coin] handed-off backing failed (coin unaffected):', errInfo(e));
              // Honest, dismissible — tap clears + goes to the post, where the
              // backing can be retried from the collect sheet. Not a dead RETRY.
              narrator.fail('BACKING DIDN’T LAND — FINISH FROM YOUR POST', postId);
            });
        }
      }

      // TERMINAL BEAT — then, and only then, the epilogue: navigation.
      setBackingNarration(`[ FRAGMENTS CREATED · ${sym} ]`);
      notifyTradeSettled(postId); // the ONE post-trade refresh path
      await beat(2000);
      completeFlow();
    } catch (coinError) {
      // IN-FLOW failure state: [ COIN FAILED ] + plain-English reason +
      // RETRY / CONTINUE TO PROFILE (rendered by MintPromptSheet). The post is
      // never hostage — no auto-navigation, kebab retry always remains.
      // Brief Z2 §3 — classification by EVIDENCE, not by string-matching.
      //
      // The old regex matched "failed to create content calldata" — the single
      // constant the SDK throws for EVERY create failure — and called it an
      // outage. So a rate limit, a rejected key and bad metadata all rendered as
      // "Zora's service is having trouble", and that sentence was a guess. Z1
      // spent a whole investigation getting behind it.
      //
      // classifyZoraFailure reads the real HTTP status recorded by the evidence
      // tap (which sits below the SDK, where the response still exists). The
      // outage line is now reserved for 5xx / network-class evidence and is
      // never a fallback.
      const verdict = classifyZoraFailure(coinError, { action: 'mint' });
      console.error(`[coin] createScopeCoin failed [${verdict.kind}: ${verdict.evidence}]:`, errInfo(coinError));
      setMintStatus('coin-failed');
      setCodified(false);
      setBackingNarration(verdict.message);
    }
  };

  // RETRY the BACKING ONLY — the coin already exists (decoupled). Re-runs the
  // same backOwnCoin (readiness poll + simulate-first) against the now-older
  // pool. Success → terminal COINED + navigate; failure → hold the same single
  // dismissible surface again. The mint is never re-run here.
  const retryBacking = async () => {
    const ctx = backingCtxRef.current;
    if (!ctx) { completeFlow(); return; }
    const beat = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    setMintStatus('minted'); // back to the in-sheet wheel (coin is live)
    setCeremonySub(null);
    setBackingNarration(`BACKING · $${ctx.usdAmount.toFixed(2)}`);
    // Same funds gate as the first attempt — a retry without USDC is the same
    // doomed attempt. After funding, RETRY BACKING passes and proceeds.
    setBackingFundsLine(null);
    const pf = await preflightTrade({ wallet: ctx.creatorAddress, requireUsdc: ctx.usdAmount });
    if (!pf.ok) {
      console.warn('[coin] backing retry pre-flight blocked (coin unaffected):', pf);
      setMintStatus('backing-failed');
      setBackingFundsLine(preflightMessage(pf, { action: 'back' }));
      setBackingNarration(null);
      return;
    }
    try {
      const r = await backOwnCoin({ walletClient: ctx.walletClient, creatorAddress: ctx.creatorAddress, coinAddress: ctx.coinAddress, usdAmount: ctx.usdAmount, slippage: 0.15 });
      setBackingNarration(r.pieces != null ? `[ BACKED · ${r.pieces} FRAGMENTS ]` : '[ BACKED ]');
      notifyTradeSettled(ctx.postId);
      await beat(1200);
      setBackingNarration(`[ FRAGMENTS CREATED · ${ctx.sym} ]`);
      await beat(1500);
      completeFlow();
    } catch (e) {
      console.warn('[coin] backing retry failed (coin unaffected):', errInfo(e));
      setMintStatus('backing-failed');
      setBackingNarration(null);
    }
  };

  const handleSkipMint = () => {
    completeFlow();
  };

  // LOUD path for a dismissed FUND WALLET gate (failure contract): the post is
  // already live but has NO coin — surface coin-failed inline (with the
  // "create it later from your profile" pointer to the kebab retry), never a
  // silent skip.
  const handleCoinSkipped = () => {
    setShowMintPrompt(false);
    setStep('posting');
    setMintStatus('coin-failed');
    setTimeout(() => completeFlow(), 2200);
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
    } catch (e: any) {
      const lt = getScopeLimitType(e);
      if (lt) { setCreatingDeck(false); showUpsell(lt); return; }
      console.error('createDeck error:', errInfo(e));
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
            <FrameLoader />
            <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#E5E1DB', textAlign: 'center', lineHeight: 1.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Creating your coin on Base...
            </p>
          </>
        )}
        {mintStatus === 'minted' && (
          <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#E5E1DB', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Posted &amp; coined ✓
          </p>
        )}
        {(mintStatus === 'coin-failed' || mintStatus === 'mint-failed') && (
          <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#E5E1DB', textAlign: 'center', lineHeight: 1.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Posted — coin not created. You can create it later from your profile.
          </p>
        )}
        {/* Slim signature narration — which approval is in front of you, never a modal. */}
        {backingNarration && (mintStatus === 'minting' || mintStatus === 'minted') && (
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#E5E1DB', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
            {backingNarration}
          </p>
        )}
      </div>
    );
  };

  const renderMediaStep = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, marginLeft: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#E5E1DB', fontSize: 30, lineHeight: 1, fontWeight: 300, touchAction: 'manipulation' }}>×</button>
        <h2 style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-16)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>New Post</h2>
        <button
          onClick={() => setStep('crop')}
          disabled={selectedMedia.length === 0}
          style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-13)', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'none', border: 'none', cursor: selectedMedia.length > 0 ? 'pointer' : 'default', color: selectedMedia.length > 0 ? '#E5E1DB' : '#666666' }}
        >
          Next
        </button>
      </div>

      <div className="flex-1 p-4 flex flex-col">
        {/* Optimising indicator */}
        {isOptimising && (
          <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-11)', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12, textAlign: 'center' }}>
            Optimising…
          </p>
        )}

        {/* Video error */}
        {videoError && (
          <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
            {videoError}
          </p>
        )}

        {selectedMedia.length === 0 ? (
          /* Empty state — content on black, no container chrome. Ivory-gradient-border
             CHOOSE FROM LIBRARY (transparent fill; border 135deg #E5E1DB→ivory 50%,
             1.5px). Brief F5 §2: recolored off the oxblood #7a0505 red straggler. */
          <div className="flex-1 flex flex-col items-center justify-center">
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-11)', color: 'rgba(229,225,219,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, textAlign: 'center' }}>
              Select a photo or video from your library
            </p>
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 28, textAlign: 'center' }}>
              Videos up to 500MB · MP4 recommended
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="tappable"
              style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-12)', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#E5E1DB', border: '1.5px solid transparent', background: 'linear-gradient(#000, #000) padding-box, linear-gradient(135deg, #E5E1DB, rgba(229,225,219,0.5)) border-box', padding: '14px 28px', cursor: 'pointer' }}
            >
              Choose from Library
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime,.mov" onChange={handleMediaSelect} className="hidden" />
          </div>
        ) : (
          /* Loaded — the single selected media WHOLE (true aspect, letterboxed on black,
             never cropped), no border box, no multi-add "+". Single-media flow. */
          <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {selectedMedia[0].type === 'image' ? (
                <img src={selectedMedia[0].url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
              ) : (
                /* Brief V3 §4 — ALWAYS previews. Was muted+playsInline only: an unloaded
                   <video> has 0 intrinsic size → paints NOTHING (the "renders nothing"
                   case). autoPlay+loop+preload paints the frame immediately, letterboxed
                   (objectFit:contain) at any AR. */
                <video src={selectedMedia[0].url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} autoPlay muted loop playsInline preload="auto" />
              )}
              <button
                onClick={() => handleRemoveMedia(selectedMedia[0].id)}
                aria-label="Remove"
                className="tappable"
                style={{ position: 'absolute', top: 6, right: 6, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#E5E1DB', fontSize: 'var(--fs-20)', lineHeight: 1, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
              >×</button>
            </div>
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', marginTop: 12 }}>
              Videos up to 500MB · MP4 recommended
            </p>
            <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime,.mov" onChange={handleMediaSelect} className="hidden" />
          </div>
        )}
      </div>
    </div>
  );

  const renderEditStep = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={() => setStep('media')} className="text-[#E5E1DB] text-lg">←</button>
        <h2 style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-14)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>Edit & Post</h2>
        <button
          onClick={() => { setStep('deck'); loadDecksForStep(); }}
          disabled={isUploading}
          style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-13)', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'none', border: 'none', cursor: isUploading ? 'default' : 'pointer', color: isUploading ? '#666666' : '#E5E1DB' }}
        >
          Next
        </button>
      </div>

      <div className="flex-1 flex flex-col">
        {/* SCROLLABLE (fixes the dead caption input): with body{position:fixed;
            overflow:hidden;touch-action:none} (the iOS standalone lock), an input needs
            a SCROLLABLE ancestor or iOS can't focus it / raise the keyboard — the deck
            step works because ITS container is overflow-y-auto; this one wasn't. */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
          <div style={{ position: 'relative', width: '100%', marginBottom: 16, backgroundColor: '#000', flexShrink: 0 }}>
            {/* WYSIWYG preview — live gl-react render of geometry + ALL look params
                (matches FINISHING; no preview bake → no generational loss; works for
                video too). The single publish bake stays in handlePost. */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: getAspectRatio(chosenLayoutId || userLayoutId), background: '#000', overflow: 'hidden' }}>
              {selectedMedia[0] && (
                <FinishingPreview
                  mediaUrl={selectedMedia[0].url}
                  mediaType={selectedMedia[0].type}
                  params={editParams}
                  geometry={editGeometry ?? neutralGeometry(chipForLayout(chosenLayoutId || userLayoutId).id)}
                  layoutId={chosenLayoutId || userLayoutId}
                />
              )}
            </div>
            <button
              onClick={() => setStep('crop')}
              style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(229,225,219,0.25)', cursor: 'pointer', padding: '5px 9px' }}
            >
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-8)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ADJUST CROP</span>
            </button>
          </div>
          {/* Brief V3 §6 — the autoplay-clip window selector is REMOVED. Nothing consumes
              it since V2a dropped the client clip bake (Stream is the video store of record;
              graded HLS playback is this brief). Dead control gone. */}
          {/* CAPTION TARGET — the ENTIRE region below the media focuses the caption. The
              textarea GROWS to fill this zone (so most taps land in it directly), AND the
              zone's onClick → input.focus() so even taps in the dead space around it land
              in the caption. Only child <button>s opt out. "Add a caption" is the
              placeholder INSIDE the flow — no separate dead label. No precision required. */}
          <div
            onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) captionInputRef.current?.focus(); }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 160, cursor: 'text' }}
          >
            <textarea
              ref={captionInputRef}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption"
              className="w-full bg-transparent resize-none outline-none placeholder-[#5c5c5c]"
              /* fontSize MUST be ≥16px (iOS zoom floor). flex:1 → fills the writable zone
                 so the tap target spans the whole region below the media. Borderless. */
              style={{ flex: 1, minHeight: 120, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 16, lineHeight: 1.5, color: '#E5E1DB', caretColor: '#E5E1DB', backgroundColor: 'transparent', border: 'none', padding: '2px 0 0' }}
            />
          </div>
          {selectedMedia[0]?.type === 'video' && (
            <div style={{ flexShrink: 0 }}>
            <div style={{ marginTop: 12 }}>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
                CUSTOM THUMBNAIL (OPTIONAL)
              </p>
              {customThumbnail ? (
                <div style={{ position: 'relative', width: 80, height: 45 }}>
                  <img src={URL.createObjectURL(customThumbnail)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <button
                    onClick={() => setCustomThumbnail(null)}
                    style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: '#E5E1DB', border: 'none', cursor: 'pointer', color: 'var(--on-ink)', fontSize: 'var(--fs-10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >×</button>
                </div>
              ) : (
                <button
                  onClick={() => thumbnailInputRef.current?.click()}
                  style={{ background: 'transparent', border: '1px solid rgba(229,225,219,0.2)', padding: '6px 12px', cursor: 'pointer' }}
                >
                  <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase' }}>+ ADD THUMBNAIL</span>
                </button>
              )}
              <input ref={thumbnailInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCustomThumbnail(f); e.target.value = ''; }} style={{ display: 'none' }} />
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                AUTOPLAY
              </p>
              <button
                onClick={() => setVideoAutoplay(v => !v)}
                style={{ width: 36, height: 20, borderRadius: 0, background: videoAutoplay ? '#E5E1DB' : 'rgba(229,225,219,0.15)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease', padding: 0 }}
              >
                <div style={{ position: 'absolute', top: 2, left: videoAutoplay ? 18 : 2, width: 16, height: 16, borderRadius: 0, background: '#E5E1DB', transition: 'left 0.2s ease' }} />
              </button>
            </div>
            {/* Brief M10 §2 — MIRAGE PREVIEW WINDOW (optional). Reinstated selector: scrub a
                start point + fixed 4s window against the local video; graded audition thumb.
                Untouched → null → Mirage plays from 0. Metadata only — no clip is baked.
                Shown only when autoplay is on (a window with no autoplay has nowhere to play). */}
            {videoAutoplay && selectedMedia[0] && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>
                  MIRAGE PREVIEW
                </p>
                <SnippetSelector
                  videoUrl={selectedMedia[0].url}
                  heroFrameTime={editParams.heroFrameTime ?? 0}
                  params={editParams}
                  geometry={editGeometry ?? neutralGeometry(chipForLayout(chosenLayoutId || userLayoutId).id)}
                  layoutId={chosenLayoutId || userLayoutId}
                  onChange={setSnippetWindow}
                />
              </div>
            )}
            </div>
          )}
          {/* MUSIC (M2) — attach an approved library track. Applies to image + video;
              the bed/music_only layering choice shows only for videos. Never gates
              publish — it's just columns on the create insert. */}
          <div style={{ marginTop: 16, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>MUSIC</p>
              <button onClick={() => setShowMusicPicker(true)} style={{ background: 'transparent', border: '1px solid rgba(229,225,219,0.2)', padding: '6px 12px', cursor: 'pointer' }}>
                <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase' }}>{musicTrackId ? 'CHANGE' : '+ ADD MUSIC'}</span>
              </button>
            </div>
            {musicTrackId && (
              <>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 'var(--fs-8)', color: '#E5E1DB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {musicTrack?.title ?? 'Track attached'}{musicTrack?.composer_handle ? ` · @${musicTrack.composer_handle}` : ''}
                  </span>
                  <button onClick={() => { setMusicTrackId(null); setMusicTrack(null); setMusicMode(null); }} style={{ flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-8)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em', padding: 0 }}>REMOVE</button>
                </div>
                {selectedMedia[0]?.type === 'video' && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    {(['bed', 'music_only'] as const).map((m) => {
                      const on = musicMode === m;
                      return (
                        <button key={m} onClick={() => setMusicMode(m)} style={{ flex: 1, background: on ? '#E5E1DB' : 'transparent', border: `1px solid ${on ? '#E5E1DB' : 'rgba(229,225,219,0.2)'}`, cursor: 'pointer', padding: '8px 6px', fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-8)', color: on ? '#000' : 'rgba(229,225,219,0.7)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {m === 'bed' ? 'MUSIC AS BED' : 'MUSIC ONLY'}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* CLIP SELECTOR — image posts get a fixed 20s window; videos get a
                    window the length of the video. Drag to choose the section; the
                    video-longer-than-track case falls to the whole track (loops). */}
                {musicTrack?.file_url && (
                  <ClipSelector
                    fileUrl={musicTrack.file_url}
                    peaks={musicTrack.waveform_peaks}
                    trackDuration={musicTrack.duration_seconds ?? 0}
                    windowSeconds={selectedMedia[0]?.type === 'video' ? (videoDuration || (musicTrack.duration_seconds ?? 20)) : 20}
                    startSeconds={musicStart}
                    onChange={setMusicStart}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* The LAYOUT / "N media items selected" footer was removed — temporary-looking
            and the layout is already decided by here. Only a publish error surfaces. */}
        {postError && (
          <div className="p-4">
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-10)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {postError}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderDeckStep = () => {
    const MONO_S: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
          <button onClick={() => setStep('edit')} className="text-[#E5E1DB] text-lg">←</button>
          <span style={{ ...MONO_S, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Add to a deck?</span>
          <button
            onClick={() => handlePost(null)}
            disabled={isUploading}
            style={{ ...MONO_S, fontSize: 'var(--fs-11)', color: '#E5E1DB', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            Skip
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {decksLoading ? (
            <div className="flex items-center justify-center mt-8">
              <FrameLoader />
            </div>
          ) : (
            <>
              {userDecks.length === 0 && !showNewDeckForm && (
                <p style={{ ...MONO_S, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.35)', padding: '16px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    borderLeft: selectedDeckId === deck.id ? '2px solid #E5E1DB' : '2px solid transparent',
                    borderBottom: '1px solid rgba(229,225,219,0.05)',
                  }}
                >
                  <div style={{ width: 32, height: 32, background: '#1a1a1a', flexShrink: 0, overflow: 'hidden' }}>
                    {deck.cover_image_url && (
                      <img src={deck.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ ...MONO_S, fontSize: 'var(--fs-9)', color: '#E5E1DB', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{deck.title}</p>
                    <p style={{ ...MONO_S, fontSize: 'var(--fs-7)', color: 'rgba(229,225,219,0.4)', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {deck.item_count} frames
                    </p>
                  </div>
                  {selectedDeckId === deck.id && (
                    <span style={{ marginLeft: 'auto', ...MONO_S, fontSize: 'var(--fs-9)', color: '#E5E1DB' }}>✓</span>
                  )}
                </button>
              ))}

              {!showNewDeckForm ? (
                <button
                  onClick={() => setShowNewDeckForm(true)}
                  style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 16px', textAlign: 'left' }}
                >
                  <span style={{ ...MONO_S, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>+ Create new deck</span>
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
                      border: 'none', borderBottom: '1px solid rgba(229,225,219,0.2)',
                      outline: 'none', ...MONO_S, fontSize: 'max(16px, var(--fs-10))', color: '#E5E1DB',
                      padding: '4px 0', marginBottom: 12, boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 16 }}>
                    <button
                      onClick={handleCreateDeckAndSelect}
                      disabled={!newDeckTitle.trim() || creatingDeck}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', ...MONO_S, fontSize: 'var(--fs-9)', color: newDeckTitle.trim() ? '#E5E1DB' : 'rgba(229,225,219,0.3)', padding: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    >
                      {creatingDeck ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      onClick={() => { setShowNewDeckForm(false); setNewDeckTitle(''); }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', ...MONO_S, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.4)', padding: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}
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
            <p style={{ ...MONO_S, fontSize: 'var(--fs-10)', color: 'var(--danger)', marginBottom: 10 }}>{postError}</p>
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
              <span style={{ ...MONO_S, fontSize: 'var(--fs-11)', color: isUploading ? 'rgba(229,225,219,0.4)' : '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isPosting ? 'POSTING...' : 'Skip'}
              </span>
            </button>
            <button
              onClick={() => handlePost(selectedDeckId)}
              disabled={isUploading || !selectedDeckId}
              style={{
                flex: 1, background: 'transparent', cursor: isUploading || !selectedDeckId ? 'default' : 'pointer',
                border: selectedDeckId ? '1px solid white' : '1px solid rgba(229,225,219,0.25)',
                padding: '8px',
              }}
            >
              <span style={{ ...MONO_S, fontSize: 'var(--fs-11)', color: isUploading || !selectedDeckId ? 'rgba(229,225,219,0.4)' : '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isUploading ? 'Posting…' : 'Add to deck'}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  // Backdrop-tap dismiss (the standard sheet pattern — CollectSheet / DecksSheet).
  // If there's partial input, route through the SAME discard guard the OS back-swipe
  // uses so nothing is silently lost; a clean media step closes straight away.
  const hasPartialInput = selectedMedia.length > 0 || step !== 'media';
  const handleBackdropDismiss = () => {
    if (hasPartialInput) setDiscardConfirm(true);
    else onClose();
  };

  return (
    <>
      <div onClick={handleBackdropDismiss} style={{ position: 'fixed', inset: 0, backgroundColor: '#000000', opacity: 1, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div onClick={(e) => e.stopPropagation()} className="bg-black w-[375px] h-[600px] relative overflow-hidden">
          {step === 'media' && renderMediaStep()}
          {step === 'edit' && renderEditStep()}
          {step === 'deck' && renderDeckStep()}
          {step === 'posting' && renderPostingStep()}
        </div>
      </div>
      {/* Discard-edits confirm — intercepts the OS back/edge-swipe so progress is
          never silently lost (see the history guard above). */}
      {discardConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>
          <div style={{ width: '100%', maxWidth: 340, background: '#0a0a0a', border: '1px solid rgba(229,225,219,0.14)', padding: '26px 24px' }}>
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 15, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 10px' }}>DISCARD THIS POST?</p>
            <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 13, color: 'rgba(229,225,219,0.55)', lineHeight: 1.5, margin: '0 0 22px' }}>Your edits will be lost.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDiscardConfirm(false)} style={{ flex: 1, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 12, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: '1px solid rgba(229,225,219,0.3)', cursor: 'pointer', padding: '12px 0' }}>KEEP EDITING</button>
              <button onClick={() => { setDiscardConfirm(false); onClose(); setStep('media'); }} style={{ flex: 1, fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 12, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: '1px solid rgba(229,225,219,0.4)', cursor: 'pointer', padding: '12px 0' }}>DISCARD</button>
            </div>
          </div>
        </div>
      )}
      {step === 'crop' && selectedMedia[0] && (
        <CropTool
          mediaUrl={selectedMedia[0].url}
          mediaType={selectedMedia[0].type}
          allowArChoice={userLayoutId === 'collage'}
          initialAr={chipForLayout(userLayoutId).id}
          onCancel={() => setStep('media')}
          onConfirm={(geom, layoutId) => {
            setEditGeometry(geom);
            setChosenLayoutId(layoutId);
            setStep('finishing');
          }}
        />
      )}
      {step === 'finishing' && selectedMedia[0] && (() => {
        // Fallbacks so the editor ALWAYS renders even if finishCtx hasn't resolved
        // yet (it updates once the profile loads); never blank-on-null.
        const fallbackLayout = LEGACY_TO_CANONICAL[userLayoutId] ?? userLayoutId;
        const layoutId = finishCtx?.layoutId ?? fallbackLayout;
        const gridLayout = finishCtx?.gridLayout ?? (userLayoutId === 'collage' ? 'collage' : 'standard');
        // zIndex 200 lifts the editor above the create modal's opaque z-100 backdrop
        // (same reason CropTool uses 200). Without it the modal covers it → black.
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
            <FinishingStep
              mediaUrl={selectedMedia[0].url}
              mediaType={selectedMedia[0].type}
              geometry={editGeometry ?? neutralGeometry(chipForLayout(layoutId).id)}
              onGeometryChange={setEditGeometry}
              gridLayout={gridLayout}
              layoutId={layoutId}
              isPro={finishCtx?.isPro ?? false}
              params={editParams}
              onParamsChange={setEditParams}
              onDone={() => setStep('edit')}
              onBack={() => setStep('crop')}
              savedLooks={savedLooks}
              onSaveLook={handleSaveLook}
            />
          </div>
        );
      })()}
      <MintPromptSheet
        visible={showMintPrompt}
        onMint={handleDoMint}
        onSkip={handleSkipMint}
        onCoinSkipped={handleCoinSkipped}
        ticker={ticker}
        onTickerChange={(v) => setTicker(normalizeTicker(v))}
        selfBuyUsd={selfBuyUsd}
        onSelfBuyChange={setSelfBuyUsd}
        sequencePhase={mintStatus}
        sequenceLine={backingNarration}
        backingFundsLine={backingFundsLine}
        ceremonySub={ceremonySub}
        codified={codified}
        mediaUrl={pendingMintData?.image ?? null}
        mediaAr={getAspectRatio(pendingMintData?.layoutId ?? '')}
        onRetry={mintStatus === 'backing-failed' ? retryBacking : handleDoMint}
        onContinue={completeFlow}
      />
      {showMusicPicker && (
        <MusicPicker
          currentTrackId={musicTrackId}
          onClose={() => setShowMusicPicker(false)}
          onSelect={(t) => {
            setMusicTrackId(t.id);
            setMusicTrack(t);
            setMusicStart(0); // clip window defaults to the track start
            // Video → default the layering to 'bed' (keep an existing choice on swap);
            // image/no-original-audio → mode stays null (nothing to layer against).
            setMusicMode(selectedMedia[0]?.type === 'video' ? (musicMode ?? 'bed') : null);
            setShowMusicPicker(false);
          }}
        />
      )}
      {isPosting && !showMintPrompt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 600,
          backgroundColor: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeInBlack 0.2s ease forwards',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            {/* Brief V2c — the big smooth counter (video upload). Haas 75 Bold 56px; the %
                sits ~0.5em and slightly raised (top-aligned + a hair of top margin). Only
                shows once there's real upload progress; images fall back to POSTING…. */}
            {uploadPct > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 56, lineHeight: 1, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)' }}>
                {displayPct}
                <span style={{ fontSize: '0.5em', marginTop: '0.14em', marginLeft: '0.04em' }}>%</span>
              </div>
            ) : (
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-12)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>
                POSTING...
              </p>
            )}
            {/* Brief V2a — the live stage, smaller, below the number. If POSTING freezes,
                this line names the stalled stage on Eric's device without an inspector. */}
            {postStage && (
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
                {postStage}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
