'use client';

// ── PfpCropModal — IG-style square avatar crop that BAKES the crop on confirm ──
//
// Fixed 1:1 frame; the source image pans (drag) + zooms (pinch / wheel) BEHIND it,
// clamped so the square is always fully covered (no gaps). Confirm renders the
// visible square to a 512×512 canvas via createImageBitmap (capped decode → crop,
// OOM-safe on large phone photos) and returns a small JPEG Blob for upload. The
// baked image is square, so every avatar site just shows it in its circle — no
// per-site crop logic, no DB column. Separate from the POST crop pipeline.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FRAME = 300;          // display frame (px)
const OUT = 512;            // baked output (px) — retina-safe for the largest avatar
const DECODE_CAP = 1600;    // OOM-safe decode cap for the source
const MAX_ZOOM = 5;         // × cover

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

async function bakeSquare(file: File, natW: number, sx: number, sy: number, sSize: number): Promise<Blob> {
  // OOM-safe: decode the source at a capped width first (the pattern from the post bake),
  // then crop+resize the region to OUT×OUT in one GPU step.
  const decoded = natW > DECODE_CAP
    ? await createImageBitmap(file, { resizeWidth: DECODE_CAP })
    : await createImageBitmap(file);
  const k = decoded.width / natW;   // natural → decoded coords
  const cropped = await createImageBitmap(
    decoded,
    Math.max(0, Math.round(sx * k)), Math.max(0, Math.round(sy * k)),
    Math.max(1, Math.round(sSize * k)), Math.max(1, Math.round(sSize * k)),
    { resizeWidth: OUT, resizeHeight: OUT, resizeQuality: 'high' },
  );
  decoded.close();
  const canvas = document.createElement('canvas');
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d ctx');
  ctx.drawImage(cropped, 0, 0);
  cropped.close?.();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85),
  );
}

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

export default function PfpCropModal({ file, onCancel, onConfirm }: Props) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [baking, setBaking] = useState(false);

  const scaleRef = useRef(scale); scaleRef.current = scale;
  const offsetRef = useRef(offset); offsetRef.current = offset;
  const natRef = useRef(nat); natRef.current = nat;
  const minRef = useRef(minScale); minRef.current = minScale;

  // Load the source dimensions IMPERATIVELY — a JSX onLoad can miss the event for a
  // blob: URL that decodes before React binds the handler, leaving the image invisible.
  // Fit-to-COVER: the smaller dimension fills the frame (larger overflows → cropped).
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return;
      const cover = FRAME / Math.min(w, h);
      setNat({ w, h });
      setMinScale(cover);
      setScale(cover);
      setOffset({ x: (FRAME - w * cover) / 2, y: (FRAME - h * cover) / 2 }); // centred
    };
    img.src = url;
    // NOTE: do NOT revoke on cleanup — StrictMode's mount→cleanup→mount would revoke the
    // blob the visible <img src={url}> still needs, leaving it blank. Revoked on confirm/cancel.
  }, [url]);

  const clampOffset = (x: number, y: number, s: number) => {
    const n = natRef.current; if (!n) return { x, y };
    const w = n.w * s, h = n.h * s;
    return { x: Math.min(0, Math.max(FRAME - w, x)), y: Math.min(0, Math.max(FRAME - h, y)) };
  };
  const clampScale = (s: number) => Math.max(minRef.current, Math.min(minRef.current * MAX_ZOOM, s));

  const zoomTo = (next: number, cx = FRAME / 2, cy = FRAME / 2) => {
    const s = scaleRef.current, s2 = clampScale(next);
    const o = offsetRef.current;
    const ix = (cx - o.x) / s, iy = (cy - o.y) / s;           // image point under the anchor
    const c = clampOffset(cx - ix * s2, cy - iy * s2, s2);
    setScale(s2); setOffset(c);
  };

  // ── Gestures (touch drag + pinch; mouse drag + wheel) ──
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  const twoFingerDist = (t: React.TouchList) => {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinch.current = { dist: twoFingerDist(e.touches), cx: FRAME / 2, cy: FRAME / 2 };
      drag.current = null;
    } else if (e.touches.length === 1) {
      drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      pinch.current = null;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinch.current) {
      const d = twoFingerDist(e.touches);
      zoomTo(scaleRef.current * (d / pinch.current.dist), pinch.current.cx, pinch.current.cy);
      pinch.current.dist = d;
    } else if (e.touches.length === 1 && drag.current) {
      const t = e.touches[0];
      const c = clampOffset(offsetRef.current.x + (t.clientX - drag.current.x), offsetRef.current.y + (t.clientY - drag.current.y), scaleRef.current);
      setOffset(c);
      drag.current = { x: t.clientX, y: t.clientY };
    }
  };
  const onTouchEnd = () => { drag.current = null; pinch.current = null; };

  const onMouseDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const c = clampOffset(offsetRef.current.x + (e.clientX - drag.current.x), offsetRef.current.y + (e.clientY - drag.current.y), scaleRef.current);
    setOffset(c);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => { zoomTo(scaleRef.current * (e.deltaY < 0 ? 1.08 : 0.92)); };

  const confirm = async () => {
    if (!nat || baking) return;
    setBaking(true);
    try {
      const s = scale;
      const sx = -offset.x / s, sy = -offset.y / s, sSize = FRAME / s; // visible square, natural px
      const blob = await bakeSquare(file, nat.w, sx, sy, sSize);
      URL.revokeObjectURL(url);   // done with the display source
      onConfirm(blob);
    } catch (err) {
      console.error('[PfpCropModal] bake failed:', err);
      onCancel();
    } finally {
      setBaking(false);
    }
  };

  const cancel = () => { URL.revokeObjectURL(url); onCancel(); };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-swipe-exclude
      style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.94)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 20px calc(env(safe-area-inset-bottom,0px) + 20px)' }}
    >
      <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 18px' }}>DRAG & PINCH TO FRAME</p>

      {/* Square crop frame — image pans/zooms behind, clipped to the square. */}
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onWheel={onWheel}
        style={{ position: 'relative', width: FRAME, height: FRAME, overflow: 'hidden', touchAction: 'none', cursor: 'grab', background: '#000', border: '1px solid rgba(255,255,255,0.25)' }}
      >
        {nat && (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{ position: 'absolute', left: offset.x, top: offset.y, width: nat.w * scale, height: nat.h * scale, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none', display: 'block' }}
          />
        )}
        {/* circular guide so the user frames for the round avatar */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)', pointerEvents: 'none' }} />
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 22, width: FRAME }}>
        <button onClick={cancel} disabled={baking} style={{ ...SKB, flex: 1, fontSize: 'var(--fs-11)', color: '#fff', background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', padding: '12px 0', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}>CANCEL</button>
        <button onClick={confirm} disabled={baking || !nat} style={{ ...SKB, flex: 1, fontSize: 'var(--fs-11)', color: '#fff', background: '#FF0000', border: 'none', padding: '12px 0', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: baking ? 0.6 : 1 }}>{baking ? 'CROPPING…' : 'USE PHOTO'}</button>
      </div>
    </div>,
    document.body,
  );
}
