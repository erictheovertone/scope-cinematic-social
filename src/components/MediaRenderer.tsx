"use client";

import { useRef, useState, useEffect } from "react";

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
}

function isVideo(url: string, mediaType?: string): boolean {
  if (mediaType === 'video') return true;
  if (mediaType === 'image') return false;
  const ext = url?.split('?')[0].split('.').pop()?.toLowerCase();
  return ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext || '');
}

export default function MediaRenderer({
  url, mediaType, caption, autoplay = false,
  showSoundToggle = false, className, style, onClick, thumbnailUrl,
}: MediaRendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const video = isVideo(url, mediaType);

  useEffect(() => {
    if (!video || !videoRef.current) return;
    const el = videoRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && autoplay) {
          el.play().catch(() => {});
          setIsPlaying(true);
        } else {
          el.pause();
          setIsPlaying(false);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [video, autoplay]);

  if (!video) {
    return (
      <img
        src={url}
        alt={caption || "Post"}
        className={className}
        style={style}
        onClick={onClick}
      />
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} onClick={onClick}>
      <video
        ref={videoRef}
        src={url}
        poster={thumbnailUrl ?? undefined}
        muted={muted}
        loop
        playsInline
        autoPlay={autoplay}
        className={className}
        style={{ ...style, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          )}
        </button>
      )}
      {!showSoundToggle && (
        <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.6)', padding: '2px 5px' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      )}
    </div>
  );
}
