"use client";

import { useRef, useState, useEffect } from "react";
import { feedImage } from "@/lib/mediaUrl";

interface MediaRendererProps {
  url: string;
  mediaType?: string;
  caption?: string;
  autoplay?: boolean;
  showSoundToggle?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  thumbnailUrl?: string | null;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  /** Request a resized WebP at this display width (retina-aware). Unset → full-res
   *  original (editor / any un-migrated caller). Images only; video is unaffected. */
  width?: number;
  /** Above-the-fold cells (first 2–3 in the feed): eager + fetchPriority high so the
   *  first paint is instant. Everything else stays lazy. Images only. */
  priority?: boolean;
}

function isVideo(url: string, mediaType?: string): boolean {
  if (mediaType === 'video') return true;
  if (mediaType === 'image') return false;
  const ext = url?.split('?')[0].split('.').pop()?.toLowerCase();
  return ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext || '');
}

function getCropStyle(cropX = 0, cropY = 0, cropWidth = 1, cropHeight = 1): React.CSSProperties {
  if (cropX === 0 && cropY === 0 && cropWidth === 1 && cropHeight === 1) {
    return { objectFit: 'cover', objectPosition: 'center' };
  }
  const scaleX = 1 / cropWidth;
  const scaleY = 1 / cropHeight;
  const posX = (cropX + cropWidth / 2) * 100;
  const posY = (cropY + cropHeight / 2) * 100;
  return {
    objectFit: 'cover',
    objectPosition: `${posX}% ${posY}%`,
    transform: `scale(${Math.max(scaleX, scaleY)})`,
    transformOrigin: `${posX}% ${posY}%`,
  };
}

export default function MediaRenderer({
  url, mediaType, caption, autoplay = false,
  showSoundToggle = false, className, style, onClick, thumbnailUrl,
  cropX, cropY, cropWidth, cropHeight, width, priority = false,
}: MediaRendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  // Fade-in on load so images ARRIVE (opacity 0→1) rather than assemble on screen.
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgElRef = useRef<HTMLImageElement>(null);
  // A CACHED image can finish before onLoad is attached → onLoad never fires → the
  // fade would trap it at opacity 0. Catch the already-complete case on mount / src
  // change so cached images show instantly (no stuck-invisible frames).
  useEffect(() => {
    if (imgElRef.current?.complete && imgElRef.current.naturalWidth > 0) setImgLoaded(true);
  }, [url, width]);
  // LAZY: don't fetch video bytes until near the viewport. `near` gates the <video>
  // src (below) — off-screen videos download nothing; scrolling away drops the src
  // (disposes/frees the decoder). preload="none" keeps it from buffering ahead of play.
  const [near, setNear] = useState(false);
  const video = isVideo(url, mediaType);

  // The observer ONLY gates visibility. It must never call play(): when it
  // fires, `near` is still false so the <video> has NO src yet — the same-tick
  // play() rejected on "no supported sources" and nothing ever retried after
  // the src mounted (iOS doesn't honor the autoPlay attribute for a late-set
  // src). Playback lives in the effect below, one render AFTER the src exists.
  useEffect(() => {
    if (!video || !videoRef.current) return;
    const el = videoRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const on = entry.isIntersecting;
        setNear(on);                       // load bytes only when at/near the viewport
        if (!on) { el.pause(); setIsPlaying(false); } // scroll-away teardown (src drops via `near`)
      },
      { rootMargin: '250px 0px', threshold: 0 },   // start loading just before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [video]);

  // Play AFTER the src has mounted (near=true → this render carries the src).
  // play() on an already-playing element resolves as a no-op, so the
  // onLoadedMetadata retry below can't double-start anything.
  useEffect(() => {
    if (near && autoplay && videoRef.current) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [near, autoplay]);

  if (!video) {
    return (
      <img
        ref={imgElRef}
        src={width ? feedImage(url, width) : url}
        alt="" /* never the caption — alt text paints as a visible "ghost
                  caption" over slow-loading media, duplicating the real one */
        className={className}
        loading={priority ? 'eager' : 'lazy'}
        // @ts-expect-error fetchPriority is valid HTML but not yet in React's img types
        fetchpriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => setImgLoaded(true)}
        style={{ width: '100%', height: '100%', display: 'block', ...getCropStyle(cropX, cropY, cropWidth, cropHeight), ...style, opacity: imgLoaded ? 1 : 0, transition: 'opacity 150ms ease-out' }}
        onClick={onClick}
      />
    );
  }

  // Non-autoplay tap: defer to the caller if it wants the tap (opens the viewer,
  // which plays there); otherwise start playback inline.
  const handleActivate = () => {
    if (onClick) { onClick(); return; }
    const el = videoRef.current;
    if (el) el.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        src={near ? url : undefined}       /* lazy: no bytes until near-viewport; dropped when scrolled away */
        poster={thumbnailUrl ? (width ? feedImage(thumbnailUrl, width) : thumbnailUrl) : undefined}
        preload="none"
        muted={muted}
        loop
        playsInline
        autoPlay={autoplay}
        className={className}
        style={{ width: '100%', height: '100%', display: 'block', ...getCropStyle(cropX, cropY, cropWidth, cropHeight), ...style }}
        onClick={(e) => { e.stopPropagation(); handleActivate(); }}
        onLoadedMetadata={() => {
          // Belt-and-braces (iOS, slow loads): a src that arrives late still
          // fires playback. No-op if the play effect already started it.
          if (near && autoplay && videoRef.current) {
            videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        }}
      />
      {showSoundToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); setMuted(m => !m); }}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
            width: 28, height: 28, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
          }}
        >
          {muted ? (
            <svg width="17.5" height="17.5" viewBox="0 0 24 24" fill="#E5E1DB">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          ) : (
            <svg width="17.5" height="17.5" viewBox="0 0 24 24" fill="#E5E1DB">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          )}
        </button>
      )}
      {/* Non-autoplay videos get a small RED play triangle, lower-right — the
          austere corner affordance (matches the feed's GradedVideo). Hidden once
          playing; the video's onClick (handleActivate) starts it. */}
      {!autoplay && !isPlaying && (
        <div
          aria-label="Play"
          style={{ position: 'absolute', bottom: 8, right: 8, lineHeight: 0, pointerEvents: 'none', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}
        >
          <svg width="16.5" height="18.5" viewBox="0 0 13 15" fill="#E5E1DB"><path d="M1 1l11 6.5L1 14z"/></svg>
        </div>
      )}
    </div>
  );
}
