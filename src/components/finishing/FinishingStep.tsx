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

import { useEffect, useState, useRef } from 'react';
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
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const retriedRef = useRef(false);
  useEffect(() => { retriedRef.current = false; setLoadError(false); }, [mediaUrl]); // reset per media

  useEffect(() => {
    let cancelled = false;
    console.log('[postflow] source decode:', mediaType, mediaUrl, 'attempt', retryKey);
    // A genuine failure (or the cold-start blank) auto-retries ONCE, then surfaces
    // the honest retry state — a first-time user must never see silent nothing.
    const fail = (why: string) => {
      if (cancelled) return;
      console.warn('[postflow] source failed:', why);
      if (!retriedRef.current) { retriedRef.current = true; setRetryKey((k) => k + 1); }
      else setLoadError(true);
    };
    if (mediaType === 'video') {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true; v.loop = true; v.playsInline = true;
      v.onloadeddata = () => { if (!cancelled) { v.play().catch(() => {}); setSource(v); } };
      v.onerror = () => fail('video error');
      v.src = mediaUrl;
      return () => { cancelled = true; v.pause(); v.src = ''; };
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const use = () => { if (!cancelled && img.naturalWidth > 0) { console.log('[postflow] preview src ready', img.naturalWidth, 'x', img.naturalHeight); setSource(img); } };
    img.onerror = () => fail('img error');
    img.src = mediaUrl;
    // THE FIX: decode() rejects on iOS cold-start; the OLD code set img.onload in
    // the catch, but if the image was already `complete` by then, that late onload
    // NEVER fires → source stays null → blank preview (first session only; a
    // restart warms the cache so decode resolves). Now: if already loaded, use it
    // directly; else wait for onload; a real error routes through fail().
    img.decode()
      .then(use)
      .catch(() => {
        if (img.complete && img.naturalWidth > 0) use();
        else img.onload = use;
      });
    return () => { cancelled = true; };
  }, [mediaUrl, mediaType, retryKey]);

  // SAFETY watchdog: never leave a first-time user on a silent blank — if the
  // source hasn't resolved (and hasn't errored) within 6s, surface the retry.
  useEffect(() => {
    if (source || loadError) return;
    const t = window.setTimeout(() => { if (!retriedRef.current) { retriedRef.current = true; setRetryKey((k) => k + 1); } else setLoadError(true); }, 6000);
    return () => window.clearTimeout(t);
  }, [source, loadError, retryKey]);

  if (loadError) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '0 40px' }}>
        <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 14, color: 'rgba(229,225,219,0.7)', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>Something went wrong loading your photo.</p>
        <button onClick={() => { setSource(null); setLoadError(false); retriedRef.current = false; setRetryKey((k) => k + 1); }} style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 12, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: '1px solid rgba(229,225,219,0.5)', cursor: 'pointer', padding: '13px 26px' }}>RETAP TO CONTINUE</button>
      </div>
    );
  }

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
