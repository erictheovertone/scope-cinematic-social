"use client";

// ── /debug/upload — VID-2b resumable-upload harness (debug-gated) ────────────────────────────────
// Drives the REAL uploadVideoToStream() on a synthetic file so a Playwright test can mock the
// direct-upload route + a resumable tus server and prove resume (offline mid-upload, and reload). No
// auth, no Cloudflare. ?mb=<size> sets the synthetic file size (default 60). Auto-starts on mount;
// the SAME synthetic file (fixed name/size/lastModified) is regenerated on reload → same fingerprint
// → resumes the stored URL.
import { useEffect, useRef, useState } from "react";
import { uploadVideoToStream } from "@/lib/streamUpload";
import { isVideoDebug } from "@/lib/debugFlags";

export default function UploadDebug() {
  const [mounted, setMounted] = useState(false);
  const [pct, setPct] = useState(0);
  const [state, setState] = useState("idle");
  const [uid, setUid] = useState("");
  const [err, setErr] = useState("");
  const started = useRef(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted || !isVideoDebug() || started.current) return;
    started.current = true;
    const mb = Number(new URLSearchParams(window.location.search).get("mb") || 60);
    const file = new File([new Uint8Array(mb * 1024 * 1024)], "vid2b-test.mp4", { type: "video/mp4", lastModified: 1 });
    const win = window as unknown as { __upload?: Record<string, unknown> };
    win.__upload = { pct: 0, state: "uploading", uid: "", err: "" };
    const set = (k: string, v: unknown) => { (win.__upload as Record<string, unknown>)[k] = v; };
    setState("uploading"); set("state", "uploading");
    uploadVideoToStream(
      file,
      (f) => { const p = Math.round(f * 100); setPct(p); set("pct", p); },
      (s) => { setState(s.phase); set("state", s.phase); set("retries", s.retries); set("resumes", s.resumes); },
    )
      .then((u) => { setUid(u); setState("done"); set("uid", u); set("state", "done"); })
      .catch((e) => { const m = String((e as Error)?.message ?? e); setErr(m); setState("error"); set("err", m); set("state", "error"); });
  }, [mounted]);

  if (!mounted) return <div style={{ minHeight: "100dvh", background: "#000" }} />;
  if (!isVideoDebug()) return <div style={{ color: "#fff", background: "#000", padding: 24, fontFamily: "monospace" }}>Append <b>?debug=video</b> to run /debug/upload.</div>;
  return (
    <div style={{ color: "#fff", background: "#000", padding: 16, fontFamily: "monospace" }} data-upload-debug>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>VID-2b · resumable upload harness</div>
      <div data-pct>pct: {pct}</div>
      <div data-state>state: {state}</div>
      <div data-uid>uid: {uid || "—"}</div>
      <div data-err style={{ color: "#f77" }}>err: {err || "—"}</div>
    </div>
  );
}
