"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserBookmarks } from "@/lib/bookmarksService";
import { getUserByPrivyId } from "@/lib/userService";
import MediaRenderer from "@/components/MediaRenderer";
import ProfilePostViewer from "@/components/ProfilePostViewer";
import FrameLoader from "@/components/FrameLoader";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

function aspectRatioFromLayout(gridLayout?: string | null): string {
  if (!gridLayout) return '2.39 / 1';
  switch (gridLayout) {
    case '2x-pana': case '1x-pana': return '2.75 / 1';
    case '2x-scope': case '1x-scope': return '2.39 / 1';
    case '2x-cine': case '1x-cine': return '1.85 / 1';
    case '3x-legacy': return '4 / 3';
    default:
      if (gridLayout.includes('16:9') || gridLayout.includes('16-9')) return '16 / 9';
      if (gridLayout.includes('4:3') || gridLayout.includes('4-3')) return '4 / 3';
      return '2.39 / 1';
  }
}

export default function BookmarksPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showViewer, setShowViewer] = useState(false);
  const [privyId, setPrivyId] = useState<string>("");

  useEffect(() => {
    if (!user?.id) return;
    setPrivyId(user.id);
    getUserBookmarks(user.id)
      .then(setPosts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.id]);

  const leftCol  = posts.filter((_, i) => i % 2 === 0);
  const rightCol = posts.filter((_, i) => i % 2 === 1);

  // Map flat index from column + row back to the full posts array index
  const toFullIndex = (col: 'left' | 'right', rowIdx: number) =>
    col === 'left' ? rowIdx * 2 : rowIdx * 2 + 1;

  return (
    <div style={{ background: '#000', minHeight: '100vh', maxWidth: 375, margin: '0 auto', position: 'relative' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', position: 'relative' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF0000', flexShrink: 0, marginRight: 10 }} />
        <button
          onClick={() => router.back()}
          style={{ ...SKB, fontSize: 11, color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          ← Back
        </button>
        <span style={{ ...SKB, fontSize: 11, color: 'white', position: 'absolute', left: '50%', transform: 'translateX(-50%)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          SAVED
        </span>
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
          <FrameLoader />
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Nothing saved yet
          </span>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div style={{ display: 'flex', gap: 1, padding: '4px 0 24px' }}>
          {/* Left column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {leftCol.map((post, rowIdx) => (
              <div
                key={post.id}
                onClick={() => { setViewerIndex(toFullIndex('left', rowIdx)); setShowViewer(true); }}
                style={{ width: '100%', aspectRatio: aspectRatioFromLayout(post.grid_layout), overflow: 'hidden', cursor: 'pointer', background: '#111' }}
              >
                <MediaRenderer
                  url={post.media_urls?.[0]}
                  mediaType={post.media_type}
                  caption={post.caption}
                  thumbnailUrl={post.thumbnail_url}
                  autoplay={false}
                  showSoundToggle={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            ))}
          </div>
          {/* Right column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rightCol.map((post, rowIdx) => (
              <div
                key={post.id}
                onClick={() => { setViewerIndex(toFullIndex('right', rowIdx)); setShowViewer(true); }}
                style={{ width: '100%', aspectRatio: aspectRatioFromLayout(post.grid_layout), overflow: 'hidden', cursor: 'pointer', background: '#111' }}
              >
                <MediaRenderer
                  url={post.media_urls?.[0]}
                  mediaType={post.media_type}
                  caption={post.caption}
                  thumbnailUrl={post.thumbnail_url}
                  autoplay={false}
                  showSoundToggle={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {showViewer && (
        <ProfilePostViewer
          posts={posts}
          initialIndex={viewerIndex}
          ownerUsername={posts[viewerIndex]?.username ?? ''}
          ownerAvatarUrl={posts[viewerIndex]?.profile_image_url ?? null}
          onClose={() => setShowViewer(false)}
        />
      )}
    </div>
  );
}
