// ── /admin/music — the Original Music Library approval queue (Eric-only) ─────
// Lists pending tracks with an inline play preview → APPROVE / REJECT. Gated by
// the service-role route (/api/music/admin), which checks the caller's Privy DID
// against SCOPE_ADMIN_USER_ID. A non-admin gets a 403 → "not authorized".
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

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
    } catch {
      setAuthed(true);
      setTracks([]);
    }
  }, [user?.id]);

  useEffect(() => { if (ready && user) void load(); }, [ready, user?.id, load]);

  const act = async (trackId: string, action: "approve" | "reject") => {
    if (!user) return;
    setBusy(trackId);
    try {
      await fetch("/api/music/admin", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminUserId: user.id, trackId, action }),
      });
      setTracks((t) => (t ?? []).filter((x) => x.id !== trackId));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#FFF", padding: "40px 20px 80px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ ...SKB, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 24px" }}>Music · Approval Queue</h1>

      {ready && !user && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Sign in to continue.</p>}
      {authed === false && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Not authorized.</p>}
      {authed === true && tracks === null && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Loading…</p>}
      {authed === true && tracks?.length === 0 && <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No pending tracks.</p>}

      {authed === true && tracks?.map((t) => (
        <div key={t.id} style={{ borderBottom: `1px solid ${HAIR}`, padding: "18px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
            <span style={{ ...SKB, fontSize: 14, letterSpacing: "0.02em" }}>{t.title}</span>
            <span style={{ ...SKR, fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{fmt(t.duration_seconds)}</span>
          </div>
          <span style={{ ...SKR, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            by {t.composer_handle ? `@${t.composer_handle}` : t.composer_user_id.slice(0, 8)}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {t.keywords.map((k) => (
              <span key={k} style={{ ...SKR, fontSize: 11, color: "rgba(255,255,255,0.55)", border: `1px solid ${HAIR}`, padding: "3px 8px" }}>{k}</span>
            ))}
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={t.file_url} controls preload="none" style={{ width: "100%", height: 34 }} />
          <div style={{ display: "flex", gap: 20, marginTop: 2 }}>
            <button onClick={() => act(t.id, "approve")} disabled={busy === t.id}
              style={{ ...SKB, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FFF", background: "transparent", border: "1px solid rgba(255,255,255,0.4)", cursor: busy === t.id ? "default" : "pointer", padding: "9px 20px" }}>
              Approve
            </button>
            <button onClick={() => act(t.id, "reject")} disabled={busy === t.id}
              style={{ ...SKB, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FF0000", background: "transparent", border: "1px solid rgba(255,0,0,0.5)", cursor: busy === t.id ? "default" : "pointer", padding: "9px 20px" }}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
