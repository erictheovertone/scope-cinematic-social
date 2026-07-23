"use client";

import { getAspectRatio, ratioPadding } from "@/lib/aspectRatio";
import MediaRenderer from "@/components/MediaRenderer";
import GradedVideo from "@/components/finishing/GradedVideo";
import { useTxNarrator } from "@/components/TxNarrator";
import { isUntradeableCoin } from "@/lib/economy/pairing";

interface Post {
  id: string;
  media_urls: string[];
  media_type?: string;
  caption?: string;
  thumbnail_url?: string | null;
  poster_url?: string | null;
  autoplay_clip_url?: string | null;
  autoplay?: boolean;
  crop_x?: number;
  crop_y?: number;
  crop_width?: number;
  crop_height?: number;
  edit_params?: unknown;
  coin_address?: string | null;
  coin_currency?: string | null;
  is_pinned?: boolean;
}

interface PostCellProps {
  /** Profile owner holds an ACTIVE First Cut on this post → red insignia, top-right. */
  fcMark?: boolean;
  post: Post;
  layoutId: string;
  index: number;
  onClick?: () => void;
  showSoundToggle?: boolean;
}

export default function PostCell({ post, layoutId, index, onClick, showSoundToggle = false, fcMark = false }: PostCellProps) {
  const ratio = getAspectRatio(layoutId, index);
  const padding = ratioPadding(ratio);
  // The minting tile narrates: while this post's coin is being created the
  // tile wears the corner-bracket "developing" pulse; a failed sequence shows
  // a small red retry mark (tap → lightbox → kebab CREATE COIN).
  const txPhase = useTxNarrator().statusFor(post.id);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        paddingTop: `${padding}%`,
        cursor: onClick ? 'pointer' : 'default',
        backgroundColor: '#222',
        overflow: 'hidden',
      }}
      onClick={onClick}
    >
      {/* First Cut insignia — deliberate corner overlay (Eric's design), ~18% of
          cell width, ratio-locked; absolutely positioned so tap targets, layout
          and the paddingTop AR container are untouched. onError hides until the
          asset ships. */}
      {fcMark && (
        <img
          /* Brief 1a: swapped off the retired red insignia to the new First Cut asset
             (fit-preserving). The corner-insignia treatment vs the new landscape card
             is FLAGGED for the hero briefs — asset swapped, treatment not restyled. */
          src="/design-updates-071526/new-badges/first-cut.png"
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ position: 'absolute', top: 3, right: 3, width: '9%', minWidth: 16, height: 'auto', zIndex: 6, pointerEvents: 'none' }} /* landscape asset → slightly wider footprint */
        />
      )}
      {/* Pinned indicator — small white push-pin, top-right of the thumbnail.
          Sits above media (z7) so it reads over any frame; purely decorative. */}
      {post.is_pinned && (
        <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 7, pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.75))' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#E5E1DB" aria-hidden="true">
            <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
          </svg>
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Brief V3 §3 — render on stream_uid too: a Stream video has EMPTY media_urls
            and must NOT blank-cell the grid. */}
        {(post.media_urls?.[0] || (post as { stream_uid?: string | null }).stream_uid) && (
          // Video → GradedVideo. gridMode = ALIVE grid: every in-view autoplay tile
          // attempts to play GRADED at tile-res; the device's decoder limit caps it,
          // overflow rests as graded posters. Non-autoplay = poster (tap opens the
          // post). Photos → MediaRenderer.
          post.media_type === 'video' ? (
            <GradedVideo
              url={post.media_urls?.[0] ?? ''}
              posterUrl={(post as { stream_poster_url?: string | null }).stream_poster_url ?? post.poster_url ?? post.thumbnail_url}
              posterWidth={600}
              clipUrl={post.autoplay_clip_url}
              editParams={post.edit_params}
              autoplayFlag={post.autoplay !== false}
              gridMode
              processing={(post as { video_status?: string | null }).video_status === 'processing'}
              hlsUrl={(post as { video_status?: string | null; stream_playback_url?: string | null }).video_status === 'ready' ? (post as { stream_playback_url?: string | null }).stream_playback_url : null}
              cropX={post.crop_x ?? 0}
              cropY={post.crop_y ?? 0}
              cropWidth={post.crop_width ?? 1}
              cropHeight={post.crop_height ?? 1}
              onClick={onClick}
              showSoundToggle={showSoundToggle}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <MediaRenderer
              url={post.media_urls[0]}
              width={600}
              mediaType={post.media_type}
              caption={post.caption || 'Post'}
              thumbnailUrl={post.thumbnail_url}
              autoplay={post.autoplay !== false}
              showSoundToggle={showSoundToggle}
              onClick={onClick}
              cropX={post.crop_x ?? 0}
              cropY={post.crop_y ?? 0}
              cropWidth={post.crop_width ?? 1}
              cropHeight={post.crop_height ?? 1}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )
        )}
      </div>

      {/* LEGACY pairing tag — a small, quiet mark so an untradeable (ETH-paired)
          coin reads as such before the collect sheet is opened. */}
      {isUntradeableCoin(post) && (
        <div style={{ position: 'absolute', bottom: 6, left: 6, zIndex: 6, pointerEvents: 'none', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(229,225,219,0.5)', padding: '2px 5px' }}>
          <span style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-6_5)', letterSpacing: '0.14em', color: '#E5E1DB', textTransform: 'uppercase' }}>LEGACY</span>
        </div>
      )}

      {/* Developing state — corner brackets pulse while the coin is created. */}
      {txPhase === 'working' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, animation: 'tile-develop 1.6s ease-in-out infinite' }}>
          {([['top','left'],['top','right'],['bottom','left'],['bottom','right']] as const).map(([v, h]) => (
            <span key={v + h} style={{
              position: 'absolute', [v]: 4, [h]: 4, width: 10, height: 10,
              [`border${v[0].toUpperCase() + v.slice(1)}` as 'borderTop']: '1.5px solid #E5E1DB',
              [`border${h[0].toUpperCase() + h.slice(1)}` as 'borderLeft']: '1.5px solid #E5E1DB',
            }} />
          ))}
          <style>{`@keyframes tile-develop { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
        </div>
      )}
    </div>
  );
}
