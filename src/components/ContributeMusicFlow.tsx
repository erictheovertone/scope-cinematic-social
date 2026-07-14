// ── ContributeMusicFlow — contribute a track to the Original Music Library ────
// Multi-step: upload audio → title → keywords (2–6 from the taxonomy) → license
// acknowledgment → submit ('pending'). Mobile = bottom takeover sheet; desktop =
// centered modal (same steps, via useIsDesktop). Upload goes through the
// service-role route (/api/music/upload) with XHR progress; the row is created by
// /api/music/submit. The COMPOSER badge lands on the FIRST approval (admin queue).
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId } from "@/lib/userService";
import { useIsDesktop } from "@/lib/useIsDesktop";
import {
  MUSIC_TAXONOMY, KEYWORDS_MIN, KEYWORDS_MAX, TITLE_MAX,
  AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS, AUDIO_MIME_EXT, MUSIC_LICENSE_COPY,
} from "@/lib/musicTaxonomy";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = "rgba(255,255,255,0.12)";
const RED = "#FF0000";

type Step = "upload" | "title" | "keywords" | "license" | "done";

function fmtDuration(s: number): string {
  if (!s || !isFinite(s)) return "";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => { const d = isFinite(el.duration) ? el.duration : 0; try { URL.revokeObjectURL(el.src); } catch {} resolve(d); };
    el.onerror = () => resolve(0);
    el.src = URL.createObjectURL(file);
  });
}

function uploadWithProgress(file: File, userId: string, trackId: string, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/music/upload?userId=${encodeURIComponent(userId)}&trackId=${encodeURIComponent(trackId)}`);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText || "{}");
        if (xhr.status === 200 && r.file_url) resolve(r.file_url as string);
        else reject(new Error(r.error || "upload failed"));
      } catch { reject(new Error("upload failed")); }
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(file);
  });
}

export default function ContributeMusicFlow({ onClose }: { onClose: () => void }) {
  const isDesktop = useIsDesktop();
  const { user } = usePrivy();
  const [userUuid, setUserUuid] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState(0);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [licensed, setLicensed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Resolve the composer's Supabase UUID (the identity tracks are keyed by).
  useEffect(() => {
    if (!user) return;
    let dead = false;
    getUserByPrivyId(user.id).then((u) => { if (!dead && u) setUserUuid(u.id); }).catch(() => {});
    return () => { dead = true; };
  }, [user?.id]);

  // Slide-up (mobile) + footer-pill takeover (mobile only).
  useEffect(() => {
    const r = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(r);
  }, []);
  useEffect(() => {
    if (isDesktop) return;
    document.documentElement.dataset.suiteOpen = "1";
    window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    return () => { delete document.documentElement.dataset.suiteOpen; window.dispatchEvent(new CustomEvent("scope:takeover-change")); };
  }, [isDesktop]);

  const close = () => { setVisible(false); setTimeout(onClose, isDesktop ? 0 : 240); };

  const onPickFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    const mime = (file.type || "").toLowerCase();
    if (!AUDIO_MIME_EXT[mime]) { setError("Use an MP3, AAC, or WAV file."); return; }
    if (file.size > AUDIO_MAX_BYTES) { setError("File too large — max 15MB."); return; }
    const dur = await readAudioDuration(file);
    if (dur > AUDIO_MAX_SECONDS + 5) { setError("Track too long — max ~6 minutes."); return; }
    if (!userUuid) { setError("Sign in to contribute."); return; }
    setFileName(file.name);
    setDuration(dur);
    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setTrackId(id);
    setUploading(true); setProgress(0);
    try {
      const url = await uploadWithProgress(file, userUuid, id, setProgress);
      setFileUrl(url);
      setStep("title");
    } catch {
      setError("Upload failed — try again.");
      setTrackId(null);
    } finally {
      setUploading(false);
    }
  };

  const toggleKeyword = (w: string) => {
    setKeywords((cur) => cur.includes(w) ? cur.filter((x) => x !== w) : (cur.length >= KEYWORDS_MAX ? cur : [...cur, w]));
  };

  const submit = async () => {
    if (!userUuid || !trackId || !fileUrl) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/music/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: trackId, userId: userUuid, title: title.trim(), keywords, durationSeconds: Math.round(duration), fileUrl }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.error || "submit failed");
      setStep("done");
    } catch {
      setError("Couldn't submit — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const canTitle = title.trim().length > 0 && title.trim().length <= TITLE_MAX;
  const canKeywords = keywords.length >= KEYWORDS_MIN && keywords.length <= KEYWORDS_MAX;

  // ── Step bodies (shared across mobile/desktop) ─────────────────────────────
  const Body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ ...SKB, fontSize: "var(--fs-11)", color: "#FFF", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {step === "done" ? "Submitted" : "Contribute Music"}
        </span>
        <button onClick={close} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", ...SKR, fontSize: 20, color: "rgba(255,255,255,0.55)", lineHeight: 1, padding: 4 }}>✕</button>
      </div>

      {step === "upload" && (
        <>
          <div
            onClick={() => !uploading && fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (!uploading) onPickFile(e.dataTransfer.files?.[0]); }}
            style={{ border: `1px dashed ${HAIR}`, padding: "34px 18px", textAlign: "center", cursor: uploading ? "default" : "pointer", background: "rgba(255,255,255,0.02)" }}
          >
            {uploading ? (
              <>
                <p style={{ ...SKB, fontSize: "var(--fs-10)", color: "#FFF", margin: "0 0 10px", letterSpacing: "0.06em" }}>UPLOADING… {progress}%</p>
                <div style={{ height: 3, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: RED, transition: "width 120ms linear" }} />
                </div>
              </>
            ) : (
              <>
                <p style={{ ...SKB, fontSize: "var(--fs-10)", color: "#FFF", margin: "0 0 6px", letterSpacing: "0.06em" }}>DROP AUDIO OR TAP TO CHOOSE</p>
                <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.4)", margin: 0 }}>MP3 · AAC · WAV — up to 15MB, ~6 min</p>
              </>
            )}
          </div>
          <input ref={fileInput} type="file" accept="audio/mpeg,audio/aac,audio/mp4,audio/x-m4a,audio/wav,audio/*" hidden onChange={(e) => onPickFile(e.target.files?.[0])} />
        </>
      )}

      {step === "title" && (
        <>
          <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.4)", margin: 0 }}>{fileName} · {fmtDuration(duration)}</p>
          <div>
            <label style={{ ...SKB, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 8 }}>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder="name this track"
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", borderBottom: `1px solid rgba(255,255,255,0.18)`, outline: "none", ...SKR, fontSize: "max(16px, var(--fs-11))", color: "#FFF", padding: "6px 0" }}
            />
            <p style={{ ...SKR, fontSize: "var(--fs-7)", color: "rgba(255,255,255,0.3)", margin: "6px 0 0", textAlign: "right" }}>{title.trim().length}/{TITLE_MAX}</p>
          </div>
          <StepNav onBack={() => setStep("upload")} onNext={() => setStep("keywords")} nextLabel="Keywords" nextDisabled={!canTitle} />
        </>
      )}

      {step === "keywords" && (
        <>
          <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.4)", margin: 0 }}>Pick {KEYWORDS_MIN}–{KEYWORDS_MAX} that fit — {keywords.length} selected</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: isDesktop ? 340 : "42vh", overflowY: "auto" }}>
            {MUSIC_TAXONOMY.map((group) => (
              <div key={group.label}>
                <p style={{ ...SKB, fontSize: "var(--fs-7)", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 8px" }}>{group.label}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {group.words.map((w) => {
                    const on = keywords.includes(w);
                    return (
                      <button
                        key={w}
                        onClick={() => toggleKeyword(w)}
                        style={{ ...SKR, fontSize: "var(--fs-8)", color: on ? "#000" : "#FFF", background: on ? "#FFF" : "transparent", border: `1px solid ${on ? "#FFF" : HAIR}`, padding: "6px 11px", cursor: "pointer", textTransform: "lowercase", letterSpacing: "0.02em" }}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <StepNav onBack={() => setStep("title")} onNext={() => setStep("license")} nextLabel="Review" nextDisabled={!canKeywords} />
        </>
      )}

      {step === "license" && (
        <>
          <label style={{ ...SKB, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.12em" }}>License</label>
          <p style={{ ...SKR, fontSize: "var(--fs-9)", color: "rgba(255,255,255,0.65)", lineHeight: 1.5, margin: 0 }}>{MUSIC_LICENSE_COPY}</p>
          <button onClick={() => setLicensed((v) => !v)} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
            <span style={{ width: 18, height: 18, flexShrink: 0, border: `1px solid ${licensed ? RED : "rgba(255,255,255,0.4)"}`, background: licensed ? RED : "transparent", display: "flex", alignItems: "center", justifyContent: "center", ...SKB, fontSize: 12, color: "#000" }}>{licensed ? "✓" : ""}</span>
            <span style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.7)" }}>I own this music and agree to the license above.</span>
          </button>
          <StepNav onBack={() => setStep("keywords")} onNext={submit} nextLabel={submitting ? "Submitting…" : "Submit"} nextDisabled={!licensed || submitting} />
        </>
      )}

      {step === "done" && (
        <div style={{ padding: "8px 0 6px" }}>
          <p style={{ ...SKB, fontSize: "var(--fs-11)", color: "#FFF", margin: "0 0 8px", letterSpacing: "0.04em" }}>Submitted for review</p>
          <p style={{ ...SKR, fontSize: "var(--fs-9)", color: "rgba(255,255,255,0.5)", lineHeight: 1.5, margin: "0 0 20px" }}>You&rsquo;ll be notified when it&rsquo;s approved. Approved contributors earn the COMPOSER badge.</p>
          <button onClick={close} style={{ ...SKB, width: "100%", fontSize: "var(--fs-10)", color: "#FFF", textTransform: "uppercase", letterSpacing: "0.08em", background: "transparent", border: `1px solid ${HAIR}`, cursor: "pointer", padding: "13px 0" }}>Done</button>
        </div>
      )}

      {error && <p style={{ ...SKR, fontSize: "var(--fs-8)", color: RED, margin: 0 }}>{error}</p>}
    </div>
  );

  // ── Shells ─────────────────────────────────────────────────────────────────
  if (isDesktop) {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 680, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.9)" }} />
        <div style={{ position: "relative", width: 520, maxWidth: "100%", maxHeight: "84vh", overflowY: "auto", background: "#000", border: `1px solid ${HAIR}`, boxSizing: "border-box", padding: "28px 30px" }}>
          {Body}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.7)", opacity: visible ? 1 : 0, transition: "opacity 240ms ease" }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 501, maxWidth: "30rem", margin: "0 auto", background: "#000", borderTop: `1px solid ${HAIR}`, padding: "16px 20px calc(28px + env(safe-area-inset-bottom))", maxHeight: "88vh", overflowY: "auto", transform: visible ? "translateY(0)" : "translateY(100%)", transition: "transform 240ms cubic-bezier(0.32,0.72,0,1)" }}>
        {Body}
      </div>
    </>,
    document.body,
  );
}

function StepNav({ onBack, onNext, nextLabel, nextDisabled }: { onBack: () => void; onNext: () => void; nextLabel: string; nextDisabled?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
      <button onClick={onBack} style={{ ...SKB, fontSize: "var(--fs-9)", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
      <button onClick={onNext} disabled={nextDisabled} style={{ ...SKB, fontSize: "var(--fs-9)", color: nextDisabled ? "rgba(255,255,255,0.25)" : "#FFF", textTransform: "uppercase", letterSpacing: "0.08em", background: "none", border: "none", cursor: nextDisabled ? "default" : "pointer", padding: 0 }}>{nextLabel} →</button>
    </div>
  );
}
