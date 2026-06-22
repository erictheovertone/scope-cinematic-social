"use client";
import { useState, useRef } from "react";
import { getAspectRatio } from "@/lib/aspectRatio";

interface ReframeOverlayProps {
  post: any;
  layoutId: string;
  onSave: (cropX: number, cropY: number, cropWidth: number, cropHeight: number) => void;
  onCancel: () => void;
}

export default function ReframeOverlay({ post, layoutId, onSave, onCancel }: ReframeOverlayProps) {
  const [cropX, setCropX] = useState(post.crop_x ?? 0);
  const [cropY, setCropY] = useState(post.crop_y ?? 0);
  const [cropWidth, setCropWidth] = useState(post.crop_width ?? 1);
  const [cropHeight, setCropHeight] = useState(post.crop_height ?? 1);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startCropY: number; startCropH: number; mode: 'move' | 'top' | 'bottom' } | null>(null);

  const ratioStr = getAspectRatio(layoutId);
  const [rw, rh] = ratioStr.split('/').map(s => parseFloat(s.trim()));
  const targetRatio = rw / rh;

  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

  const initCrop = (mediaWidth: number, mediaHeight: number) => {
    const mediaRatio = mediaWidth / mediaHeight;
    setNaturalRatio(mediaRatio);
    if (post.crop_x != null) return; // already has saved crop, keep it
    if (mediaRatio > targetRatio) {
      // Media wider — full height, narrow width
      const cw = targetRatio / mediaRatio;
      setCropX((1 - cw) / 2);
      setCropY(0);
      setCropWidth(cw);
      setCropHeight(1);
    } else {
      // Media taller — full width, short height
      const ch = mediaRatio / targetRatio;
      setCropX(0);
      setCropY((1 - ch) / 2);
      setCropWidth(1);
      setCropHeight(ch);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, mode: 'move' | 'top' | 'bottom') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startCropY: cropY, startCropH: cropHeight, mode };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    const containerH = containerRef.current.getBoundingClientRect().height;
    const deltaFrac = (e.clientY - dragRef.current.startY) / containerH;
    const nr = naturalRatio || targetRatio;

    if (dragRef.current.mode === 'move') {
      setCropY(clamp(dragRef.current.startCropY + deltaFrac, 0, 1 - cropHeight));
    } else if (dragRef.current.mode === 'top') {
      const newY = clamp(dragRef.current.startCropY + deltaFrac, 0, dragRef.current.startCropY + dragRef.current.startCropH - 0.1);
      const newH = clamp(dragRef.current.startCropH - deltaFrac, 0.1, 1 - newY);
      const newW = Math.min(newH * targetRatio / nr, 1);
      setCropY(newY);
      setCropHeight(newH);
      setCropWidth(newW);
      setCropX((1 - newW) / 2);
    } else if (dragRef.current.mode === 'bottom') {
      const newH = clamp(dragRef.current.startCropH + deltaFrac, 0.1, 1 - dragRef.current.startCropY);
      const newW = Math.min(newH * targetRatio / nr, 1);
      setCropHeight(newH);
      setCropWidth(newW);
      setCropX((1 - newW) / 2);
    }
  };

  const handlePointerUp = () => { dragRef.current = null; };

  const isVideoPost = post.media_type === 'video';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', flexShrink: 0 }}>
        <button onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>CANCEL</span>
        </button>
        <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-10)', color: 'white', textTransform: 'uppercase' }}>RE-FRAME</span>
        <button
          onClick={() => onSave(cropX, cropY, cropWidth, cropHeight)}
          style={{ background: '#FF0000', border: 'none', cursor: 'pointer', padding: '6px 14px' }}
        >
          <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-10)', color: 'white', textTransform: 'uppercase' }}>SAVE</span>
        </button>
      </div>

      {/* Media with crop overlay */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {isVideoPost ? (
          <video
            src={post.media_urls?.[0]}
            autoPlay muted loop playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget as HTMLVideoElement;
              initCrop(v.videoWidth, v.videoHeight);
            }}
          />
        ) : (
          <img
            src={post.media_urls?.[0]}
            alt="Reframe"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onLoad={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              initCrop(img.naturalWidth, img.naturalHeight);
            }}
          />
        )}

        {/* Dark overlay bars */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${cropY * 100}%`, background: 'rgba(0,0,0,0.72)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${(1 - cropY - cropHeight) * 100}%`, background: 'rgba(0,0,0,0.72)' }} />
        </div>

        {/* Draggable crop box */}
        <div
          style={{
            position: 'absolute', left: 0, right: 0,
            top: `${cropY * 100}%`,
            height: `${cropHeight * 100}%`,
            cursor: 'grab', pointerEvents: 'auto',
          }}
          onPointerDown={(e) => handlePointerDown(e, 'move')}
        >
          {/* Top handle */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'top')}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
          >
            <div style={{ width: 36, height: 1.5, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 1 }} />
          </div>
          {/* Bottom handle */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'bottom')}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
          >
            <div style={{ width: 36, height: 1.5, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 1 }} />
          </div>
          {/* Corner markers */}
          {([
            { top: 0, left: 0, borderTop: '1px solid rgba(255,255,255,0.8)', borderLeft: '1px solid rgba(255,255,255,0.8)' },
            { top: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.8)', borderRight: '1px solid rgba(255,255,255,0.8)' },
            { bottom: 0, left: 0, borderBottom: '1px solid rgba(255,255,255,0.8)', borderLeft: '1px solid rgba(255,255,255,0.8)' },
            { bottom: 0, right: 0, borderBottom: '1px solid rgba(255,255,255,0.8)', borderRight: '1px solid rgba(255,255,255,0.8)' },
          ] as React.CSSProperties[]).map((corner, i) => (
            <div key={i} style={{ position: 'absolute', width: 14, height: 14, ...corner }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 16px 40px', flexShrink: 0 }}>
        <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center', margin: 0 }}>
          DRAG TO REPOSITION · HANDLES TO RESIZE
        </p>
      </div>
    </div>
  );
}
