// ── MusicPicker — browse the approved Original Music Library, attach a track ──
// Reusable overlay used by the create flow (ADD MUSIC) and the owner's EDIT MUSIC.
// Reads only APPROVED tracks (public RLS). Keyword-chip filter (taxonomy, multi) +
// free-text title/composer search. Inline single-at-a-time play/pause preview.
// SELECT → onSelect(track). Raises the takeover flag (footer pill hides).
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import { MUSIC_TAXONOMY } from "@/lib/musicTaxonomy";
import TrackArt from "@/components/TrackArt";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = "rgba(255,255,255,0.12)";

export interface LibraryTrack {
  id: string;
  title: string;
  composer_user_id: string;
  composer_handle: string | null;
  keywords: string[];
  duration_seconds: number | null;
  file_url: string;
  artwork_url: string | null;
}

function fmt(s: number | null): string {
  if (!s || !isFinite(s)) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

export default function MusicPicker({
  onSelect, onClose, currentTrackId = null,
}: {
  onSelect: (track: LibraryTrack) => void;
  onClose: () => void;
  currentTrackId?: string | null;
}) {
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Footer-pill takeover while the picker is up; stop preview on unmount.
  useEffect(() => {
    document.documentElement.dataset.suiteOpen = "1";
    window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    return () => {
      try { audioRef.current?.pause(); } catch {}
      delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    };
  }, []);

  // Load approved tracks + enrich composer handles (composer_user_id → profiles).
  useEffect(() => {
    let dead = false;
    (async () => {
      const { data } = await supabase
        .from("tracks")
        .select("id, title, composer_user_id, keywords, duration_seconds, file_url, artwork_url")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(300);
      const rows = (data ?? []) as LibraryTrack[];
      const ids = [...new Set(rows.map((r) => r.composer_user_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("user_id, username").in("user_id", ids)
        : { data: [] as { user_id: string; username: string }[] };
      const handle = new Map((profs ?? []).map((p) => [p.user_id, p.username]));
      if (!dead) setTracks(rows.map((r) => ({ ...r, composer_handle: handle.get(r.composer_user_id) ?? null })));
    })();
    return () => { dead = true; };
  }, []);

  const toggleChip = (w: string) => setChips((c) => c.includes(w) ? c.filter((x) => x !== w) : [...c, w]);

  const results = useMemo(() => {
    if (!tracks) return [];
    const query = q.trim().toLowerCase();
    return tracks.filter((t) => {
      const kwOk = chips.length === 0 || chips.some((k) => t.keywords.includes(k)); // OR across chips (forgiving for a young library)
      const qOk = !query || t.title.toLowerCase().includes(query) || (t.composer_handle ?? "").toLowerCase().includes(query);
      return kwOk && qOk;
    });
  }, [tracks, q, chips]);

  const togglePlay = (t: LibraryTrack) => {
    const a = audioRef.current;
    if (!a) return;
    if (playing === t.id) { a.pause(); setPlaying(null); return; }
    a.src = t.file_url;
    a.play().then(() => setPlaying(t.id)).catch(() => setPlaying(null));
  };

  const pick = (t: LibraryTrack) => { try { audioRef.current?.pause(); } catch {} onSelect(t); };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "#000", display: "flex", flexDirection: "column", maxWidth: "30rem", margin: "0 auto" }}>
      {/* audio engine (one, single-at-a-time) */}
      <audio ref={audioRef} onEnded={() => setPlaying(null)} onPause={() => { /* keep state on manual toggle */ }} />

      {/* header + search */}
      <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ ...SKB, fontSize: "var(--fs-11)", color: "#FFF", textTransform: "uppercase", letterSpacing: "0.1em" }}>Add Music</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", ...SKR, fontSize: 20, color: "rgba(255,255,255,0.55)", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search title or composer…"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "none", outline: "none", ...SKR, fontSize: "max(16px, var(--fs-9))", color: "#FFF", padding: "9px 11px" }}
        />
        {/* keyword chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, maxHeight: 92, overflowY: "auto" }}>
          {MUSIC_TAXONOMY.flatMap((g) => g.words).map((w) => {
            const on = chips.includes(w);
            return (
              <button key={w} onClick={() => toggleChip(w)}
                style={{ ...SKR, fontSize: "var(--fs-7)", color: on ? "#000" : "rgba(255,255,255,0.7)", background: on ? "#FFF" : "transparent", border: `1px solid ${on ? "#FFF" : HAIR}`, padding: "4px 9px", cursor: "pointer", textTransform: "lowercase" }}>
                {w}
              </button>
            );
          })}
        </div>
      </div>

      {/* results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0 40px" }}>
        {tracks === null && <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.4)", padding: "20px 18px" }}>Loading…</p>}
        {tracks !== null && results.length === 0 && <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.4)", padding: "20px 18px" }}>No tracks match.</p>}
        {results.map((t) => {
          const isPlaying = playing === t.id;
          const isCurrent = currentTrackId === t.id;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
              <TrackArt url={t.artwork_url} title={t.title} id={t.id} size={38} />
              {/* play/pause */}
              <button onClick={() => togglePlay(t)} aria-label={isPlaying ? "Pause" : "Play"} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: `1px solid ${HAIR}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                {isPlaying ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#FFF"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#FFF"><path d="M7 5v14l12-7z" /></svg>
                )}
              </button>
              {/* info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ ...SKB, fontSize: "var(--fs-9)", color: "#FFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                  <span style={{ ...SKR, fontSize: "var(--fs-7)", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{fmt(t.duration_seconds)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ ...SKR, fontSize: "var(--fs-7)", color: "rgba(255,255,255,0.45)" }}>{t.composer_handle ? `@${t.composer_handle}` : ""}</span>
                  <span style={{ ...SKR, fontSize: "var(--fs-7)", color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.keywords.slice(0, 3).join(" · ")}</span>
                </div>
              </div>
              {/* select */}
              <button onClick={() => pick(t)} style={{ flexShrink: 0, ...SKB, fontSize: "var(--fs-8)", color: isCurrent ? "#FF0000" : "#FFF", textTransform: "uppercase", letterSpacing: "0.06em", background: "transparent", border: `1px solid ${isCurrent ? "rgba(255,0,0,0.6)" : "rgba(255,255,255,0.4)"}`, cursor: "pointer", padding: "7px 12px" }}>
                {isCurrent ? "Current" : "Select"}
              </button>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
