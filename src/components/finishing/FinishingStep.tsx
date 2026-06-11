"use client";

/**
 * FinishingStep — mounts FINISHING inside the real creation flow (Brief 8B).
 *
 * The creation flow holds a local object URL + File (not yet uploaded). The
 * editor's preview pipeline needs a decoded element, so this wrapper decodes the
 * media URL into an HTMLImageElement (or a playing HTMLVideoElement) and hands it
 * to FinishingShell. Look params + geometry are owned by the caller; this only
 * adapts the source. Mirrors the dev harness decode, minus the dev toggles.
 */

import { useEffect, useState } from 'react';
import FinishingShell from './FinishingShell';
import type { EditParams } from '@/lib/editor/params';
import type { EditGeometry } from '@/lib/editGeometry';
import type { SavedLook } from '@/lib/looksService';

interface FinishingStepProps {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  geometry: EditGeometry;
  onGeometryChange: (g: EditGeometry) => void;
  gridLayout: 'standard' | 'collage';
  layoutId: string;
  isPro: boolean;
  params: EditParams;
  onParamsChange: (p: EditParams) => void;
  onDone: () => void;
  onBack: () => void;
  savedLooks?: SavedLook[];
  onSaveLook?: (name: string, params: EditParams) => void;
}

export default function FinishingStep({
  mediaUrl, mediaType, geometry, onGeometryChange, gridLayout, layoutId, isPro,
  params, onParamsChange, onDone, onBack, savedLooks, onSaveLook,
}: FinishingStepProps) {
  const [source, setSource] = useState<HTMLImageElement | HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    console.log('[FinishingStep] mount — decoding source:', mediaType, mediaUrl);
    if (mediaType === 'video') {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      // AUTO-PLAY on entry (muted, as the platform requires for autoplay). The
      // user pauses to scrub to a hero frame and grade from the still, then can
      // play again to preview the grade in motion. The freeze fix lives in the
      // Pipeline (redraw loop runs ONLY while playing — paused grading is light).
      v.muted = true; v.loop = true; v.playsInline = true;
      v.onloadeddata = () => { if (!cancelled) { console.log('[FinishingStep] video loaded (auto-playing)'); v.play().catch(() => {}); setSource(v); } };
      v.src = mediaUrl;
      return () => { cancelled = true; v.pause(); v.src = ''; };
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = mediaUrl;
    img.decode()
      .then(() => { if (!cancelled) { console.log('[FinishingStep] image decoded', img.naturalWidth, 'x', img.naturalHeight); setSource(img); } })
      .catch(() => { img.onload = () => { if (!cancelled) { console.log('[FinishingStep] image onload (decode fallback)'); setSource(img); } }; });
    return () => { cancelled = true; };
  }, [mediaUrl, mediaType]);

  return (
    <FinishingShell
      source={source}
      params={params}
      onParamsChange={onParamsChange}
      onDone={onDone}
      onBack={onBack}
      geometry={geometry}
      onGeometryChange={onGeometryChange}
      gridLayout={gridLayout}
      layoutId={layoutId}
      mediaUrl={mediaUrl}
      mediaType={mediaType}
      isPro={isPro}
      savedLooks={savedLooks}
      onSaveLook={onSaveLook}
    />
  );
}
