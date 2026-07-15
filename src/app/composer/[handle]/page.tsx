// ── /composer/[handle] — the DISCOGRAPHY page (the composer badge's door) ────
// A bio-sheet-class surface: a composer's approved contributions. Linkable/
// shareable (a real route — composers share these). All data from tracks
// (status='approved', composer_user_id) + a posts join for usage counts; no new
// schema. Zero approved tracks = no badge = unreachable by design → a quiet
// "no discography" state if the URL is hit directly.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { supabase } from "@/lib/supabase/client";
import { feedImage } from "@/lib/mediaUrl";
import { getUserByPrivyId } from "@/lib/userService";
import ContributeMusicFlow from "@/components/ContributeMusicFlow";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = "rgba(255,255,255,0.12)";
const RED = "#FF0000";

interface Track {
  id: string;
  title: string;
  keywords: string[];
  duration_seconds: number | null;
  file_url: string;
  approved_at: string | null;
  created_at: string;
}
interface Profile {
  user_id: string;
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
}

function fmt(s: number | null): string {
  if (!s || !isFinite(s)) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

export default function ComposerDiscographyPage() {
  const params = useParams<{ handle: string }>();
  const handle = decodeURIComponent(String(params?.handle ?? ""));
  const router = useRouter();
  const { user } = usePrivy();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [inPostsTotal, setInPostsTotal] = useState(0);
  const [inPostsByTrack, setInPostsByTrack] = useState<Map<string, number>>(new Map());
  const [viewerIsComposer, setViewerIsComposer] = useState<boolean | null>(null);
  const [viewerIsOwner, setViewerIsOwner] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [showContribute, setShowContribute] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load the composer + their approved catalog + usage counts.
  useEffect(() => {
    if (!handle) return;
    let dead = false;
    (async () => {
      const { data: p } = await supabase
        .from("profiles").select("user_id, username, display_name, profile_image_url")
        .eq("username", handle).maybeSingle();
      if (dead) return;
      if (!p) { setProfile(null); setTracks([]); return; }
      setProfile(p as Profile);

      const { data: tk } = await supabase
        .from("tracks").select("id, title, keywords, duration_seconds, file_url, approved_at, created_at")
        .eq("composer_user_id", (p as Profile).user_id).eq("status", "approved")
        .order("created_at", { ascending: false });
      const rows = (tk ?? []) as Track[];
      if (dead) return;
      setTracks(rows);
      if (rows.length === 0) return;

      // IN POSTS — one indexed query over posts.music_track_id (FK-indexed via M1).
      // Counted client-side per track; cheap for the current library. Cache if it
      // ever grows heavy (report): a stored per-track usage counter would replace it.
      const ids = rows.map((r) => r.id);
      const { data: posts } = await supabase.from("posts").select("music_track_id").in("music_track_id", ids);
      if (dead) return;
      const map = new Map<string, number>();
      for (const po of posts ?? []) {
        const k = (po as { music_track_id?: string | null }).music_track_id;
        if (k) map.set(k, (map.get(k) ?? 0) + 1);
      }
      setInPostsByTrack(map);
      setInPostsTotal((posts ?? []).length);
    })();
    return () => { dead = true; };
  }, [handle]);

  // Viewer's composer status (drives the non-composer CTA) + owner check.
  useEffect(() => {
    if (!user) { setViewerIsComposer(false); setViewerIsOwner(false); return; }
    let dead = false;
    getUserByPrivyId(user.id).then(async (u) => {
      if (dead || !u) { setViewerIsComposer(false); return; }
      if (profile && u.id === profile.user_id) setViewerIsOwner(true);
      const { count } = await supabase.from("tracks").select("id", { count: "exact", head: true }).eq("composer_user_id", u.id).eq("status", "approved");
      if (!dead) setViewerIsComposer((count ?? 0) > 0);
    }).catch(() => { if (!dead) setViewerIsComposer(false); });
    return () => { dead = true; };
  }, [user?.id, profile?.user_id]);

  const joinedYear = useMemo(() => {
    if (!tracks || tracks.length === 0) return null;
    const times = tracks.map((t) => (t.approved_at ? new Date(t.approved_at).getTime() : NaN)).filter((n) => isFinite(n));
    return times.length ? new Date(Math.min(...times)).getFullYear() : null;
  }, [tracks]);

  const togglePlay = (t: Track) => {
    const a = audioRef.current;
    if (!a) return;
    if (playing === t.id) { a.pause(); setPlaying(null); return; }
    a.src = t.file_url;
    a.play().then(() => setPlaying(t.id)).catch(() => setPlaying(null));
  };

  // Zero approved tracks (or unknown handle) — unreachable by design; a quiet state.
  const empty = tracks !== null && tracks.length === 0;

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#FFF" }}>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} />

      {/* ── BANNER — album-art-style blurred underlay + sharp portrait ─────────
          (No standalone banner component exists to import — the profile header is
          inline in the profile pages — so the treatment is replicated here.) */}
      <div style={{ position: "relative", overflow: "hidden", padding: "40px 20px 22px", maxWidth: 720, margin: "0 auto" }}>
        {profile?.profile_image_url && (
          <>
            <img src={feedImage(profile.profile_image_url, 400)} alt="" aria-hidden style={{ position: "absolute", inset: "-40px", width: "calc(100% + 80px)", height: "calc(100% + 80px)", objectFit: "cover", filter: "blur(34px) brightness(0.5)", transform: "scale(1.15)" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.9))" }} />
          </>
        )}
        <button onClick={() => history.back()} style={{ position: "relative", ...SKR, fontSize: 12, color: "rgba(255,255,255,0.55)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18 }}>← Back</button>
        <div style={{ position: "relative", display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 84, height: 84, flexShrink: 0, overflow: "hidden", background: "#222" }}>
            {profile?.profile_image_url && <img src={feedImage(profile.profile_image_url, 200)} alt={handle} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ ...SKB, fontSize: 11, color: RED, textTransform: "uppercase", letterSpacing: "0.22em", margin: "2px 0 6px" }}>COMPOSER</p>
            <p style={{ ...SKB, fontSize: 20, color: "#FFF", margin: "0 0 2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.display_name || handle}</p>
            <button onClick={() => router.push(`/profile/${handle}`)} style={{ ...SKR, fontSize: 12, color: "rgba(255,255,255,0.5)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>@{handle}</button>
          </div>
        </div>

        {/* composer stats column */}
        {!empty && (
          <div style={{ position: "relative", display: "flex", gap: 28, marginTop: 20 }}>
            <Stat label="Tracks" value={tracks ? String(tracks.length) : "—"} />
            <Stat label="In posts" value={String(inPostsTotal)} />
            <Stat label="Joined the library" value={joinedYear ? String(joinedYear) : "—"} />
          </div>
        )}
      </div>

      {/* ── TRACKLIST ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "4px 20px 60px" }}>
        {tracks === null && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "20px 0" }}>Loading…</p>}
        {empty && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "20px 0" }}>No discography yet.</p>}

        {tracks?.map((t) => {
          const isPlaying = playing === t.id;
          const inN = inPostsByTrack.get(t.id) ?? 0;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 0", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
              <button onClick={() => togglePlay(t)} aria-label={isPlaying ? "Pause" : "Play"} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: `1px solid ${HAIR}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                {isPlaying
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFF"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFF"><path d="M7 5v14l12-7z" /></svg>}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ ...SKB, fontSize: 14, color: "#FFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                  <span style={{ ...SKR, fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{fmt(t.duration_seconds)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  {t.keywords.slice(0, 4).map((k) => (
                    <span key={k} style={{ ...SKR, fontSize: 10.5, color: "rgba(255,255,255,0.4)", border: `1px solid ${HAIR}`, padding: "2px 7px" }}>{k}</span>
                  ))}
                  {inN > 0 && <span style={{ ...SKR, fontSize: 10.5, color: "rgba(255,255,255,0.3)" }}>in {inN} {inN === 1 ? "post" : "posts"}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FOOTER — the bracket line + the non-composer recruitment CTA ──────── */}
      {!empty && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 80px", display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
          {/* Interim: until M3's standalone library surface ships, the bracket line
              opens the contribution flow. Report: swap to the library route in M3. */}
          <button onClick={() => setShowContribute(true)} style={{ ...SKB, fontSize: 12, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.16em", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            [ SCOPE ORIGINAL MUSIC LIBRARY ]
          </button>
          {viewerIsComposer === false && !viewerIsOwner && (
            <button onClick={() => setShowContribute(true)} style={{ ...SKB, fontSize: 12, color: RED, textTransform: "uppercase", letterSpacing: "0.06em", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              Contribute to wear the badge →
            </button>
          )}
        </div>
      )}

      {showContribute && <ContributeMusicFlow onClose={() => setShowContribute(false)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ ...SKB, fontSize: 17, color: "#FFF", margin: "0 0 3px", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p style={{ ...SKR, fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>{label}</p>
    </div>
  );
}
