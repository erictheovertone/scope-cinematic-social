"use client";

import { useEffect, useState, useRef } from "react";
import MediaRenderer from "@/components/MediaRenderer";
import ReframeOverlay from "@/components/ReframeOverlay";

interface VideoLightboxProps {
  post: any;
  onClose: () => void;
  onScrollDown: () => void;
  isOwner?: boolean;
  supabaseUserId?: string;
  onCollect?: () => void;
  onAddToDeck?: () => void;
  onTheaterMode?: () => void;
  layoutId?: string;
}

export default function VideoLightbox({ post, onClose, onScrollDown, isOwner, supabaseUserId, onCollect, onAddToDeck, onTheaterMode, layoutId }: VideoLightboxProps) {
  const [visible, setVisible] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [pinned, setPinned] = useState(post.is_pinned || false);
  const [autoplay, setAutoplay] = useState(post.autoplay !== false);
  const [showOwnerExpanded, setShowOwnerExpanded] = useState(false);
  const [replacingThumb, setReplacingThumb] = useState(false);
  const [showReframe, setShowReframe] = useState(false);
  const thumbInputRef = useRef<HTMLInputElement>(null);
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

      {/* Discreet action bar */}
      <div
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{
          width: '92%',
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left actions — always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {onCollect && (
            <button
              onClick={(e) => { e.stopPropagation(); onCollect(); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onCollect(); }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 6, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>COLLECT</span>
            </button>
          )}
          {onAddToDeck && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddToDeck(); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onAddToDeck(); }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="7" height="7" rx="1" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5"/>
                <path d="M17.5 14v7M14 17.5h7" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 6, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DECK</span>
            </button>
          )}
        </div>

        {/* Right section */}
        {(isOwner || onTheaterMode) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {onTheaterMode && (
              <button
                onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onTheaterMode(); }}
                onClick={(e) => { e.stopPropagation(); onTheaterMode(); }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
              >
                <img src="/theatre-mode-logo-new-lg.png" style={{ height: 13, width: 'auto', opacity: 0.55 }} alt="Theater" />
                <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 6, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>THEATER</span>
              </button>
            )}
            {isOwner && (<>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const newPinned = !pinned;
                setPinned(newPinned);
                const { createClient } = await import('@supabase/supabase-js');
                const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
                await sb.from('posts').update({ is_pinned: newPinned }).eq('id', post.id);
                if (newPinned && supabaseUserId) {
                  await sb.from('posts').update({ is_pinned: false }).eq('user_id', supabaseUserId).neq('id', post.id);
                }
              }}
              onTouchEnd={async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const newPinned = !pinned;
                setPinned(newPinned);
                const { createClient } = await import('@supabase/supabase-js');
                const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
                await sb.from('posts').update({ is_pinned: newPinned }).eq('id', post.id);
                if (newPinned && supabaseUserId) {
                  await sb.from('posts').update({ is_pinned: false }).eq('user_id', supabaseUserId).neq('id', post.id);
                }
              }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={pinned ? '#FF0000' : 'none'}>
                <path d="M12 2v13M8 6l4-4 4 4M5 21l7-6 7 6" stroke={pinned ? '#FF0000' : 'rgba(255,255,255,0.45)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 6, color: pinned ? '#FF0000' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>PIN</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowOwnerExpanded(v => !v); }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="1" fill="rgba(255,255,255,0.6)"/>
                <circle cx="19" cy="12" r="1" fill="rgba(255,255,255,0.6)"/>
                <circle cx="5" cy="12" r="1" fill="rgba(255,255,255,0.6)"/>
              </svg>
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>MORE</span>
            </button>
            </>)}
          </div>
        )}
      </div>

      {/* Owner expanded panel */}
      {isOwner && showOwnerExpanded && (
        <div
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          style={{
            width: '92%',
            marginTop: 12,
            padding: '12px 0',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Autoplay toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>AUTOPLAY ON GRID</p>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 8, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                {autoplay ? 'Playing automatically' : 'Shows thumbnail with play button'}
              </p>
            </div>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const newAutoplay = !autoplay;
                setAutoplay(newAutoplay);
                const { createClient } = await import('@supabase/supabase-js');
                const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
                await sb.from('posts').update({ autoplay: newAutoplay }).eq('id', post.id);
              }}
              onTouchEnd={async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const newAutoplay = !autoplay;
                setAutoplay(newAutoplay);
                const { createClient } = await import('@supabase/supabase-js');
                const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
                await sb.from('posts').update({ autoplay: newAutoplay }).eq('id', post.id);
              }}
              style={{
                width: 28, height: 28,
                background: autoplay ? 'rgba(255,0,0,0.15)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${autoplay ? 'rgba(255,0,0,0.5)' : 'rgba(255,255,255,0.2)'}`,
                cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s ease, border-color 0.2s ease',
              }}
            >
              {autoplay ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <rect x="6" y="4" width="4" height="16" fill="#FF0000"/>
                  <rect x="14" y="4" width="4" height="16" fill="#FF0000"/>
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M5 3l14 9-14 9V3z" fill="rgba(255,255,255,0.45)"/>
                </svg>
              )}
            </button>
          </div>

          {/* Replace thumbnail */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>THUMBNAIL</p>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 8, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                {replacingThumb ? 'Uploading...' : 'Replace poster image'}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); thumbInputRef.current?.click(); }}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: '5px 10px' }}
            >
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {replacingThumb ? '...' : 'REPLACE'}
              </span>
            </button>
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !supabaseUserId) return;
                setReplacingThumb(true);
                try {
                  const { createClient } = await import('@supabase/supabase-js');
                  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
                  const ext = file.name.split('.').pop();
                  const path = `${supabaseUserId}/${Date.now()}-thumb.${ext}`;
                  await sb.storage.from('post-media').upload(path, file, { upsert: true });
                  const { data: urlData } = sb.storage.from('post-media').getPublicUrl(path);
                  const newThumbUrl = urlData.publicUrl;
                  if (post.thumbnail_url) {
                    const oldPath = post.thumbnail_url.split('/post-media/')[1];
                    if (oldPath) await sb.storage.from('post-media').remove([oldPath]);
                  }
                  await sb.from('posts').update({ thumbnail_url: newThumbUrl }).eq('id', post.id);
                } catch (err) {
                  console.error('Thumb replace error:', err);
                } finally {
                  setReplacingThumb(false);
                }
              }}
            />
          </div>

          {/* Re-frame */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 9, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>RE-FRAME</p>
              <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400, fontSize: 8, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Adjust crop on grid</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowReframe(true); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); setShowReframe(true); }}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: '5px 10px' }}
            >
              <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 8, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>REFRAME</span>
            </button>
          </div>
        </div>
      )}

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

      {showReframe && (
        <ReframeOverlay
          post={post}
          layoutId={layoutId || '1x-scope'}
          onCancel={() => setShowReframe(false)}
          onSave={async (cropX, cropY, cropWidth, cropHeight) => {
            const { createClient } = await import('@supabase/supabase-js');
            const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
            await sb.from('posts').update({ crop_x: cropX, crop_y: cropY, crop_width: cropWidth, crop_height: cropHeight }).eq('id', post.id);
            setShowReframe(false);
          }}
        />
      )}

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
