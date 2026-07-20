// ── TrackSheet — the featured track, in full (pull-up mobile / panel desktop) ─
// The album-art moment: artwork (or generated default) as the anchor, title,
// composer avatar+@handle → profile, the LARGE waveform (red-progress audition +
// scrub), keyword chips, and two doors — CONTRIBUTE (the recruitment CTA) and
// BROWSE THE LIBRARY (the standalone surface).
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useTrackForPost } from "@/lib/useTrack";
import { feedImage } from "@/lib/mediaUrl";
import TrackArt from "@/components/TrackArt";
import Waveform from "@/components/Waveform";
import ContributeMusicFlow from "@/components/ContributeMusicFlow";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = "rgba(229,225,219,0.12)";
const RED = "#E5E1DB";

export default function TrackSheet({ trackId, onClose }: { trackId: string; onClose: () => void }) {
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const track = useTrackForPost(trackId);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showContribute, setShowContribute] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // slide-up
  useEffect(() => { const r = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(r); }, []);

  const close = () => { try { audioRef.current?.pause(); } catch {} setVisible(false); setTimeout(onClose, isDesktop ? 0 : 220); };
  const go = (path: string) => { close(); router.push(path); };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a || !track) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (a.src !== track.file_url) a.src = track.file_url;
    a.play().then(() => setPlaying(true)).catch(() => {});
  };
  const seek = (pct: number) => {
    const a = audioRef.current;
    if (!a || !track) return;
    setProgress(pct);
    const apply = () => { if (a.duration && isFinite(a.duration)) a.currentTime = pct * a.duration; };
    if (a.src !== track.file_url) { a.src = track.file_url; a.play().then(() => setPlaying(true)).catch(() => {}); a.addEventListener("loadedmetadata", apply, { once: true }); }
    else apply();
  };

  const Body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <audio ref={audioRef} onEnded={() => { setPlaying(false); setProgress(0); }} onTimeUpdate={() => { const a = audioRef.current; if (a && a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration); }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ ...SKB, fontSize: 10, color: "rgba(229,225,219,0.45)", textTransform: "uppercase", letterSpacing: "0.14em" }}>Featured track</span>
        <button onClick={close} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", ...SKR, fontSize: 20, color: "rgba(229,225,219,0.55)", lineHeight: 1, padding: 4 }}>✕</button>
      </div>

      {/* art anchor + title/composer */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <TrackArt url={track?.artwork_url} title={track?.title} id={trackId} size={84} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ ...SKB, fontSize: 17, color: "#E5E1DB", margin: "2px 0 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track?.title ?? "…"}</p>
          {track?.composer_handle && (
            <button onClick={() => go(`/composer/${track.composer_handle}`)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", overflow: "hidden", background: "#2a2a2a", flexShrink: 0, display: "block" }}>
                {track.composer_avatar && <img src={feedImage(track.composer_avatar, 96)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
              </span>
              <span style={{ ...SKR, fontSize: 12, color: "rgba(229,225,219,0.65)" }}>@{track.composer_handle}</span>
            </button>
          )}
        </div>
      </div>

      {/* large waveform audition */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", border: `1px solid ${HAIR}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
          {playing
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="#E5E1DB"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="#E5E1DB"><path d="M7 5v14l12-7z" /></svg>}
        </button>
        <div style={{ flex: 1 }}><Waveform peaks={track?.waveform_peaks} progress={playing ? progress : 0} onSeek={seek} height={54} /></div>
      </div>

      {/* keywords */}
      {track?.keywords?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {track.keywords.map((k) => (
            <span key={k} style={{ ...SKR, fontSize: 11, color: "rgba(229,225,219,0.5)", border: `1px solid ${HAIR}`, padding: "3px 8px" }}>{k}</span>
          ))}
        </div>
      ) : null}

      {/* doors */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 2 }}>
        <button onClick={() => setShowContribute(true)} style={{ ...SKB, fontSize: 11, color: RED, textTransform: "uppercase", letterSpacing: "0.06em", background: "none", border: `1px solid rgba(229,225,219,0.4)`, cursor: "pointer", padding: "12px 0", lineHeight: 1.4 }}>
          Contribute to the Scope Original Music Library — wear the Composer badge
        </button>
        <button onClick={() => go("/library")} style={{ ...SKB, fontSize: 11, color: "rgba(229,225,219,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", background: "none", border: `1px solid ${HAIR}`, cursor: "pointer", padding: "11px 0" }}>
          Browse the library
        </button>
      </div>

      {showContribute && <ContributeMusicFlow onClose={() => setShowContribute(false)} />}
    </div>
  );

  if (isDesktop) {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 1250, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)" }} />
        <div style={{ position: "relative", width: 460, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto", background: "#0a0a0a", border: `1px solid ${HAIR}`, boxSizing: "border-box", padding: "24px 26px" }}>{Body}</div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(0,0,0,0.7)", opacity: visible ? 1 : 0, transition: "opacity 220ms ease" }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1251, maxWidth: "30rem", margin: "0 auto", background: "#0a0a0a", borderTop: `1px solid ${HAIR}`, padding: "16px 20px calc(28px + env(safe-area-inset-bottom))", maxHeight: "90vh", overflowY: "auto", transform: visible ? "translateY(0)" : "translateY(100%)", transition: "transform 220ms cubic-bezier(0.32,0.72,0,1)" }}>{Body}</div>
    </>,
    document.body,
  );
}
