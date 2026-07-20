// ── /library — the Scope Original Music Library (browse-only v1) ─────────────
// The picker's browser as its own surface: keyword/title search, compact waveform
// rows with red-fill audition + scrub, composers linking to their discographies.
// Discovery only (no select) — reached from the track sheet + the settings row.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { MUSIC_TAXONOMY } from "@/lib/musicTaxonomy";
import { backfillPeaks } from "@/lib/waveform";
import TrackArt from "@/components/TrackArt";
import Waveform from "@/components/Waveform";
import ContributeMusicFlow from "@/components/ContributeMusicFlow";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = "rgba(229,225,219,0.12)";

interface Row {
  id: string; title: string; composer_user_id: string; composer_handle: string | null;
  keywords: string[]; duration_seconds: number | null; file_url: string;
  artwork_url: string | null; waveform_peaks: number[] | null;
}
function fmt(s: number | null): string { if (!s || !isFinite(s)) return ""; const m = Math.floor(s / 60); return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`; }

export default function LibraryPage() {
  const router = useRouter();
  const [tracks, setTracks] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showContribute, setShowContribute] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const { data } = await supabase.from("tracks")
        .select("id, title, composer_user_id, keywords, duration_seconds, file_url, artwork_url, waveform_peaks")
        .eq("status", "approved").order("created_at", { ascending: false }).limit(400);
      const rows = (data ?? []) as Row[];
      const ids = [...new Set(rows.map((r) => r.composer_user_id))];
      const { data: profs } = ids.length ? await supabase.from("profiles").select("user_id, username").in("user_id", ids) : { data: [] as { user_id: string; username: string }[] };
      const handle = new Map((profs ?? []).map((p) => [p.user_id, p.username]));
      if (!dead) setTracks(rows.map((r) => ({ ...r, composer_handle: handle.get(r.composer_user_id) ?? null })));
    })();
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (!tracks) return;
    tracks.forEach((t) => {
      if ((!t.waveform_peaks || t.waveform_peaks.length === 0) && t.file_url) {
        backfillPeaks(t.id, t.file_url).then((p) => { if (p) setTracks((cur) => cur?.map((x) => (x.id === t.id ? { ...x, waveform_peaks: p } : x)) ?? cur); });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks?.length]);

  const toggleChip = (w: string) => setChips((c) => c.includes(w) ? c.filter((x) => x !== w) : [...c, w]);
  const results = useMemo(() => {
    if (!tracks) return [];
    const query = q.trim().toLowerCase();
    return tracks.filter((t) => {
      const kwOk = chips.length === 0 || chips.some((k) => t.keywords.includes(k));
      const qOk = !query || t.title.toLowerCase().includes(query) || (t.composer_handle ?? "").toLowerCase().includes(query);
      return kwOk && qOk;
    });
  }, [tracks, q, chips]);

  const togglePlay = (t: Row) => {
    const a = audioRef.current; if (!a) return;
    if (playing === t.id) { a.pause(); setPlaying(null); return; }
    a.src = t.file_url; setProgress(0);
    a.play().then(() => setPlaying(t.id)).catch(() => setPlaying(null));
  };
  const seekTrack = (t: Row, pct: number) => {
    const a = audioRef.current; if (!a) return;
    setProgress(pct);
    const apply = () => { if (a.duration && isFinite(a.duration)) a.currentTime = pct * a.duration; };
    if (playing === t.id) { apply(); return; }
    a.src = t.file_url;
    a.play().then(() => { setPlaying(t.id); a.addEventListener("loadedmetadata", apply, { once: true }); apply(); }).catch(() => {});
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#E5E1DB", maxWidth: 720, margin: "0 auto" }}>
      <audio ref={audioRef} onEnded={() => { setPlaying(null); setProgress(0); }} onTimeUpdate={() => { const a = audioRef.current; if (a && a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration); }} />

      <div style={{ padding: "34px 20px 12px", borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={() => history.back()} style={{ ...SKR, fontSize: 12, color: "rgba(229,225,219,0.55)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
          <span style={{ ...SKB, fontSize: 11, color: "rgba(229,225,219,0.55)", textTransform: "uppercase", letterSpacing: "0.16em" }}>[ SCOPE ORIGINAL MUSIC LIBRARY ]</span>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search title or composer…" style={{ width: "100%", boxSizing: "border-box", background: "rgba(229,225,219,0.05)", border: "none", outline: "none", ...SKR, fontSize: "max(16px, 13px)", color: "#E5E1DB", padding: "10px 12px" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, maxHeight: 92, overflowY: "auto" }}>
          {MUSIC_TAXONOMY.flatMap((g) => g.words).map((w) => {
            const on = chips.includes(w);
            return <button key={w} onClick={() => toggleChip(w)} style={{ ...SKR, fontSize: 11, color: on ? "#000" : "rgba(229,225,219,0.7)", background: on ? "#E5E1DB" : "transparent", border: `1px solid ${on ? "#E5E1DB" : HAIR}`, padding: "4px 9px", cursor: "pointer", textTransform: "lowercase" }}>{w}</button>;
          })}
        </div>
      </div>

      <div style={{ padding: "6px 20px 40px" }}>
        {tracks === null && <p style={{ ...SKR, fontSize: 13, color: "rgba(229,225,219,0.4)", padding: "20px 0" }}>Loading…</p>}
        {tracks !== null && results.length === 0 && <p style={{ ...SKR, fontSize: 13, color: "rgba(229,225,219,0.4)", padding: "20px 0" }}>No tracks match.</p>}
        {results.map((t) => {
          const isPlaying = playing === t.id;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: `1px solid rgba(229,225,219,0.06)` }}>
              <TrackArt url={t.artwork_url} title={t.title} id={t.id} size={44} />
              <button onClick={() => togglePlay(t)} aria-label={isPlaying ? "Pause" : "Play"} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: `1px solid ${HAIR}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                {isPlaying ? <svg width="11" height="11" viewBox="0 0 24 24" fill="#E5E1DB"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg> : <svg width="11" height="11" viewBox="0 0 24 24" fill="#E5E1DB"><path d="M7 5v14l12-7z" /></svg>}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ ...SKB, fontSize: 13, color: "#E5E1DB", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                  <span style={{ ...SKR, fontSize: 11, color: "rgba(229,225,219,0.4)", flexShrink: 0 }}>{fmt(t.duration_seconds)}</span>
                </div>
                <div style={{ margin: "5px 0 4px" }}><Waveform peaks={t.waveform_peaks} progress={isPlaying ? progress : 0} onSeek={(pct) => seekTrack(t, pct)} height={26} /></div>
                <button onClick={() => t.composer_handle && router.push(`/composer/${t.composer_handle}`)} style={{ ...SKR, fontSize: 11, color: "rgba(229,225,219,0.45)", background: "none", border: "none", cursor: t.composer_handle ? "pointer" : "default", padding: 0 }}>{t.composer_handle ? `@${t.composer_handle}` : ""}</button>
              </div>
            </div>
          );
        })}
        <button onClick={() => setShowContribute(true)} style={{ ...SKB, fontSize: 11, color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em", background: "none", border: "none", cursor: "pointer", padding: "24px 0 0" }}>Contribute to wear the badge →</button>
      </div>

      {showContribute && <ContributeMusicFlow onClose={() => setShowContribute(false)} />}
    </div>
  );
}
