// ── EditMusicSheet — post-publish music editing (owner only) ─────────────────
// Pure flag updates (music_track_id / music_mode) via updatePostMusic — swap the
// track, change the layering mode (videos only), or remove music. The post's own
// media is never touched. Each change persists optimistically with a quiet error.
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import { updatePostMusic } from "@/lib/postsService";
import MusicPicker, { type LibraryTrack } from "@/components/MusicPicker";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = "rgba(255,255,255,0.12)";

export default function EditMusicSheet({
  post, onClose, onUpdated,
}: {
  post: { id: string; media_type?: string | null; music_track_id?: string | null; music_mode?: 'bed' | 'music_only' | null };
  onClose: () => void;
  onUpdated?: (trackId: string | null, mode: 'bed' | 'music_only' | null) => void;
}) {
  const isVideo = post.media_type === "video";
  const [trackId, setTrackId] = useState<string | null>(post.music_track_id ?? null);
  const [mode, setMode] = useState<'bed' | 'music_only' | null>(post.music_mode ?? null);
  const [meta, setMeta] = useState<{ title: string; handle: string | null } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.suiteOpen = "1";
    window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    const r = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(r);
      delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    };
  }, []);

  // Resolve the current track's title + composer handle for display.
  useEffect(() => {
    if (!trackId) { setMeta(null); return; }
    let dead = false;
    (async () => {
      const { data: t } = await supabase.from("tracks").select("title, composer_user_id").eq("id", trackId).maybeSingle();
      if (dead || !t) return;
      const { data: p } = await supabase.from("profiles").select("username").eq("user_id", t.composer_user_id).maybeSingle();
      if (!dead) setMeta({ title: t.title, handle: p?.username ?? null });
    })();
    return () => { dead = true; };
  }, [trackId]);

  const close = () => { setVisible(false); setTimeout(onClose, 220); };

  const persist = async (nextTrack: string | null, nextMode: 'bed' | 'music_only' | null) => {
    setSaving(true); setError(null);
    const prevTrack = trackId, prevMode = mode;
    setTrackId(nextTrack); setMode(nextMode); // optimistic
    const r = await updatePostMusic(post.id, nextTrack, nextMode);
    setSaving(false);
    if (!r.ok) { setTrackId(prevTrack); setMode(prevMode); setError("Couldn't save — try again."); return; }
    onUpdated?.(nextTrack, nextMode);
  };

  return createPortal(
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 560, background: "rgba(0,0,0,0.7)", opacity: visible ? 1 : 0, transition: "opacity 220ms ease" }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 561, maxWidth: "30rem", margin: "0 auto", background: "#000", borderTop: `1px solid ${HAIR}`, padding: "16px 20px calc(28px + env(safe-area-inset-bottom))", transform: visible ? "translateY(0)" : "translateY(100%)", transition: "transform 220ms cubic-bezier(0.32,0.72,0,1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ ...SKB, fontSize: "var(--fs-11)", color: "#FFF", textTransform: "uppercase", letterSpacing: "0.1em" }}>Edit Music</span>
          <button onClick={close} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", ...SKR, fontSize: 20, color: "rgba(255,255,255,0.55)", lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {trackId ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
              <span style={{ ...SKR, fontSize: "var(--fs-9)", color: "#FFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {meta?.title ?? "Track attached"}{meta?.handle ? ` · @${meta.handle}` : ""}
              </span>
              <button onClick={() => persist(null, null)} disabled={saving} style={{ flexShrink: 0, ...SKB, fontSize: "var(--fs-8)", color: "#FF0000", textTransform: "uppercase", letterSpacing: "0.06em", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
            </div>
            {isVideo && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {(['bed', 'music_only'] as const).map((m) => {
                  const on = mode === m;
                  return (
                    <button key={m} onClick={() => persist(trackId, m)} disabled={saving} style={{ flex: 1, background: on ? "#FFF" : "transparent", border: `1px solid ${on ? "#FFF" : "rgba(255,255,255,0.2)"}`, cursor: "pointer", padding: "9px 6px", ...SKB, fontSize: "var(--fs-8)", color: on ? "#000" : "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {m === "bed" ? "Music as bed" : "Music only"}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.4)", margin: "0 0 14px" }}>No music on this post.</p>
        )}

        <button onClick={() => setShowPicker(true)} style={{ width: "100%", background: "transparent", border: `1px solid ${HAIR}`, cursor: "pointer", padding: "12px 0", ...SKB, fontSize: "var(--fs-9)", color: "#FFF", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {trackId ? "Change track" : "Add music"}
        </button>
        {error && <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "#FF0000", margin: "10px 0 0" }}>{error}</p>}
      </div>

      {showPicker && (
        <MusicPicker
          currentTrackId={trackId}
          onClose={() => setShowPicker(false)}
          onSelect={(t: LibraryTrack) => {
            const nextMode = isVideo ? (mode ?? "bed") : null;
            setShowPicker(false);
            void persist(t.id, nextMode);
            setMeta({ title: t.title, handle: t.composer_handle });
          }}
        />
      )}
    </>,
    document.body,
  );
}
