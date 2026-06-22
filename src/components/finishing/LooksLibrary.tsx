"use client";

/**
 * LooksLibrary — the LOOKS tier: the built-in .cube look library by bucket, each
 * a LIVE AUDITION thumbnail (the user's own image + that look). ALL Pro
 * (browse-but-locked → tapping fires the UpsellSheet). Intensity slider for the
 * active look. (User-SAVED looks live in the PALETTE tier, not here.)
 *
 * Performance: ONE small downscaled snapshot of the source, then CPU-apply each
 * look's LUT to it (cheap). No per-tile pipelines / no per-tile video pipelines.
 * (v1: snapshot = source frame; live-corrections-in-thumbnails is a follow-up —
 * the main preview always shows corrected+looked.)
 */

import { useEffect, useRef, useState } from 'react';
import ToolSlider from './ToolSlider';
import { LOOKS, LOOK_BUCKETS, looksByBucket, type LookDef } from './looksCatalog';
import { ensureLut, applyLutToImageData } from '@/lib/editor/lut';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';
const THUMB = 60;

type Source = HTMLImageElement | HTMLVideoElement | null;

interface LooksLibraryProps {
  source: Source;
  isPro: boolean;
  onUpsell: () => void;
  activeLookId: string | null;
  intensity: number;                 // params.lutIntensity (stop 0..12)
  onApply: (lookId: string) => void;
  onClear: () => void;
  onIntensity: (stop: number) => void;
}

function snapshotSource(source: Source, size: number): ImageData | null {
  if (!source) return null;
  const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
  const sw = isVideo ? (source as HTMLVideoElement).videoWidth : (source as HTMLImageElement).naturalWidth;
  const sh = isVideo ? (source as HTMLVideoElement).videoHeight : (source as HTMLImageElement).naturalHeight;
  if (!sw || !sh) return null;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const scale = Math.max(size / sw, size / sh);
  const dw = sw * scale, dh = sh * scale;
  ctx.drawImage(source as CanvasImageSource, (size - dw) / 2, (size - dh) / 2, dw, dh);
  try { return ctx.getImageData(0, 0, size, size); } catch { return null; }
}

function imageDataToUrl(img: ImageData): string {
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  cv.getContext('2d')!.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

export default function LooksLibrary({
  source, isPro, onUpsell, activeLookId, intensity, onApply, onClear, onIntensity,
}: LooksLibraryProps) {
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const snapRef = useRef<ImageData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const snap = snapshotSource(source, THUMB);
    snapRef.current = snap;
    if (!snap) { setSnapUrl(null); setThumbs({}); return; }
    setSnapUrl(imageDataToUrl(snap));
    setThumbs({});
    (async () => {
      for (const look of LOOKS) {
        if (cancelled) return;
        try {
          const entry = await ensureLut(look.id, look.file);
          if (cancelled) return;
          const url = imageDataToUrl(applyLutToImageData(entry.parsed, snap));
          setThumbs((t) => ({ ...t, [look.id]: url }));
        } catch { /* skip a look that fails to load */ }
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  const tapLook = (look: LookDef) => {
    if (!isPro) { onUpsell(); return; }                  // browse-but-locked
    if (look.id === activeLookId) { onClear(); return; } // tap selected → clear
    onApply(look.id);
  };

  return (
    <div style={{ maxHeight: 230, overflowY: 'auto', padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {activeLookId && (
        <ToolSlider type="add" value={intensity} onChange={onIntensity} label="INTENSITY" />
      )}
      {LOOK_BUCKETS.map((bucket, bi) => {
        const looks = looksByBucket(bucket);
        if (looks.length === 0) return null;
        return (
          <div key={bucket}>
            <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{bucket}</span>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 8 }}>
              {bi === 0 && (
                <LookTile name="ORIGINAL" url={snapUrl} selected={!activeLookId} locked={false} onTap={onClear} />
              )}
              {looks.map((look) => (
                <LookTile
                  key={look.id}
                  name={look.name}
                  url={thumbs[look.id] ?? snapUrl}
                  selected={look.id === activeLookId}
                  locked={!isPro}
                  onTap={() => tapLook(look)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LookTile({ name, url, selected, locked, onTap }: { name: string; url: string | null; selected: boolean; locked: boolean; onTap: () => void }) {
  return (
    <button onClick={onTap} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
      <div style={{ position: 'relative', width: 60, height: 60, overflow: 'hidden', border: `1px solid ${selected ? RED : 'rgba(255,255,255,0.18)'}`, background: '#111' }}>
        {url && <img src={url} alt={name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        {locked && (
          <span style={{ position: 'absolute', top: 3, right: 3, lineHeight: 0 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </span>
        )}
      </div>
      <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: selected ? RED : 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </button>
  );
}
