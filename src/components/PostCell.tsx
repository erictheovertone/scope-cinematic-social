"use client";

import { getAspectRatio, ratioPadding } from "@/lib/aspectRatio";
import MediaRenderer from "@/components/MediaRenderer";
import GradedVideo from "@/components/finishing/GradedVideo";
import { useTxNarrator } from "@/components/TxNarrator";

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
}

interface PostCellProps {
  post: Post;
  layoutId: string;
  index: number;
  onClick?: () => void;
  showSoundToggle?: boolean;
}

export default function PostCell({ post, layoutId, index, onClick, showSoundToggle = false }: PostCellProps) {
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
      <div style={{ position: 'absolute', inset: 0 }}>
        {post.media_urls?.[0] && (
          // Video → GradedVideo. gridMode = ALIVE grid: every in-view autoplay tile
          // attempts to play GRADED at tile-res; the device's decoder limit caps it,
          // overflow rests as graded posters. Non-autoplay = poster (tap opens the
          // post). Photos → MediaRenderer.
          post.media_type === 'video' ? (
            <GradedVideo
              url={post.media_urls[0]}
              posterUrl={post.poster_url ?? post.thumbnail_url}
              clipUrl={post.autoplay_clip_url}
              editParams={post.edit_params}
              autoplayFlag={post.autoplay !== false}
              gridMode
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

      {/* Developing state — corner brackets pulse while the coin is created. */}
      {txPhase === 'working' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, animation: 'tile-develop 1.6s ease-in-out infinite' }}>
          {([['top','left'],['top','right'],['bottom','left'],['bottom','right']] as const).map(([v, h]) => (
            <span key={v + h} style={{
              position: 'absolute', [v]: 4, [h]: 4, width: 10, height: 10,
              [`border${v[0].toUpperCase() + v.slice(1)}` as 'borderTop']: '1.5px solid #FF0000',
              [`border${h[0].toUpperCase() + h.slice(1)}` as 'borderLeft']: '1.5px solid #FF0000',
            }} />
          ))}
          <style>{`@keyframes tile-develop { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
        </div>
      )}
    </div>
  );
}
