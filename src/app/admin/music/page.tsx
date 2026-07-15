// ── /admin/music — the Original Music Library approval queue (Eric-only) ─────
// Pending tracks GROUPED BY COMPOSER (a batch reads as a cluster). Inline audio
// preview per track; APPROVE / REJECT per track PLUS APPROVE ALL / REJECT ALL per
// cluster (review a cue pack in one sitting). A batch decision is one route call →
// ONE aggregated notification ("N of your tracks were approved"). Gated by the
// service-role route (caller's Privy DID must equal SCOPE_ADMIN_USER_ID).
//
// Grouping key = COMPOSER (not a submission id) — the schema is unchanged; a
// composer's pending tracks read as their cluster, which is what "review a batch"
// means for the admin.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import TrackArt from "@/components/TrackArt";
import Waveform from "@/components/Waveform";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = "rgba(255,255,255,0.12)";

interface PendingTrack {
  id: string;
  title: string;
  composer_user_id: string;
  composer_handle: string | null;
  keywords: string[];
  duration_seconds: number | null;
  file_url: string;
  artwork_url: string | null;
  waveform_peaks: number[] | null;
  created_at: string;
}

function fmt(s: number | null): string {
  if (!s || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

export default function AdminMusicPage() {
  const { user, ready } = usePrivy();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tracks, setTracks] = useState<PendingTrack[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/music/admin?adminUserId=${encodeURIComponent(user.id)}`);
      if (res.status === 403) { setAuthed(false); return; }
      setAuthed(true);
      const r = await res.json();
      setTracks((r.tracks ?? []) as PendingTrack[]);
    } catch { setAuthed(true); setTracks([]); }
  }, [user?.id]);

  useEffect(() => { if (ready && user) void load(); }, [ready, user?.id, load]);

  // Group pending tracks by composer, preserving arrival order.
  const clusters = useMemo(() => {
    const map = new Map<string, { composer_user_id: string; composer_handle: string | null; tracks: PendingTrack[] }>();
    for (const t of tracks ?? []) {
      const g = map.get(t.composer_user_id) ?? { composer_user_id: t.composer_user_id, composer_handle: t.composer_handle, tracks: [] };
      g.tracks.push(t);
      map.set(t.composer_user_id, g);
    }
    return [...map.values()];
  }, [tracks]);

  const act = async (trackIds: string[], action: "approve" | "reject", busyKey: string) => {
    if (!user || trackIds.length === 0) return;
    setBusy(busyKey);
    try {
      await fetch("/api/music/admin", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminUserId: user.id, trackIds, action }),
      });
      const done = new Set(trackIds);
      setTracks((t) => (t ?? []).filter((x) => !done.has(x.id)));
    } finally { setBusy(null); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#FFF", padding: "40px 20px 80px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ ...SKB, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 24px" }}>Music · Approval Queue</h1>

      {ready && !user && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Sign in to continue.</p>}
      {authed === false && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Not authorized.</p>}
      {authed === true && tracks === null && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Loading…</p>}
      {authed === true && tracks?.length === 0 && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No pending tracks.</p>}

      {authed === true && clusters.map((c) => {
        const ids = c.tracks.map((t) => t.id);
        const batchKey = `batch-${c.composer_user_id}`;
        return (
          <div key={c.composer_user_id} style={{ border: `1px solid ${HAIR}`, marginBottom: 22, padding: "16px 16px 8px" }}>
            {/* cluster header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <span style={{ ...SKB, fontSize: 13, letterSpacing: "0.04em" }}>
                {c.composer_handle ? `@${c.composer_handle}` : c.composer_user_id.slice(0, 8)}
                <span style={{ ...SKR, fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{c.tracks.length} pending</span>
              </span>
              {c.tracks.length > 1 && (
                <div style={{ display: "flex", gap: 14 }}>
                  <button onClick={() => act(ids, "approve", batchKey)} disabled={busy === batchKey} style={{ ...SKB, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#FFF", background: "transparent", border: "1px solid rgba(255,255,255,0.4)", cursor: "pointer", padding: "6px 12px" }}>Approve all</button>
                  <button onClick={() => act(ids, "reject", batchKey)} disabled={busy === batchKey} style={{ ...SKB, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#FF0000", background: "transparent", border: "1px solid rgba(255,0,0,0.5)", cursor: "pointer", padding: "6px 12px" }}>Reject all</button>
                </div>
              )}
            </div>

            {/* per-track rows */}
            {c.tracks.map((t) => (
              <div key={t.id} style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, padding: "14px 0", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TrackArt url={t.artwork_url} title={t.title} id={t.id} size={40} />
                  <div style={{ flex: 1, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
                    <span style={{ ...SKB, fontSize: 13.5 }}>{t.title}</span>
                    <span style={{ ...SKR, fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{fmt(t.duration_seconds)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {t.keywords.map((k) => (
                    <span key={k} style={{ ...SKR, fontSize: 11, color: "rgba(255,255,255,0.55)", border: `1px solid ${HAIR}`, padding: "3px 8px" }}>{k}</span>
                  ))}
                </div>
                <Waveform peaks={t.waveform_peaks} height={30} />
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio src={t.file_url} controls preload="none" style={{ width: "100%", height: 34 }} />
                <div style={{ display: "flex", gap: 20 }}>
                  <button onClick={() => act([t.id], "approve", t.id)} disabled={busy === t.id} style={{ ...SKB, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FFF", background: "transparent", border: "1px solid rgba(255,255,255,0.4)", cursor: "pointer", padding: "8px 18px" }}>Approve</button>
                  <button onClick={() => act([t.id], "reject", t.id)} disabled={busy === t.id} style={{ ...SKB, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FF0000", background: "transparent", border: "1px solid rgba(255,0,0,0.5)", cursor: "pointer", padding: "8px 18px" }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
