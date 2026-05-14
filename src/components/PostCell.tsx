"use client";

import { getAspectRatio, ratioPadding } from "@/lib/aspectRatio";
import MediaRenderer from "@/components/MediaRenderer";

interface Post {
  id: string;
  media_urls: string[];
  media_type?: string;
  caption?: string;
  thumbnail_url?: string | null;
  autoplay?: boolean;
  crop_x?: number;
  crop_y?: number;
  crop_width?: number;
  crop_height?: number;
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
        )}
      </div>
    </div>
  );
}
