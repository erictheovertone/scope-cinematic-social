"use client";

/**
 * FinishingPreview — a READ-ONLY live render of an edit (Brief: EDIT&POST preview).
 *
 * Renders the SAME gl-react pipeline FINISHING uses — geometry framing + the full
 * EditParams (exposure/curves/grain/LUT/…) — so the EDIT&POST step shows exactly
 * what the editor showed (and, after the single publish bake, what's published).
 * NO baking here: it's a live render (zero generational JPEG loss), and it works
 * for video too (the publish bake stays a single op at publish, from the original).
 *
 * Mirrors FinishingShell's stage math, minus all editing chrome. Decode-then-mount
 * gated so it never flashes black while the source decodes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { EditParams } from '@/lib/editor/params';
import { rotateCoverScale, type EditGeometry } from '@/lib/editGeometry';
import { AR_CHIPS, chipForLayout } from '@/lib/aspectRatio';
import { lookById } from './looksCatalog';
import { ensureLut } from '@/lib/editor/lut';

const Pipeline = dynamic(() => import('./Pipeline'), { ssr: false });

type Source = HTMLImageElement | HTMLVideoElement;

function sourceAspect(s: Source): number {
  if (typeof HTMLVideoElement !== 'undefined' && s instanceof HTMLVideoElement) {
    return s.videoWidth && s.videoHeight ? s.videoWidth / s.videoHeight : 16 / 9;
  }
  const img = s as HTMLImageElement;
  return img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 16 / 9;
}
function maxArCrop(orientedAr: number, ratio: number) {
  let w = 1, h = orientedAr / ratio;
  if (h > 1) { h = 1; w = ratio / orientedAr; }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
const isFullFrame = (c: { x: number; y: number; w: number; h: number }) =>
  c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1;

interface FinishingPreviewProps {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  params: EditParams;
  geometry: EditGeometry;
  layoutId: string;
  /** Optional — loop only this [start, start+length] window (the audition snippet's
   *  selected autoplay moment). Omitted (editor preview) → full-video loop, unchanged. */
  clipWindow?: { start: number; length: number };
}

export default function FinishingPreview({ mediaUrl, mediaType, params, geometry, layoutId, clipWindow }: FinishingPreviewProps) {
  const [source, setSource] = useState<Source | null>(null);
  const [activeLut, setActiveLut] = useState<{ canvas: HTMLCanvasElement; size: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Decode source (image) or load video — gate the pipeline mount on it (no black).
  useEffect(() => {
    let cancelled = false;
    if (mediaType === 'video') {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true; v.loop = true; v.playsInline = true;
      v.onloadeddata = () => { if (!cancelled) { v.play().catch(() => {}); setSource(v); } };
      v.src = mediaUrl;
      return () => { cancelled = true; v.pause(); v.src = ''; };
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const use = () => { if (!cancelled && img.naturalWidth > 0) setSource(img); };
    img.src = mediaUrl;
    // Same cold-start race fix as FinishingStep: if decode() rejects but the image
    // already loaded, a late img.onload never fires → use it directly instead.
    img.decode()
      .then(use)
      .catch(() => { if (img.complete && img.naturalWidth > 0) use(); else img.onload = use; });
    return () => { cancelled = true; };
  }, [mediaUrl, mediaType]);

  // Optional clip-window loop — keep the graded video pinned to the selected
  // [start, start+length] moment (the audition snippet). No-op without clipWindow.
  useEffect(() => {
    if (mediaType !== 'video' || !clipWindow) return;
    const v = source;
    if (!(typeof HTMLVideoElement !== 'undefined' && v instanceof HTMLVideoElement)) return;
    const { start, length } = clipWindow;
    v.loop = false; // our window controls looping, not the native end-loop
    const toStart = () => { try { v.currentTime = start; } catch { /* seek before metadata */ } };
    if (v.currentTime < start - 0.05 || v.currentTime >= start + length) toStart();
    v.play().catch(() => {});
    const onTime = () => { if (v.currentTime >= start + length - 0.03) { toStart(); v.play().catch(() => {}); } };
    const onEnded = () => { toStart(); v.play().catch(() => {}); };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', onEnded);
    return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('ended', onEnded); };
  }, [source, mediaType, clipWindow?.start, clipWindow?.length]);

  // Load the active LOOK LUT so the preview shows the look too.
  useEffect(() => {
    let cancelled = false;
    const look = lookById(params.lutId);
    if (!look) { setActiveLut(null); return; }
    ensureLut(look.id, look.file)
      .then((e) => { if (!cancelled) setActiveLut({ canvas: e.canvas, size: e.parsed.size }); })
      .catch(() => { if (!cancelled) setActiveLut(null); });
    return () => { cancelled = true; };
  }, [params.lutId]);

  // Measure the preview box (the AR-shaped container around us).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Same framing as FinishingShell.geomPreview: fit the crop window to the box,
  // scale the full image so its crop window fills it, offset to the crop origin.
  const geom = useMemo(() => {
    if (!source || box.w <= 0 || box.h <= 0) return null;
    const baseAr = sourceAspect(source);
    const rot = ((geometry.rotate % 360) + 360) % 360;
    const orientedAr = rot === 90 || rot === 270 ? (baseAr ? 1 / baseAr : 0) : baseAr;
    if (!orientedAr) return null;
    const chip = AR_CHIPS.find((c) => c.id === geometry.ar) ?? chipForLayout(layoutId);
    const crop = isFullFrame(geometry.crop) ? maxArCrop(orientedAr, chip.ratio) : geometry.crop;

    let fw = box.w, fh = box.w / chip.ratio;
    if (fh > box.h) { fh = box.h; fw = box.h * chip.ratio; }

    const cw = Math.max(crop.w, 0.0001);
    const ch = Math.max(crop.h, 0.0001);
    const sw = fw / cw;
    const sh = fh / ch;
    const cover = geometry.straighten !== 0 ? rotateCoverScale(geometry.straighten, crop.w, crop.h) : 1;
    const spin = rot + geometry.straighten;
    return {
      fw: Math.round(fw), fh: Math.round(fh), sw: Math.round(sw), sh: Math.round(sh),
      left: -crop.x * sw, top: -crop.y * sh, spin, cover,
      originX: (crop.x + crop.w / 2) * 100, originY: (crop.y + crop.h / 2) * 100,
    };
  }, [source, box, geometry, layoutId]);

  return (
    <div ref={boxRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      {source && geom && (
        <div style={{ position: 'relative', width: geom.fw, height: geom.fh, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', left: geom.left, top: geom.top, width: geom.sw, height: geom.sh,
            transform: geom.spin !== 0 || geom.cover !== 1 ? `rotate(${geom.spin}deg) scale(${geom.cover})` : undefined,
            transformOrigin: `${geom.originX}% ${geom.originY}%`,
          }}>
            <Pipeline source={source} params={params} width={geom.sw} height={geom.sh} activeLut={activeLut} />
          </div>
        </div>
      )}
    </div>
  );
}
