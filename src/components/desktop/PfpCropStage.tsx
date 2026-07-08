'use client';
// ── PFP CROP STAGE — drag/zoom framing before upload ─────────────────────────
// Centered modal (fits the master-detail cleaner than in-panel — the form
// stays intact behind it). SQUARE crop area with a CIRCLE overlay guide: PFPs
// render square-ish on the desktop profile and circular in comments/avatars —
// the square is what's stored, the circle guide protects both presentations.
//
// PORTABLE BY CONSTRUCTION (the mobile follow-up just mounts it): pointer
// events only (no mouse/hover assumptions), wheel AND slider zoom, WebP→JPEG
// export fallback (Safari), createImageBitmap resize caps (the hero-bake OOM
// discipline). Upload path: the EXISTING uploadImage — INSERT-only unique
// filenames (upsert:false), so the hero's missing-UPDATE-policy class can't
// occur, and every upload gets a fresh URL (cache-bust inherent).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const CROP = 320;        // on-screen crop viewport (square)
const OUT = 512;         // baked output (512×512)
const MAX_BYTES = 10 * 1024 * 1024;
// HEIC excluded: Chrome/Firefox can't decode HEIC in createImageBitmap —
// desktop support is Safari-only (flaky cross-browser; reported).
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export default function PfpCropStage({
  file, onApply, onCancel,
}: {
  file: File;
  /** Receives the baked square blob (512×512, webp or jpeg). */
  onApply: (blob: Blob) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [img, setImg] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (file.size > MAX_BYTES) { setError('IMAGE TOO LARGE — 10MB MAX'); return; }
      if (!MIMES.includes(file.type)) { setError(`UNSUPPORTED TYPE — USE JPEG / PNG / WEBP`); return; }
      try {
        let bmp: ImageBitmap;
        try { bmp = await createImageBitmap(file, { resizeWidth: 2048, resizeQuality: 'high' } as ImageBitmapOptions); }
        catch { bmp = await createImageBitmap(file); }
        if (!dead) setImg(bmp);
      } catch { if (!dead) setError('COULDN’T READ THAT IMAGE'); }
    })();
    return () => { dead = true; };
  }, [file]);

  // COVER base scale: at zoom 1 the image exactly covers the crop square.
  const base = img ? Math.max(CROP / img.width, CROP / img.height) : 1;
  const dispW = img ? img.width * base * zoom : 0;
  const dispH = img ? img.height * base * zoom : 0;
  // Rubber-band clamp — the crop area can never be uncovered.
  const clampPan = (p: { x: number; y: number }) => ({
    x: Math.max(-(dispW - CROP) / 2, Math.min((dispW - CROP) / 2, p.x)),
    y: Math.max(-(dispH - CROP) / 2, Math.min((dispH - CROP) / 2, p.y)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPan(clampPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) }));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    const next = Math.max(1, Math.min(3, zoom - e.deltaY * 0.0015));
    setZoom(next);
    setPan((p) => clampPan(p));
  };
  useEffect(() => { setPan((p) => clampPan(p)); /* re-clamp when zoom shrinks */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, img]);

  const apply = async () => {
    if (!img || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUT; canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      // source rect: the crop viewport mapped back into image pixels
      const scale = base * zoom;
      const sw = CROP / scale, sh = CROP / scale;
      const sx = img.width / 2 - pan.x / scale - sw / 2;
      const sy = img.height / 2 - pan.y / scale - sh / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT, OUT);
      let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.86));
      if (!blob || blob.type !== 'image/webp') {
        blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88)) ?? blob;
      }
      if (!blob) throw new Error('export failed');
      await onApply(blob);
    } catch (e) {
      console.error('[pfp-crop] apply failed:', e);
      setError('CROP FAILED — TRY AGAIN');
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 640 }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: '#080808', border: '1px solid rgba(255,255,255,0.14)', padding: 22 }}>
        <p style={{ ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 14px' }}>FRAME YOUR PHOTO</p>

        {error ? (
          <div style={{ width: CROP, padding: '40px 0', textAlign: 'center' }}>
            <p style={{ ...SKR, fontSize: 11, color: '#f20d0d', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{error}</p>
          </div>
        ) : (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            style={{ position: 'relative', width: CROP, height: CROP, overflow: 'hidden', background: '#000', cursor: 'grab', touchAction: 'none' }}
          >
            {img && (
              <canvas
                width={0} height={0}
                ref={(el) => {
                  if (!el || !img) return;
                  el.width = dispW; el.height = dispH;
                  const c = el.getContext('2d');
                  if (c) c.drawImage(img, 0, 0, dispW, dispH);
                }}
                style={{ position: 'absolute', left: `calc(50% + ${pan.x}px)`, top: `calc(50% + ${pan.y}px)`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}
              />
            )}
            {/* circle guide over the square crop — protects both presentations */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.25)` }} />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: '50%', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
          </div>
        )}

        {/* zoom slider (wheel also works) */}
        {!error && (
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ width: '100%', margin: '14px 0 0', accentColor: '#f20d0d' }}
            aria-label="Zoom"
          />
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onCancel} style={{ ...SKB, flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', padding: '11px 0' }}>
            CANCEL
          </button>
          <button onClick={apply} disabled={!!error || !img || busy} style={{ ...SKB, flex: 1, fontSize: 11, color: '#000', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#FFF', border: 'none', cursor: error || !img ? 'default' : 'pointer', padding: '11px 0', opacity: error || !img ? 0.4 : 1 }}>
            {busy ? 'APPLYING…' : 'APPLY'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
