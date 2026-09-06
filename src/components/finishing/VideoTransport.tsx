"use client";

// ── VideoTransport (Brief P3 / P3a) — the viewer-controls overlay for FULL-context video
// (lightbox + theatre, both platforms). Mounted OVER a GradedVideo, fed its live <video>
// element (GradedVideo's onVideoEl). NEVER on feed / grids / Mirage / snippet contexts.
//
//   §1 pause indicator — a hairline pause glyph fades in center-stage when paused.
//   §2 progress hairline — 1px ivory ~40% at the media bottom, fill L→R; tap/click seeks.
//      Desktop non-Pro shows a subtle PRO mark → onUpsell; mobile shows none.
//   §3 the Transport (DESKTOP + Pro) — hover strip: drag-scrub, ←/→ frame-step, mm:ss:ff
//      timecode, 0.5/1/1.5/2 speed, I/O A–B loop with visible marks. Keyboard (Space/←/→/I/O)
//      is INERT while a text input has focus (the comment composer).
//
// P3a §1 — the strip AUTO-HIDES ~400ms after playback starts (not the 3s idle timer); hover
//   returns it (with a 3s idle while hovering); PAUSE keeps it visible. The keyboard listener
//   is a WINDOW listener independent of strip visibility, so I/O/Space keep working after the
//   strip hides (the bug the faster hide could have caused).
// P3a §2 — A–B marks now RENDER the moment they're set (ivory ticks + 15% range fill + [ ]
//   bracket labels + a × to clear); the loop uses min/max so OUT-before-IN is auto-ordered;
//   the boundary is enforced by requestVideoFrameCallback where available (tight), else
//   timeupdate (~250ms overshoot).

import { useEffect, useRef, useState, useCallback } from "react";

const SKB: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 700 };
const FPS = 30; // assumed frame rate for frame-step + the :ff readout (HLS carries no exact fps)
const INK = "rgba(229,225,219,0.4)";
const HIDE_ON_PLAY_MS = 400; // P3a §1 — hide this long after playback starts
const IDLE_MS = 3000;        // hover-idle hide

interface Props {
  videoEl: HTMLVideoElement | null;
  platform: "mobile" | "desktop";
  paused: boolean;
  onTogglePause: () => void;
  isPro: boolean;
  onUpsell: () => void;
}

function focusInText(): boolean {
  const a = typeof document !== "undefined" ? document.activeElement : null;
  if (!a) return false;
  const tag = a.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (a as HTMLElement).isContentEditable === true;
}

const fmtTC = (t: number) => {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t - Math.floor(t)) * FPS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(m)}:${p(s)}:${p(f)}`;
};

export default function VideoTransport({ videoEl, platform, paused, onTogglePause, isPro, onUpsell }: Props) {
  const desktop = platform === "desktop";
  const showTransport = desktop && isPro; // §3
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [revealed, setRevealed] = useState(true); // strip shown (governed by play/hover/idle)
  const [scrubbing, setScrubbing] = useState(false);
  const [speed, setSpeed] = useState(1);
  // A–B loop marks (raw). Rendering + loop use the ordered [lo, hi].
  const [ab, setAb] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [pausePulse, setPausePulse] = useState(false);
  const hideRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // ── time tracking (rAF while playing; events cover paused/seek) ──
  useEffect(() => {
    const v = videoEl;
    if (!v) return;
    const sync = () => { setCur(v.currentTime || 0); setDur(isFinite(v.duration) ? v.duration : 0); };
    const loop = () => { sync(); rafRef.current = requestAnimationFrame(loop); };
    sync();
    const onPlay = () => { if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop); };
    const onPause = () => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } sync(); };
    v.addEventListener("timeupdate", sync); v.addEventListener("durationchange", sync); v.addEventListener("loadedmetadata", sync);
    v.addEventListener("play", onPlay); v.addEventListener("pause", onPause);
    if (!v.paused) rafRef.current = requestAnimationFrame(loop);
    return () => {
      v.removeEventListener("timeupdate", sync); v.removeEventListener("durationchange", sync); v.removeEventListener("loadedmetadata", sync);
      v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [videoEl]);

  // ── A–B LOOP enforcement (P3a §2d). Ordered [lo,hi]; rVFC where available for tight OUT. ──
  useEffect(() => {
    const v = videoEl;
    if (!v || ab.a == null || ab.b == null) return;
    const lo = Math.min(ab.a, ab.b), hi = Math.max(ab.a, ab.b);
    if (hi - lo < 0.05) return; // degenerate range
    let stop = false;
    const enforce = () => {
      if (v.currentTime >= hi || v.currentTime < lo - 0.15) { try { v.currentTime = lo; } catch { /* ignore */ } }
    };
    // rVFC: fires per presented frame → sub-frame OUT precision. Fallback: timeupdate (~4/s).
    const anyV = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (typeof anyV.requestVideoFrameCallback === "function") {
      const tick = () => { if (stop) return; enforce(); anyV.requestVideoFrameCallback!(tick); };
      anyV.requestVideoFrameCallback(tick);
      return () => { stop = true; };
    }
    v.addEventListener("timeupdate", enforce);
    return () => { stop = true; v.removeEventListener("timeupdate", enforce); };
  }, [videoEl, ab]);

  useEffect(() => { if (videoEl) videoEl.playbackRate = speed; }, [videoEl, speed]);

  // ── §1 pause glyph pulse ──
  useEffect(() => { if (!paused) { setPausePulse(false); return; } setPausePulse(true); const t = setTimeout(() => setPausePulse(false), 600); return () => clearTimeout(t); }, [paused]);

  // ── P3a §1 — VISIBILITY. reveal(ms): show, then hide after ms (null = stay). Pause stays. ──
  const reveal = useCallback((hideMs: number | null) => {
    setRevealed(true);
    if (hideRef.current) { clearTimeout(hideRef.current); hideRef.current = null; }
    if (hideMs != null) hideRef.current = window.setTimeout(() => setRevealed(false), hideMs);
  }, []);
  // Hide ~400ms after playback starts; on pause, stay visible.
  useEffect(() => {
    const v = videoEl;
    if (!v) return;
    const onPlay = () => reveal(HIDE_ON_PLAY_MS);
    const onPause = () => reveal(null);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    if (v.paused) reveal(null); else reveal(HIDE_ON_PLAY_MS);
    return () => { v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); };
  }, [videoEl, reveal]);
  useEffect(() => () => { if (hideRef.current) clearTimeout(hideRef.current); }, []);

  // ── keyboard (desktop): Space pause · ←/→ frame-step · I/O A–B. WINDOW listener (survives
  //    the strip hiding) with a FOCUS GUARD. ──
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (focusInText()) return; // FOCUS GUARD — never steal keys from the comment composer etc.
      const v = videoEl;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); onTogglePause(); reveal(paused ? null : HIDE_ON_PLAY_MS); return; }
      if (!showTransport || !v) return;
      if (process.env.NODE_ENV !== "production" && /^(ArrowLeft|ArrowRight|i|I|o|O)$/.test(e.key)) console.log("[transport] key", e.key, "t=", v.currentTime.toFixed(2));
      if (e.key === "ArrowLeft") { e.preventDefault(); try { v.currentTime = Math.max(0, v.currentTime - 1 / FPS); } catch { /* */ } reveal(IDLE_MS); }
      else if (e.key === "ArrowRight") { e.preventDefault(); try { v.currentTime = Math.min(v.duration || v.currentTime, v.currentTime + 1 / FPS); } catch { /* */ } reveal(IDLE_MS); }
      else if (e.key === "i" || e.key === "I") { setAb((p) => ({ a: v.currentTime, b: p.b })); reveal(IDLE_MS); }
      else if (e.key === "o" || e.key === "O") { setAb((p) => ({ a: p.a, b: v.currentTime })); reveal(IDLE_MS); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, showTransport, videoEl, onTogglePause, reveal, paused]);

  const frac = dur > 0 ? Math.min(1, Math.max(0, cur / dur)) : 0;
  const pct = (t: number) => (dur > 0 ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0);
  const seekToClientX = (clientX: number) => {
    const el = barRef.current, v = videoEl;
    if (!el || !v || !dur) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    try { v.currentTime = f * dur; } catch { /* not seekable */ }
  };
  const onScrubStart = (e: React.PointerEvent) => {
    if (!showTransport) return;
    e.stopPropagation(); setScrubbing(true); reveal(IDLE_MS); seekToClientX(e.clientX);
    const move = (ev: PointerEvent) => { seekToClientX(ev.clientX); };
    const up = () => { setScrubbing(false); reveal(IDLE_MS); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const visible = paused || revealed || scrubbing;
  const aSet = ab.a != null, bSet = ab.b != null;
  const lo = aSet && bSet ? Math.min(ab.a as number, ab.b as number) : null;
  const hi = aSet && bSet ? Math.max(ab.a as number, ab.b as number) : null;

  return (
    <div
      style={{ position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none" }}
      onMouseEnter={desktop ? () => reveal(IDLE_MS) : undefined}
      onMouseLeave={desktop ? () => reveal(HIDE_ON_PLAY_MS) : undefined}
      onMouseMove={desktop ? () => reveal(IDLE_MS) : undefined}
    >
      {/* §1 pause indicator */}
      {paused && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ display: "flex", gap: 6, opacity: pausePulse ? 0.85 : 0.32, transition: "opacity 600ms ease" }}>
            <span style={{ width: 4, height: 30, background: "#E5E1DB", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }} />
            <span style={{ width: 4, height: 30, background: "#E5E1DB", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }} />
          </div>
        </div>
      )}

      {showTransport ? (
        /* §3 Transport strip */
        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 14px 12px",
            background: "linear-gradient(to top, rgba(5,5,5,0.72), rgba(5,5,5,0))",
            opacity: visible ? 1 : 0, transition: "opacity 200ms ease", pointerEvents: visible ? "auto" : "none",
            display: "flex", flexDirection: "column", gap: 8,
          }}
          onMouseMove={() => reveal(IDLE_MS)}
        >
          {/* scrub bar + A–B marks/fill */}
          <div ref={barRef} onPointerDown={onScrubStart}
            style={{ position: "relative", height: 14, display: "flex", alignItems: "center", cursor: "pointer" }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "rgba(229,225,219,0.22)" }} />
            {/* A–B range fill (15% ivory) */}
            {lo != null && hi != null && (
              <div style={{ position: "absolute", left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%`, top: 4, bottom: 4, background: "rgba(229,225,219,0.15)" }} />
            )}
            <div style={{ position: "absolute", left: 0, width: `${frac * 100}%`, height: 2, background: "#E5E1DB" }} />
            {/* IN mark — [ bracket + × clear */}
            {aSet && (
              <div style={{ position: "absolute", left: `${pct(ab.a as number)}%`, top: -3, bottom: -3, display: "flex", flexDirection: "column", alignItems: "center", transform: "translateX(-50%)" }}>
                <span style={{ ...SKB, fontSize: 11, lineHeight: 1, color: "#E5E1DB", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}>[</span>
                <button onClick={(e) => { e.stopPropagation(); setAb((p) => ({ ...p, a: null })); reveal(IDLE_MS); }} aria-label="Clear IN"
                  style={{ position: "absolute", top: -12, background: "transparent", border: "none", cursor: "pointer", padding: 2, ...SKB, fontSize: 8, color: "rgba(229,225,219,0.6)", lineHeight: 1 }}>×</button>
              </div>
            )}
            {/* OUT mark — ] bracket + × clear */}
            {bSet && (
              <div style={{ position: "absolute", left: `${pct(ab.b as number)}%`, top: -3, bottom: -3, display: "flex", flexDirection: "column", alignItems: "center", transform: "translateX(-50%)" }}>
                <span style={{ ...SKB, fontSize: 11, lineHeight: 1, color: "#E5E1DB", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}>]</span>
                <button onClick={(e) => { e.stopPropagation(); setAb((p) => ({ ...p, b: null })); reveal(IDLE_MS); }} aria-label="Clear OUT"
                  style={{ position: "absolute", top: -12, background: "transparent", border: "none", cursor: "pointer", padding: 2, ...SKB, fontSize: 8, color: "rgba(229,225,219,0.6)", lineHeight: 1 }}>×</button>
              </div>
            )}
            {/* playhead */}
            <div style={{ position: "absolute", left: `${frac * 100}%`, width: 9, height: 9, borderRadius: "50%", background: "#E5E1DB", transform: "translateX(-50%)", boxShadow: "0 1px 4px rgba(0,0,0,0.6)" }} />
          </div>
          {/* readout: timecode · speed · A–B state */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ ...SKB, fontSize: 10, letterSpacing: "0.08em", color: "rgba(229,225,219,0.55)", fontVariantNumeric: "tabular-nums" }}>{fmtTC(cur)} / {fmtTC(dur)}</span>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {[0.5, 1, 1.5, 2].map((s) => (
                <button key={s} onClick={(e) => { e.stopPropagation(); setSpeed(s); reveal(IDLE_MS); }}
                  style={{ ...SKB, fontSize: 9.5, letterSpacing: "0.04em", padding: "3px 6px", cursor: "pointer", border: "none", background: speed === s ? "#E5E1DB" : "transparent", color: speed === s ? "var(--on-ink)" : "rgba(229,225,219,0.5)" }}>{s}×</button>
              ))}
            </div>
            <span style={{ ...SKB, fontSize: 9, letterSpacing: "0.1em", color: lo != null ? "rgba(229,225,219,0.7)" : "rgba(229,225,219,0.28)", textTransform: "uppercase" }}>
              {lo != null ? "A–B LOOP" : "I / O  A–B"}
            </span>
          </div>
        </div>
      ) : (
        /* §2 progress hairline (both platforms, all users) */
        <div
          ref={barRef}
          onClick={(e) => { e.stopPropagation(); seekToClientX(e.clientX); reveal(IDLE_MS); }}
          onPointerDown={desktop ? undefined : (e) => { e.stopPropagation(); reveal(IDLE_MS); }}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 16, display: "flex", alignItems: "flex-end", cursor: "pointer", pointerEvents: "auto", opacity: visible ? 1 : 0, transition: "opacity 300ms ease" }}
        >
          <div style={{ position: "relative", width: "100%", height: 1 }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: INK }} />
            <div style={{ position: "absolute", left: 0, width: `${frac * 100}%`, height: 1, background: "#E5E1DB" }} />
            {desktop && !isPro && (
              <button onClick={(e) => { e.stopPropagation(); onUpsell(); }} aria-label="Scope Pro"
                style={{ position: "absolute", right: 4, bottom: 3, background: "transparent", border: "none", cursor: "pointer", padding: 2, fontFamily: "var(--font-black)", fontWeight: 900, fontSize: 8, letterSpacing: "0.12em", color: "rgba(229,225,219,0.3)" }}>PRO</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
