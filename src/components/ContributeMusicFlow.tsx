// ── ContributeMusicFlow — BATCH contribution (up to 12 tracks) ───────────────
// Extends M1: the upload step accepts MULTIPLE files (multi-select + drag-multiple),
// uploads run in PARALLEL with per-file progress + retry (a failed file never sinks
// the batch), then a METADATA TABLE (title prefilled from the filename + per-row
// keyword chips + APPLY-TO-ALL), ONE license acknowledgment, submit → each lands as
// its own 'pending' tracks row (schema unchanged). Uploaded-but-unsubmitted files
// are cleaned up on abandon so orphaned storage can't accumulate.
// Mobile = bottom takeover sheet; desktop = centered modal (useIsDesktop).
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
const BATCH_CAP = 12;

type Step = "upload" | "table" | "license" | "done";
type RowStatus = "uploading" | "done" | "failed";

interface Row {
  localId: string;
  file: File;
  fileName: string;
  trackId: string;
  title: string;
  keywords: string[];
  duration: number;
  fileUrl: string | null;
  status: RowStatus;
  progress: number;
}

function cleanTitle(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}
function fmtDuration(s: number): string {
  if (!s || !isFinite(s)) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
      try { const r = JSON.parse(xhr.responseText || "{}"); if (xhr.status === 200 && r.file_url) resolve(r.file_url as string); else reject(new Error(r.error || "upload failed")); }
      catch { reject(new Error("upload failed")); }
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
  const [rows, setRows] = useState<Row[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null); // per-row keyword editor
  const [licensed, setLicensed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Refs for the abandon-cleanup path (unmount reads current values).
  const rowsRef = useRef<Row[]>([]);
  const submittedRef = useRef(false);
  const userUuidRef = useRef<string | null>(null);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => { userUuidRef.current = userUuid; }, [userUuid]);

  const patchRow = (localId: string, patch: Partial<Row>) =>
    setRows((cur) => cur.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));

  useEffect(() => {
    if (!user) return;
    let dead = false;
    getUserByPrivyId(user.id).then((u) => { if (!dead && u) setUserUuid(u.id); }).catch(() => {});
    return () => { dead = true; };
  }, [user?.id]);

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

  // Abandon cleanup — best-effort delete of uploaded-but-unsubmitted audio.
  const cleanupUnsubmitted = () => {
    if (submittedRef.current) return;
    const urls = rowsRef.current.filter((r) => r.fileUrl).map((r) => r.fileUrl!) as string[];
    const uid = userUuidRef.current;
    if (!urls.length || !uid) return;
    fetch("/api/music/upload", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: uid, fileUrls: urls }), keepalive: true }).catch(() => {});
  };
  useEffect(() => () => cleanupUnsubmitted(), []); // unmount backstop

  const close = () => { cleanupUnsubmitted(); setVisible(false); setTimeout(onClose, isDesktop ? 0 : 240); };

  // ── Upload orchestration ───────────────────────────────────────────────────
  const startUpload = async (row: Row) => {
    const uid = userUuidRef.current ?? userUuid;
    if (!uid) { patchRow(row.localId, { status: "failed" }); return; }
    patchRow(row.localId, { status: "uploading", progress: 0 });
    try {
      const url = await uploadWithProgress(row.file, uid, row.trackId, (p) => patchRow(row.localId, { progress: p }));
      patchRow(row.localId, { fileUrl: url, status: "done" });
    } catch {
      patchRow(row.localId, { status: "failed" });
    }
  };

  const addFiles = async (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    setError(null);
    const list = Array.from(files);
    const room = BATCH_CAP - rows.length;
    if (room <= 0) { setError(`Max ${BATCH_CAP} per submission — remove one to add more.`); return; }
    const accepted: Row[] = [];
    for (const file of list.slice(0, room)) {
      const mime = (file.type || "").toLowerCase();
      if (!AUDIO_MIME_EXT[mime]) { setError("Use MP3, AAC, or WAV files."); continue; }
      if (file.size > AUDIO_MAX_BYTES) { setError(`${file.name}: too large (max 15MB).`); continue; }
      const dur = await readAudioDuration(file);
      if (dur > AUDIO_MAX_SECONDS + 5) { setError(`${file.name}: too long (max ~6 min).`); continue; }
      accepted.push({
        localId: newId(), file, fileName: file.name, trackId: newId(),
        title: cleanTitle(file.name), keywords: [], duration: dur,
        fileUrl: null, status: "uploading", progress: 0,
      });
    }
    if (list.length > room) setError(`Only ${room} more allowed (max ${BATCH_CAP} per submission).`);
    if (accepted.length === 0) return;
    setRows((cur) => [...cur, ...accepted]);
    accepted.forEach((r) => void startUpload(r));
  };

  const removeRow = (localId: string) => {
    const row = rowsRef.current.find((r) => r.localId === localId);
    // Delete its uploaded object (best effort) so it doesn't orphan.
    if (row?.fileUrl && userUuidRef.current) {
      fetch("/api/music/upload", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: userUuidRef.current, fileUrls: [row.fileUrl] }), keepalive: true }).catch(() => {});
    }
    setRows((cur) => cur.filter((r) => r.localId !== localId));
    setExpanded((e) => (e === localId ? null : e));
  };

  const toggleChip = (localId: string, w: string) =>
    setRows((cur) => cur.map((r) => {
      if (r.localId !== localId) return r;
      const has = r.keywords.includes(w);
      if (has) return { ...r, keywords: r.keywords.filter((x) => x !== w) };
      if (r.keywords.length >= KEYWORDS_MAX) return r;
      return { ...r, keywords: [...r.keywords, w] };
    }));

  const applyKeywordsToAll = (localId: string) => {
    const src = rowsRef.current.find((r) => r.localId === localId);
    if (!src) return;
    setRows((cur) => cur.map((r) => ({ ...r, keywords: [...src.keywords] })));
  };

  const uploading = rows.some((r) => r.status === "uploading");
  const doneRows = rows.filter((r) => r.status === "done");
  const failedRows = rows.filter((r) => r.status === "failed");
  const rowReady = (r: Row) => r.title.trim().length > 0 && r.keywords.length >= KEYWORDS_MIN && r.keywords.length <= KEYWORDS_MAX;
  const allReady = doneRows.length > 0 && doneRows.every(rowReady);

  const submitAll = async () => {
    if (!userUuid || submitting) return;
    setSubmitting(true); setError(null);
    const targets = rowsRef.current.filter((r) => r.status === "done" && r.fileUrl);
    let anyFail = false;
    await Promise.all(targets.map(async (r) => {
      try {
        const res = await fetch("/api/music/submit", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: r.trackId, userId: userUuid, title: r.title.trim(), keywords: r.keywords, durationSeconds: Math.round(r.duration), fileUrl: r.fileUrl }),
        });
        if (!res.ok) anyFail = true;
      } catch { anyFail = true; }
    }));
    submittedRef.current = true; // committed — do NOT clean these files up on close
    setSubmitting(false);
    if (anyFail) { setError("Some tracks didn't submit — try again."); return; }
    setStep("done");
  };

  // ── Step bodies ────────────────────────────────────────────────────────────
  const Body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ ...SKB, fontSize: "var(--fs-11)", color: "#FFF", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {step === "done" ? "Submitted" : "Contribute Music"}
        </span>
        <button onClick={close} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", ...SKR, fontSize: 20, color: "rgba(255,255,255,0.55)", lineHeight: 1, padding: 4 }}>✕</button>
      </div>

      {step === "upload" && (
        <>
          <div
            onClick={() => rows.length < BATCH_CAP && fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            style={{ border: `1px dashed ${HAIR}`, padding: "26px 18px", textAlign: "center", cursor: rows.length < BATCH_CAP ? "pointer" : "default", background: "rgba(255,255,255,0.02)" }}
          >
            <p style={{ ...SKB, fontSize: "var(--fs-10)", color: "#FFF", margin: "0 0 6px", letterSpacing: "0.06em" }}>DROP AUDIO OR TAP TO CHOOSE</p>
            <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.4)", margin: 0 }}>MP3 · AAC · WAV — up to 15MB, ~6 min · {rows.length}/{BATCH_CAP}</p>
          </div>
          <input ref={fileInput} type="file" multiple accept="audio/mpeg,audio/aac,audio/mp4,audio/x-m4a,audio/wav,audio/*" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

          {rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: isDesktop ? 300 : "38vh", overflowY: "auto" }}>
              {rows.map((r) => (
                <div key={r.localId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: `1px solid ${r.status === "failed" ? "rgba(255,0,0,0.4)" : HAIR}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "#FFF", margin: "0 0 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.fileName}</p>
                    {r.status === "uploading" && (
                      <div style={{ height: 3, background: "rgba(255,255,255,0.12)" }}><div style={{ height: "100%", width: `${r.progress}%`, background: RED, transition: "width 120ms linear" }} /></div>
                    )}
                    {r.status === "done" && <span style={{ ...SKR, fontSize: "var(--fs-7)", color: "rgba(255,255,255,0.4)" }}>DONE · {fmtDuration(r.duration)}</span>}
                    {r.status === "failed" && <span style={{ ...SKR, fontSize: "var(--fs-7)", color: RED }}>FAILED</span>}
                  </div>
                  {r.status === "failed" && (
                    <button onClick={() => void startUpload(r)} style={{ ...SKB, fontSize: "var(--fs-7)", color: "#FFF", background: "transparent", border: `1px solid ${HAIR}`, cursor: "pointer", padding: "4px 9px", textTransform: "uppercase" }}>Retry</button>
                  )}
                  <button onClick={() => removeRow(r.localId)} aria-label="Remove" style={{ background: "none", border: "none", cursor: "pointer", ...SKR, fontSize: 16, color: "rgba(255,255,255,0.4)", lineHeight: 1, padding: 2 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setStep("table")}
                disabled={uploading || doneRows.length === 0}
                style={{ ...SKB, fontSize: "var(--fs-9)", color: (uploading || doneRows.length === 0) ? "rgba(255,255,255,0.25)" : "#FFF", textTransform: "uppercase", letterSpacing: "0.08em", background: "none", border: "none", cursor: (uploading || doneRows.length === 0) ? "default" : "pointer", padding: 0 }}
              >
                {uploading ? "Uploading…" : `Details (${doneRows.length}) →`}
              </button>
            </div>
          )}
          {failedRows.length > 0 && !uploading && <p style={{ ...SKR, fontSize: "var(--fs-7)", color: "rgba(255,255,255,0.4)", margin: 0 }}>Failed files are skipped unless retried.</p>}
        </>
      )}

      {step === "table" && (
        <>
          <p style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.4)", margin: 0 }}>Title each track and pick {KEYWORDS_MIN}–{KEYWORDS_MAX} keywords.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: isDesktop ? 380 : "50vh", overflowY: "auto" }}>
            {doneRows.map((r) => {
              const open = expanded === r.localId;
              const ok = rowReady(r);
              return (
                <div key={r.localId} style={{ border: `1px solid ${ok ? HAIR : "rgba(255,0,0,0.35)"}`, padding: "10px 12px" }}>
                  <input
                    value={r.title}
                    onChange={(e) => patchRow(r.localId, { title: e.target.value.slice(0, TITLE_MAX) })}
                    placeholder="track title"
                    style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", borderBottom: `1px solid rgba(255,255,255,0.18)`, outline: "none", ...SKR, fontSize: "max(16px, var(--fs-9))", color: "#FFF", padding: "4px 0" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                    <span style={{ ...SKR, fontSize: "var(--fs-7)", color: r.keywords.length >= KEYWORDS_MIN ? "rgba(255,255,255,0.5)" : "rgba(255,0,0,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.keywords.length ? r.keywords.join(" · ") : "no keywords yet"} ({r.keywords.length}/{KEYWORDS_MAX})
                    </span>
                    <button onClick={() => setExpanded(open ? null : r.localId)} style={{ flexShrink: 0, ...SKB, fontSize: "var(--fs-7)", color: "#FFF", background: "transparent", border: `1px solid ${HAIR}`, cursor: "pointer", padding: "4px 9px", textTransform: "uppercase" }}>{open ? "Done" : "Keywords"}</button>
                  </div>
                  {open && (
                    <div style={{ marginTop: 10 }}>
                      {MUSIC_TAXONOMY.map((group) => (
                        <div key={group.label} style={{ marginBottom: 10 }}>
                          <p style={{ ...SKB, fontSize: "var(--fs-7)", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 6px" }}>{group.label}</p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {group.words.map((w) => {
                              const on = r.keywords.includes(w);
                              return (
                                <button key={w} onClick={() => toggleChip(r.localId, w)} style={{ ...SKR, fontSize: "var(--fs-7)", color: on ? "#000" : "#FFF", background: on ? "#FFF" : "transparent", border: `1px solid ${on ? "#FFF" : HAIR}`, padding: "4px 9px", cursor: "pointer", textTransform: "lowercase" }}>{w}</button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <button onClick={() => applyKeywordsToAll(r.localId)} style={{ ...SKB, fontSize: "var(--fs-7)", color: "#FFF", background: "transparent", border: `1px solid ${HAIR}`, cursor: "pointer", padding: "6px 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Apply keywords to all</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <StepNav onBack={() => setStep("upload")} onNext={() => setStep("license")} nextLabel="Review" nextDisabled={!allReady} />
        </>
      )}

      {step === "license" && (
        <>
          <label style={{ ...SKB, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.12em" }}>License</label>
          <p style={{ ...SKR, fontSize: "var(--fs-9)", color: "rgba(255,255,255,0.65)", lineHeight: 1.5, margin: 0 }}>{MUSIC_LICENSE_COPY}</p>
          <button onClick={() => setLicensed((v) => !v)} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
            <span style={{ width: 18, height: 18, flexShrink: 0, border: `1px solid ${licensed ? RED : "rgba(255,255,255,0.4)"}`, background: licensed ? RED : "transparent", display: "flex", alignItems: "center", justifyContent: "center", ...SKB, fontSize: 12, color: "#000" }}>{licensed ? "✓" : ""}</span>
            <span style={{ ...SKR, fontSize: "var(--fs-8)", color: "rgba(255,255,255,0.7)" }}>I own {doneRows.length > 1 ? "these tracks" : "this track"} and agree to the license above.</span>
          </button>
          <StepNav onBack={() => setStep("table")} onNext={submitAll} nextLabel={submitting ? "Submitting…" : `Submit ${doneRows.length}`} nextDisabled={!licensed || submitting} />
        </>
      )}

      {step === "done" && (
        <div style={{ padding: "8px 0 6px" }}>
          <p style={{ ...SKB, fontSize: "var(--fs-11)", color: "#FFF", margin: "0 0 8px", letterSpacing: "0.04em" }}>Submitted for review</p>
          <p style={{ ...SKR, fontSize: "var(--fs-9)", color: "rgba(255,255,255,0.5)", lineHeight: 1.5, margin: "0 0 20px" }}>You&rsquo;ll be notified when {doneRows.length > 1 ? "they&rsquo;re" : "it&rsquo;s"} approved. Approved contributors earn the COMPOSER badge.</p>
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
        <div style={{ position: "relative", width: 560, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto", background: "#000", border: `1px solid ${HAIR}`, boxSizing: "border-box", padding: "28px 30px" }}>
          {Body}
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.7)", opacity: visible ? 1 : 0, transition: "opacity 240ms ease" }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 501, maxWidth: "30rem", margin: "0 auto", background: "#000", borderTop: `1px solid ${HAIR}`, padding: "16px 20px calc(28px + env(safe-area-inset-bottom))", maxHeight: "90vh", overflowY: "auto", transform: visible ? "translateY(0)" : "translateY(100%)", transition: "transform 240ms cubic-bezier(0.32,0.72,0,1)" }}>
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
