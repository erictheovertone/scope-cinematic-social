"use client";

import { useState } from "react";
import type { ProfileLink } from "@/lib/userService";

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&\n?#]+)/);
  return match?.[1] || null;
}

function getYouTubeThumbnail(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&\n?#]+)/);
  const videoId = match?.[1];
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

function getVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match?.[1] || null;
}

function getEmbedUrl(videoUrl: string): string {
  const ytId = getYouTubeId(videoUrl);
  if (ytId) {
    return `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&controls=0&showinfo=0&rel=0&modestbranding=1`;
  }
  const vimeoId = getVimeoId(videoUrl);
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&loop=1&background=1`;
  }
  return videoUrl;
}

interface LinksSheetProps {
  username: string;
  links: ProfileLink[];
  visible: boolean;
  onClose: () => void;
}

export default function LinksSheet({ username, links, visible, onClose }: LinksSheetProps) {
  const [activeVideo, setActiveVideo] = useState<ProfileLink | null>(null);

  const handleLinkTap = (link: ProfileLink) => {
    if (link.is_video && link.video_url) {
      setActiveVideo(link);
    } else {
      window.open(link.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={() => { setActiveVideo(null); onClose(); }}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.85)",
          zIndex: 200,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 0.35s ease",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "75vh",
          backgroundColor: "#0a0a0a",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Header */}
        <div style={{ flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 16px 8px" }}>
          <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 40, height: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
          <span style={{ ...MONO, fontSize: 10, color: "white", opacity: 0.6, marginTop: 8 }}>@{username}</span>
          <button
            onClick={() => { setActiveVideo(null); onClose(); }}
            style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 18, lineHeight: 1, padding: 0, marginTop: 4 }}
          >
            ×
          </button>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />

        {/* Full-screen video player overlay */}
        {activeVideo && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "#000", zIndex: 10, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px", flexShrink: 0 }}>
              <button
                onClick={() => setActiveVideo(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 20, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
              <div style={{ width: "100%", aspectRatio: "16/9" }}>
                <iframe
                  src={getEmbedUrl(activeVideo.video_url!)}
                  style={{ width: "100%", height: "100%", border: "none" }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        )}

        {/* Links list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {links.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60%" }}>
              <span style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>No links yet</span>
            </div>
          ) : (
            links.map(link => {
              const hasCustomThumb = !link.is_video && !!link.custom_thumbnail_url;

              if (link.is_video && link.video_url) {
                // ── Video card: thumbnail behind autoplay iframe ──
                const ytId = getYouTubeId(link.video_url);
                const thumbSrc = link.thumbnail_url || getYouTubeThumbnail(link.video_url) || null;
                const usingAutoThumb = !link.thumbnail_url && !!ytId;
                return (
                  <div
                    key={link.id}
                    onClick={() => handleLinkTap(link)}
                    style={{
                      marginBottom: 8,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      cursor: "pointer",
                      overflow: "hidden",
                    }}
                  >
                    {/* Thumbnail + iframe layered */}
                    <div style={{ position: "relative", width: "100%", height: 120, overflow: "hidden" }}>
                      {/* Thumbnail image sits below iframe */}
                      {thumbSrc && (
                        <img
                          src={thumbSrc}
                          alt=""
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
                          onError={usingAutoThumb ? (e) => {
                            const img = e.target as HTMLImageElement;
                            if (img.src.includes("maxresdefault")) {
                              img.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
                            }
                          } : undefined}
                        />
                      )}
                      <iframe
                        src={getEmbedUrl(link.video_url)}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", pointerEvents: "none", display: "block" }}
                        allow="autoplay; muted"
                      />
                      {/* Bottom gradient */}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)", pointerEvents: "none" }} />
                      {/* ↗ arrow */}
                      <span style={{ position: "absolute", top: 8, right: 8, fontSize: 14, color: "white", opacity: 0.7, lineHeight: 1, pointerEvents: "none" }}>↗</span>
                    </div>
                    {/* Title + description + domain */}
                    <div style={{ padding: "8px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <p style={{ ...MONO, fontSize: 10, color: "white", margin: 0, lineHeight: 1.3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", flex: 1 }}>
                          {link.title || getDomain(link.url)}
                        </p>
                        <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: 0, flexShrink: 0 }}>
                          {getDomain(link.url)}
                        </p>
                      </div>
                      {link.description && (
                        <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.6, margin: "3px 0 0", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {link.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              if (hasCustomThumb) {
                // ── Non-video with custom thumbnail: full-width card ──
                return (
                  <div
                    key={link.id}
                    onClick={() => handleLinkTap(link)}
                    style={{
                      marginBottom: 8,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      cursor: "pointer",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ position: "relative", width: "100%", height: 120, overflow: "hidden" }}>
                      <img
                        src={link.custom_thumbnail_url!}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)", pointerEvents: "none" }} />
                      <span style={{ position: "absolute", top: 8, right: 8, fontSize: 14, color: "white", opacity: 0.7, lineHeight: 1 }}>↗</span>
                    </div>
                    <div style={{ padding: "8px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <p style={{ ...MONO, fontSize: 10, color: "white", margin: 0, lineHeight: 1.3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", flex: 1 }}>
                          {link.title || getDomain(link.url)}
                        </p>
                        <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: 0, flexShrink: 0 }}>
                          {getDomain(link.url)}
                        </p>
                      </div>
                      {link.description && (
                        <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.6, margin: "3px 0 0", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {link.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              // ── Regular link card: horizontal layout ──
              return (
                <div
                  key={link.id}
                  onClick={() => handleLinkTap(link)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                >
                  {/* Thumbnail 56x56 */}
                  <div style={{ width: 56, height: 56, flexShrink: 0, overflow: "hidden", background: "#1a1a1a" }}>
                    {link.thumbnail_url ? (
                      <img src={link.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />
                    )}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <p style={{ ...MONO, fontSize: 10, color: "white", margin: 0, lineHeight: 1.3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {link.title || getDomain(link.url)}
                    </p>
                    <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.4, margin: "2px 0 0", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {getDomain(link.url)}
                    </p>
                    {link.description && (
                      <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.6, margin: "4px 0 0", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {link.description}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  <span style={{ color: "white", opacity: 0.4, fontSize: 14, flexShrink: 0 }}>↗</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
