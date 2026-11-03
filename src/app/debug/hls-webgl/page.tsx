"use client";

// ── /debug/hls-webgl — VID-2a: the HLS→WebGL decision page ──────────────────────────────────────
// Gates the real video-grade fix. Finishing edits don't reach HLS playback today (GradedVideo:
// usePipeline = !isHls … — HLS gets a CSS-filter approximation, the real gl-react shader chain is
// legacy-video-only). Option A (render the finishing shaders at playback) vs option B (server-side
// render) turns on ONE fact we've never tested on a real iPhone: will iOS Safari feed an HLS <video>
// into a WebGL texture? This page plays a real post's Stream HLS rendition and, side by side:
//   • LEFT  — the raw <video> (native HLS on iOS, hls.js elsewhere)
//   • RIGHT — the SAME element through the REAL finishing Pipeline (gl-react, strong teal/orange
//             split-tone — the actual colour shader, not a toy), so pass/fail is visible at a glance.
// It also probes the two upload paths directly (texImage2D(video) and drawImage(video)→canvas),
// measures decode + GL FPS, and surfaces UA / iOS version / GL + console errors in large text, with
// a Copy-report button. Debug-gated like the video trace (?debug=video). Eric runs it on the phone.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { isVideoDebug } from "@/lib/debugFlags";
import { getAllPosts } from "@/lib/postsService";
import { streamGradedProps } from "@/lib/editor/videoGrade";
import { DEFAULT_PARAMS, type EditParams } from "@/lib/editor/params";
import type HlsType from "hls.js";

const Pipeline = dynamic(() => import("@/components/finishing/Pipeline"), { ssr: false });

// A STRONG, unmistakable grade through the REAL shaders: cool (blue) shadows + warm (orange)
// highlights at full split-tone strength, with saturation + contrast pushed. If the right pane
// shows this cinematic teal/orange and the raw left pane doesn't, the shader path reached the video.
const GRADE: EditParams = {
  ...DEFAULT_PARAMS,
  saturation: 3,
  contrast: 2,
  splitTone: { shadowsHue: "blue", shadowsStrength: 6, highlightsHue: "orange", highlightsStrength: 6 },
};

const appleMobileUA = (nav: { userAgent: string; platform: string; maxTouchPoints: number }) =>
  /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1);

function iosVersion(ua: string): string {
  const m = ua.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))?/);
  if (m) return `${m[1]}.${m[2]}${m[3] ? "." + m[3] : ""}`;
  return /iPhone|iPad|iPod/.test(ua) ? "iOS (version?)" : "n/a (not iOS)";
}

// ── GL probe — does texImage2D(video) ACTUALLY produce readable pixels? ──────────────────────────
// Upload the live frame, draw it with a 1-line passthrough (diagnostic only — the VISIBLE drawing
// is the real Pipeline), read back the centre pixel. Three outcomes the decision turns on:
//   'ok · non-black'      → iOS fed the HLS frame into GL → Option A is viable.
//   'accepted · BLACK'    → the call didn't error but the frame came back empty (the classic iOS
//                           protected/unreadable-HLS signature) → Option A dead via this path.
//   'threw: …' / gl-error → rejected outright.
function probeTexImage2D(video: HTMLVideoElement): string {
  let gl: WebGLRenderingContext | null = null;
  try {
    const c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "no-webgl-context";
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    const uploadErr = gl.getError();
    if (uploadErr !== gl.NO_ERROR) return `gl-error 0x${uploadErr.toString(16)} on texImage2D`;
    // Minimal passthrough draw so we can read the texture back.
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, "attribute vec2 p;varying vec2 uv;void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}");
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, "precision mediump float;varying vec2 uv;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,uv);}");
    gl.compileShader(fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 32, 32);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(4);
    gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const sum = px[0] + px[1] + px[2];
    return sum > 8 ? `ok · non-black rgb(${px[0]},${px[1]},${px[2]})` : "accepted · BLACK (frame unreadable)";
  } catch (e) {
    return `threw: ${(e as Error)?.message ?? String(e)}`;
  } finally {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

function probeDrawImage(video: HTMLVideoElement): string {
  try {
    const c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    const ctx = c.getContext("2d");
    if (!ctx) return "no-2d-context";
    ctx.drawImage(video, 0, 0, 32, 32);
    const d = ctx.getImageData(16, 16, 1, 1).data; // throws SecurityError if the frame tainted the canvas
    const sum = d[0] + d[1] + d[2];
    return sum > 8 ? `ok · non-black rgb(${d[0]},${d[1]},${d[2]})` : "drew · BLACK (frame unreadable)";
  } catch (e) {
    return `threw: ${(e as Error)?.message ?? String(e)}`;
  }
}

interface Diag {
  texImage2D: string;
  drawImage: string;
  decodeFps: number | null;
  glFps: number | null;
  videoDims: string;
  engine: string;
  glErrors: string[];
  consoleErrors: string[];
  // VID-2 §0 — live playback readout (the FPS=0 on device was a paused video).
  paused: boolean | null;
  currentTime: number;
  readyState: number;
  // VID-2 §0 patch — the rolling last-10s window (min/avg/max up+decode, frames, seconds playing)
  // and the on-page verdict, both always present in the report so a paste can't be ambiguous.
  windowLine: string;
  verdict: string;
}

export default function HlsWebglDecisionPage() {
  const [mounted, setMounted] = useState(false);
  const [gated, setGated] = useState(false);
  const [status, setStatus] = useState("loading…");
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [postLabel, setPostLabel] = useState<string>("");
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [box, setBox] = useState({ w: 320, h: 180 });
  const [diag, setDiag] = useState<Diag>({
    texImage2D: "waiting for playback…", drawImage: "waiting for playback…",
    decodeFps: null, glFps: null, videoDims: "—", engine: "—", glErrors: [], consoleErrors: [],
    paused: null, currentTime: 0, readyState: 0, windowLine: "—", verdict: "—",
  });
  const [measuring, setMeasuring] = useState(0); // seconds of VALID playback still needed to fill a fresh window

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const consoleErrsRef = useRef<string[]>([]);
  // VID-2 §0 patch — the rolling window: last 10 per-second samples, maintained continuously from PLAY.
  // `fill` counts down VALID (advancing) seconds after a MEASURE reset — it stalls while paused.
  const windowRef = useRef<{ samples: { gl: number; dec: number; playing: boolean; h: number }[]; prevTime: number; fill: number }>({ samples: [], prevTime: -1, fill: 0 });

  // ── gate (client-only; ?debug=video) ──
  useEffect(() => {
    setMounted(true);
    setGated(isVideoDebug());
  }, []);

  // ── capture console/runtime errors for the report ──
  useEffect(() => {
    if (!gated) return;
    const origErr = console.error;
    console.error = (...args: unknown[]) => {
      const line = args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ").slice(0, 200);
      consoleErrsRef.current = [...consoleErrsRef.current.slice(-9), line];
      origErr(...(args as []));
    };
    const onErr = (e: ErrorEvent) => { consoleErrsRef.current = [...consoleErrsRef.current.slice(-9), `window.onerror: ${e.message}`]; };
    window.addEventListener("error", onErr);
    return () => { console.error = origErr; window.removeEventListener("error", onErr); };
  }, [gated]);

  // ── pick a source: ?hls=<url> or ?post=<id> override, else the first ready HLS post ──
  useEffect(() => {
    if (!gated) return;
    let cancelled = false;
    (async () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const hlsOverride = sp.get("hls");
        if (hlsOverride) { if (!cancelled) { setHlsUrl(hlsOverride); setPostLabel("?hls= override"); setStatus("source: ?hls override"); } return; }
        const wantId = sp.get("post");
        setStatus("fetching a ready HLS post…");
        // Scan a few feed pages for a ready Stream video.
        for (let page = 0; page < 4 && !cancelled; page++) {
          const posts = await getAllPosts(page, 24);
          if (!posts.length) break;
          const match = wantId
            ? posts.find((p) => String((p as { id?: string }).id) === wantId)
            : posts.find((p) => streamGradedProps(p as unknown as Record<string, unknown>).hlsUrl);
          if (match) {
            const { hlsUrl: u } = streamGradedProps(match as unknown as Record<string, unknown>);
            if (u && !cancelled) {
              setHlsUrl(u);
              setPostLabel(`${(match as { username?: string }).username ?? "post"} · ${(match as { id?: string }).id ?? ""}`);
              setStatus("source found");
              return;
            }
          }
        }
        if (!cancelled) setStatus("no ready HLS post found (pass ?hls=<m3u8> to force a source)");
      } catch (e) {
        if (!cancelled) setStatus(`source error: ${(e as Error)?.message ?? e}`);
      }
    })();
    return () => { cancelled = true; };
  }, [gated]);

  // ── attach HLS to the raw <video> (native on iOS, hls.js elsewhere) ──
  useEffect(() => {
    const v = videoRef.current;
    if (!gated || !v || !hlsUrl) return;
    v.crossOrigin = "anonymous"; // BEFORE src, so the frame isn't tainted → GL/2D can read it
    let cancelled = false;
    let hls: HlsType | null = null;
    const nav = navigator;
    const apple = appleMobileUA(nav);
    const engine = !apple && typeof MediaSource !== "undefined" ? "hls.js" : apple ? "native (iOS)" : "native";
    setDiag((d) => ({ ...d, engine }));
    if (apple || typeof MediaSource === "undefined") {
      v.src = hlsUrl;
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          hls = new Hls({ enableWorker: true });
          hls.on(Hls.Events.ERROR, (_e, data: { fatal?: boolean; type?: string; details?: string }) => {
            if (data?.fatal) consoleErrsRef.current = [...consoleErrsRef.current.slice(-9), `hls.js fatal: ${data.type}/${data.details}`];
          });
          hls.loadSource(hlsUrl);
          hls.attachMedia(v);
        } else {
          v.src = hlsUrl; // last resort
        }
      }).catch(() => { if (!cancelled) v.src = hlsUrl; });
    }
    v.muted = true;
    const tryPlay = () => { v.play().catch(() => {}); };
    v.addEventListener("loadeddata", tryPlay);
    tryPlay();
    setVideoEl(v);
    return () => {
      cancelled = true;
      v.removeEventListener("loadeddata", tryPlay);
      if (hls) { try { hls.destroy(); } catch { /* gone */ } }
    };
  }, [gated, hlsUrl]);

  // ── measure box for the Pipeline ──
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => { const w = Math.max(80, el.clientWidth); setBox({ w, h: Math.round((w * 9) / 16) }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gated, hlsUrl]);

  // ── probes + FPS, once the video is actually decoding ──
  useEffect(() => {
    const v = videoEl;
    if (!gated || !v) return;
    let cancelled = false;
    let probed = false;
    let glFrames = 0, decodeFrames = 0;
    let fpsCanvas: HTMLCanvasElement | null = null;
    let gl: WebGLRenderingContext | null = null;
    let tex: WebGLTexture | null = null;

    // GL upload-loop FPS: texImage2D(video) each rAF into a tiny context, count successful uploads/s.
    const initGl = () => {
      fpsCanvas = document.createElement("canvas"); fpsCanvas.width = 16; fpsCanvas.height = 16;
      gl = (fpsCanvas.getContext("webgl") || null) as WebGLRenderingContext | null;
      if (gl) { tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); }
    };
    initGl();

    const runProbes = () => {
      if (probed || cancelled) return;
      if (v.readyState < 2 || !v.videoWidth) return;
      probed = true;
      const tex2d = probeTexImage2D(v);
      const draw2d = probeDrawImage(v);
      setDiag((d) => ({ ...d, texImage2D: tex2d, drawImage: draw2d, videoDims: `${v.videoWidth}×${v.videoHeight}` }));
    };

    // decode FPS via requestVideoFrameCallback when available.
    type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    const rvfc = v as RVFC;
    const onDecoded = () => { if (cancelled) return; decodeFrames++; rvfc.requestVideoFrameCallback?.(onDecoded); };
    if (typeof rvfc.requestVideoFrameCallback === "function") rvfc.requestVideoFrameCallback(onDecoded);

    let raf = 0;
    const loop = () => {
      if (cancelled) return;
      runProbes();
      if (gl && tex && v.readyState >= 2 && v.videoWidth) {
        try {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
          if (gl.getError() === gl.NO_ERROR) glFrames++;
        } catch { /* count only clean uploads */ }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const tick = window.setInterval(() => {
      if (cancelled) return;
      const gf = glFrames, df = decodeFrames;
      glFrames = 0; decodeFrames = 0;

      // VID-2 §0 patch — CONTINUOUS rolling window (last 10s). A second counts as "playing" only when
      // the video is advancing AND decode-ready (readyState ≥ 3) — so a paused/stalled measurement can
      // never read as sustained. MEASURE resets fill; it only ticks down on VALID seconds.
      const w = windowRef.current;
      const advancing = w.prevTime >= 0 && v.currentTime > w.prevTime + 0.05 && v.readyState >= 3;
      w.prevTime = v.currentTime;
      w.samples.push({ gl: gf, dec: df, playing: advancing, h: v.videoHeight || 0 });
      if (w.samples.length > 10) w.samples.shift();
      if (w.fill > 0 && advancing) { w.fill -= 1; setMeasuring(w.fill); }

      const S = w.samples;
      const playing = S.filter((s) => s.playing);
      const min = (a: number[]) => (a.length ? Math.min(...a) : 0);
      const max = (a: number[]) => (a.length ? Math.max(...a) : 0);
      const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
      // Rates are measured over the SECONDS THE VIDEO ACTUALLY PLAYED (paused seconds would dilute them).
      const up = playing.map((s) => s.gl), dec = playing.map((s) => s.dec);
      const framesUp = up.reduce((x, y) => x + y, 0);
      const secPlay = playing.length;
      const hNow = v.videoHeight || max(S.map((s) => s.h));
      const uploadAvg = avg(up), decodeAvg = avg(dec);
      const windowLine = `last ${S.length}s @ ${v.videoWidth || "?"}×${hNow || "?"}: upload ${min(up)}/${uploadAvg}/${max(up)} (min/avg/max) · decode ${min(dec)}/${decodeAvg}/${max(dec)} fps · ${framesUp} frames · playing ${secPlay}/${S.length}s`;
      // On-page verdict — unambiguous. Needs enough real playback, then upload ≥20 at ≥480p.
      let verdict: string;
      if (secPlay < 5) verdict = `NOT OK: video only played ${secPlay}/${S.length}s in the window (press PLAY/MEASURE; iOS needs the gesture)`;
      else if (hNow < 480) verdict = `NOT OK: rendition ${hNow || "?"}p < 480p`;
      else if (uploadAvg < 20) verdict = `NOT OK: upload avg ${uploadAvg} < 20 fps @ ${hNow}p`;
      else verdict = `SUSTAINED OK (upload ${uploadAvg} ≥20 @ ${hNow}p ≥480p · decode avg ${decodeAvg})`;

      setDiag((d) => ({
        ...d,
        glFps: gf, decodeFps: typeof rvfc.requestVideoFrameCallback === "function" ? df : null,
        paused: v.paused, currentTime: Math.round(v.currentTime * 10) / 10, readyState: v.readyState,
        videoDims: v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : d.videoDims, // live — catches HLS rendition switches
        consoleErrors: consoleErrsRef.current,
        windowLine, verdict,
      }));
    }, 1000);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearInterval(tick);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [gated, videoEl]);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const ios = mounted ? iosVersion(ua) : "—";

  const report = useMemo(() => {
    const lines = [
      "=== VID-2 §0 · HLS→WebGL decision (device) ===",
      `when: ${new Date().toISOString()}`,
      `source: ${postLabel || "—"}`,
      `hls: ${hlsUrl ?? "—"}`,
      `engine: ${diag.engine}`,
      `video dims: ${diag.videoDims}`,
      `iOS: ${ios}`,
      `UA: ${ua}`,
      "",
      `playback: paused=${diag.paused == null ? "?" : diag.paused} · t=${diag.currentTime}s · readyState=${diag.readyState} · rendition=${diag.videoDims}`,
      `texImage2D(video): ${diag.texImage2D}`,
      `drawImage(video):  ${diag.drawImage}`,
      `decode FPS (rVFC): ${diag.decodeFps ?? "n/a"}`,
      `GL upload FPS:     ${diag.glFps ?? "—"}`,
      `window:            ${diag.windowLine}`,
      `VERDICT:           ${diag.verdict}`,
      "",
      `console/GL errors:`,
      ...(diag.consoleErrors.length ? diag.consoleErrors.map((e) => "  · " + e) : ["  (none)"]),
    ];
    return lines.join("\n");
  }, [postLabel, hlsUrl, diag, ios, ua]);

  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard?.writeText(report).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }, [report]);

  // VID-2 §0 — iOS needs a user gesture to start playback (the FPS=0 cause). This button provides it.
  const playVideo = useCallback(() => { const v = videoRef.current; if (v) { v.muted = true; v.loop = true; v.play().catch(() => {}); } }, []);
  // VID-2 §0 patch — MEASURE: force play()+loop, then reset the rolling window to a FRESH 10s. The
  // window only fills on VALID (advancing, readyState ≥ 3) seconds (see the tick), so it "refuses to
  // start" while paused/stalled — the countdown stalls until the video is genuinely advancing.
  const startMeasure = useCallback(() => {
    playVideo();
    const w = windowRef.current;
    w.samples = []; w.prevTime = -1; w.fill = 10;
    setMeasuring(10);
  }, [playVideo]);

  if (!mounted) return <div style={{ minHeight: "100dvh", background: "#000" }} />;
  if (!gated) {
    return (
      <div style={{ minHeight: "100dvh", background: "#000", color: "#fff", fontFamily: "monospace", padding: 24, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>/debug/hls-webgl</div>
        <div style={{ opacity: 0.7, maxWidth: 420 }}>Debug-gated. Append <b>?debug=video</b> to the URL to run the HLS→WebGL probe.</div>
        <a href="?debug=video" style={{ color: "#4af", marginTop: 8 }}>Enable ?debug=video →</a>
      </div>
    );
  }

  const L = { fontFamily: "monospace", color: "#fff" };
  const chip = (ok: boolean | null, s: string) => (
    <span style={{ color: ok == null ? "#fc0" : ok ? "#3f8" : "#f55", fontWeight: 700 }}>{s}</span>
  );
  const verdict = (v: string): boolean | null =>
    /^ok/.test(v) ? true : /waiting/.test(v) ? null : false;

  return (
    <div style={{ minHeight: "100dvh", background: "#000", padding: 12, boxSizing: "border-box", ...L }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>VID-2 §0 · HLS→WebGL decision — {status}</div>

      {/* Side by side: raw <video> vs the REAL finishing Pipeline */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div ref={boxRef} style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>RAW &lt;video&gt; (HLS)</div>
          <video
            ref={(el) => { videoRef.current = el; }}
            playsInline muted controls={false}
            style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", background: "#111", display: "block" }}
          />
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>WebGL — real finishing shaders (strong teal/orange)</div>
          <div style={{ width: "100%", aspectRatio: "16 / 9", background: "#111", position: "relative", overflow: "hidden" }}>
            {videoEl && box.w > 0 && (
              <div style={{ position: "absolute", inset: 0 }}>
                <Pipeline source={videoEl} params={GRADE} width={box.w} height={box.h} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* VID-2 §0 — PLAY (iOS needs the gesture) + the 10s sustained measurement */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={playVideo} style={{ flex: 1, padding: "16px 0", background: "#fff", color: "#000", border: "none", borderRadius: 4, fontSize: 18, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>▶ PLAY</button>
        <button onClick={startMeasure} disabled={measuring > 0} style={{ flex: 1, padding: "16px 0", background: measuring > 0 ? "#333" : "#4af", color: measuring > 0 ? "#fff" : "#000", border: "none", borderRadius: 4, fontSize: 16, fontWeight: 700, fontFamily: "monospace", cursor: measuring > 0 ? "default" : "pointer" }}>
          {measuring > 0 ? `MEASURING ${measuring}s…` : "MEASURE 10s"}
        </button>
      </div>

      {/* Diagnostics — large text */}
      <div style={{ fontSize: 16, lineHeight: 1.7, background: "#0a0a0a", border: "1px solid #222", padding: 14, borderRadius: 4 }}>
        <div>playback: <b style={{ color: diag.paused === false ? "#3f8" : "#f55" }}>{diag.paused == null ? "—" : diag.paused ? "PAUSED" : "playing"}</b> · t={diag.currentTime}s · readyState={diag.readyState} · rendition={diag.videoDims}</div>
        <div>texImage2D(video): {chip(verdict(diag.texImage2D), diag.texImage2D)}</div>
        <div>drawImage(video):&nbsp; {chip(verdict(diag.drawImage), diag.drawImage)}</div>
        <div>GL upload FPS: <b style={{ color: "#3f8" }}>{diag.glFps ?? "—"}</b> &nbsp;·&nbsp; decode FPS: <b>{diag.decodeFps ?? "n/a"}</b></div>
        <div style={{ color: "#aaa", fontSize: 14 }}>{diag.windowLine}</div>
        <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 4, fontSize: 15, fontWeight: 700, background: /^SUSTAINED OK/.test(diag.verdict) ? "#06351f" : "#3a1414", color: /^SUSTAINED OK/.test(diag.verdict) ? "#3f8" : "#f77" }}>{diag.verdict}</div>
        <div style={{ opacity: 0.85 }}>engine: {diag.engine} · iOS {ios}</div>
        <div style={{ opacity: 0.6, fontSize: 12, wordBreak: "break-all", marginTop: 4 }}>UA: {ua}</div>
        {diag.consoleErrors.length > 0 && (
          <div style={{ marginTop: 8, color: "#f77", fontSize: 13 }}>
            errors:<br />{diag.consoleErrors.map((e, i) => <div key={i}>· {e}</div>)}
          </div>
        )}
      </div>

      <button
        onClick={copy}
        style={{ marginTop: 12, width: "100%", padding: "14px 0", background: copied ? "#3f8" : "#fff", color: "#000", border: "none", borderRadius: 4, fontSize: 16, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}
      >
        {copied ? "COPIED ✓" : "COPY REPORT"}
      </button>
      <pre style={{ marginTop: 10, fontSize: 11, color: "#888", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{report}</pre>
    </div>
  );
}
