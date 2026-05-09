"use client";

import { useEffect, useState, useRef } from "react";
import MediaRenderer from "@/components/MediaRenderer";

interface VideoLightboxProps {
  post: any;
  onClose: () => void;
  onScrollDown: () => void;
}

export default function VideoLightbox({ post, onClose, onScrollDown }: VideoLightboxProps) {
  const [visible, setVisible] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleScrollDown = () => {
    setVisible(false);
    setTimeout(onScrollDown, 300);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const duration = Date.now() - touchStartTime.current;
    touchStartY.current = null;
    // Swipe down — open viewer
    if (deltaY > 50) {
      handleScrollDown();
      return;
    }
    // Quick tap on background — close lightbox
    if (Math.abs(deltaY) < 10 && duration < 300) {
      handleClose();
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed', inset: 0, zIndex: 150,
        backgroundColor: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* Video — stopPropagation so tapping video doesn't close */}
      <div
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{ width: '92%', maxHeight: '70vh', position: 'relative' }}
      >
        <MediaRenderer
          url={post.media_urls?.[0]}
          mediaType={post.media_type}
          caption={post.caption}
          autoplay={true}
          showSoundToggle={true}
          thumbnailUrl={post.thumbnail_url}
          style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }}
        />
      </div>

      {/* Info panel — below video, left aligned */}
      <div
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{ width: '92%', marginTop: 10 }}
      >
        {/* + toggle button */}
        <button
          onClick={(e) => { e.stopPropagation(); setInfoExpanded(v => !v); }}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '50%',
            width: 22, height: 22,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
            transition: 'transform 0.3s ease, border-color 0.3s ease',
            transform: infoExpanded ? 'rotate(45deg)' : 'rotate(0deg)',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v8M1 5h8" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Expandable info */}
        <div style={{
          overflow: 'hidden',
          maxHeight: infoExpanded ? '200px' : '0px',
          transition: 'max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          marginTop: infoExpanded ? 10 : 0,
        }}>
          {/* Caption */}
          {post.caption && (
            <p style={{
              fontFamily: "'SK-Modernist', sans-serif",
              fontWeight: 400, fontSize: 9,
              color: 'white', lineHeight: 1.2,
              margin: '0 0 10px', padding: 0,
              animation: infoExpanded ? 'rippleIn 0.3s ease forwards' : 'none',
              opacity: infoExpanded ? 1 : 0,
              transition: 'opacity 0.3s ease 0.1s',
            }}>
              {post.caption}
            </p>
          )}

          {/* Post data */}
          <div style={{
            display: 'flex', gap: 20,
            animation: infoExpanded ? 'rippleIn 0.3s ease 0.05s forwards' : 'none',
            opacity: infoExpanded ? 1 : 0,
            transition: 'opacity 0.3s ease 0.15s',
          }}>
            {[
              { label: 'COLLECTED', value: post.total_supply || '0' },
              { label: 'LIKES', value: post.like_count || '0' },
              { label: 'COMMENTS', value: post.comment_count || '0' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 11, color: 'white', margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Token info */}
          {post.contract_address && (
            <div style={{
              marginTop: 10,
              opacity: infoExpanded ? 1 : 0,
              transition: 'opacity 0.3s ease 0.2s',
            }}>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px' }}>TOKEN</p>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 8, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '0.02em' }}>
                {post.contract_address.slice(0, 6)}...{post.contract_address.slice(-4)} · BASE
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Arrow — tap to open viewer */}
      <div
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => { e.stopPropagation(); handleScrollDown(); }}
        style={{
          position: 'absolute', bottom: 48, left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 4,
          cursor: 'pointer',
          animation: 'arrowBounce 1.8s ease-in-out infinite',
          zIndex: 2, padding: 16,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12l7 7 7-7" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p style={{
          fontFamily: "'SK-Modernist', sans-serif",
          fontWeight: 700, fontSize: 8,
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em', margin: 0,
        }}>
          SCROLL
        </p>
      </div>

      <style>{`
        @keyframes arrowBounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(6px); }
        }
        @keyframes rippleIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
