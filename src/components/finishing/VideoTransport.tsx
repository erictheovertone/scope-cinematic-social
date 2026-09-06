"use client";

// ── VideoTransport (Brief P3) — the viewer-controls overlay for FULL-context video
// (lightbox + theatre, both platforms). Mounted OVER a GradedVideo, fed its live <video>
// element (GradedVideo's onVideoEl). NEVER on feed / grids / Mirage / snippet contexts.
//
//   §1 pause indicator — a hairline pause glyph fades in/out center-stage when paused.
//      (The pause GESTURE is owned by the surface — mobile hold, desktop click/Space — so
//       the swipe/tap arbitration stays with the surface's existing handlers; this only
//       reflects `paused` and hosts the desktop keyboard shortcuts with a focus guard.)
//   §2 progress hairline — 1px ivory ~40% at the media bottom, fill L→R; tap/click seeks
//      (courtesy, no drag). Fades ~2s idle, returns on hover/touch. Desktop non-Pro shows a
//      subtle PRO mark at the right end → onUpsell.
//   §3 the Transport (DESKTOP + Pro ONLY) — on hover, a hairline strip REPLACES the progress
//      line: drag-scrub, ←/→ frame-step, mm:ss:ff timecode, 0.5/1/1.5/2 speed, I/O A–B loop.
//      Auto-hides ~3s idle. Keyboard (Space, ←/→, I/O) is INERT while a text input has focus.

import { useEffect, useRef, useState, useCallback } from "react";

const SKB: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 700 };
const FPS = 30; // assumed frame rate for frame-step + the :ff readout (HLS carries no exact fps here)
const INK = "rgba(229,225,219,0.4)";

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
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t - Math.floor(t)) * FPS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(m)}:${p(s)}:${p(f)}`;
};

export default function VideoTransport({ videoEl, platform, paused, onTogglePause, isPro, onUpsell }: Props) {
  const desktop = platform === "desktop";
  const showTransport = desktop && isPro; // §3
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [idleHidden, setIdleHidden] = useState(false); // hairline/strip faded after idle
  const [hovering, setHovering] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [ab, setAb] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [pausePulse, setPausePulse] = useState(false);
  const idleRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // ── time tracking (rAF while playing; events cover paused/seek) ──
  useEffect(() => {
    const v = videoEl;
    if (!v) return;
    const sync = () => { setCur(v.currentTime || 0); setDur(v.duration || 0); };
    const loop = () => { sync(); rafRef.current = requestAnimationFrame(loop); };
    sync();
    v.addEventListener("timeupdate", sync);
    v.addEventListener("durationchange", sync);
    v.addEventListener("loadedmetadata", sync);
    if (!v.paused) rafRef.current = requestAnimationFrame(loop);
    const onPlay = () => { if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop); };
    const onPause = () => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } sync(); };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", sync); v.removeEventListener("durationchange", sync);
      v.removeEventListener("loadedmetadata", sync); v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [videoEl]);

  // ── A–B loop enforcement ──
  useEffect(() => {
    const v = videoEl;
    if (!v || ab.a == null || ab.b == null) return;
    const check = () => { if (v.currentTime >= (ab.b as number) || v.currentTime < (ab.a as number) - 0.1) { try { v.currentTime = ab.a as number; } catch { /* ignore */ } } };
    v.addEventListener("timeupdate", check);
    return () => v.removeEventListener("timeupdate", check);
  }, [videoEl, ab]);

  // ── speed ──
  useEffect(() => { if (videoEl) videoEl.playbackRate = speed; }, [videoEl, speed]);

  // ── pause glyph pulse (§1): fade in ~600ms on each pause ──
  useEffect(() => { if (!paused) { setPausePulse(false); return; } setPausePulse(true); const t = setTimeout(() => setPausePulse(false), 600); return () => clearTimeout(t); }, [paused]);

  // ── idle fade (2s hairline / 3s transport). Any activity resets. ──
  const wake = useCallback(() => {
    setIdleHidden(false);
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => setIdleHidden(true), showTransport ? 3000 : 2000);
  }, [showTransport]);
  useEffect(() => { wake(); return () => { if (idleRef.current) clearTimeout(idleRef.current); }; }, [wake, cur]);

  // ── keyboard (desktop): Space pause · ←/→ frame-step · I/O A–B. Focus-guarded. ──
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (focusInText()) return; // FOCUS GUARD — never steal keys from the comment composer etc.
      const v = videoEl;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); onTogglePause(); wake(); return; }
      if (!showTransport || !v) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); try { v.currentTime = Math.max(0, v.currentTime - 1 / FPS); } catch { /* */ } wake(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); try { v.currentTime = Math.min(v.duration || v.currentTime, v.currentTime + 1 / FPS); } catch { /* */ } wake(); }
      else if (e.key === "i" || e.key === "I") { setAb((p) => ({ a: v.currentTime, b: p.b != null && p.b > v.currentTime ? p.b : null })); wake(); }
      else if (e.key === "o" || e.key === "O") { setAb((p) => ({ a: p.a, b: v.currentTime })); wake(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, showTransport, videoEl, onTogglePause, wake]);

  const frac = dur > 0 ? Math.min(1, Math.max(0, cur / dur)) : 0;
  const seekToClientX = (clientX: number) => {
    const el = barRef.current, v = videoEl;
    if (!el || !v || !dur) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    try { v.currentTime = f * dur; } catch { /* not seekable */ }
  };

  // Drag-scrub (transport only). Courtesy tap-seek (hairline) is a plain click.
  const onScrubStart = (e: React.PointerEvent) => {
    if (!showTransport) return;
    e.stopPropagation(); setScrubbing(true); seekToClientX(e.clientX);
    const move = (ev: PointerEvent) => seekToClientX(ev.clientX);
    const up = () => { setScrubbing(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const visible = hovering || scrubbing || !idleHidden;

  return (
    <div
      // Overlay is click-through EXCEPT its interactive strips (which stopPropagation), so the
      // surface's own media gestures (pause tap/hold, swipe nav, backdrop close) are unaffected.
      style={{ position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none" }}
      onMouseEnter={desktop ? () => { setHovering(true); wake(); } : undefined}
      onMouseLeave={desktop ? () => setHovering(false) : undefined}
      onMouseMove={desktop ? wake : undefined}
    >
      {/* §1 pause indicator — hairline glyph, center, fades in ~600ms then out. */}
      {paused && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ display: "flex", gap: 6, opacity: pausePulse ? 0.85 : 0.32, transition: "opacity 600ms ease" }}>
            <span style={{ width: 4, height: 30, background: "#E5E1DB", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }} />
            <span style={{ width: 4, height: 30, background: "#E5E1DB", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }} />
          </div>
        </div>
      )}

      {/* §3 Transport strip (desktop Pro) — replaces the hairline on hover. */}
      {showTransport ? (
        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 14px 12px",
            background: "linear-gradient(to top, rgba(5,5,5,0.72), rgba(5,5,5,0))",
            opacity: visible ? 1 : 0, transition: "opacity 200ms ease", pointerEvents: visible ? "auto" : "none",
            display: "flex", flexDirection: "column", gap: 8,
          }}
          onMouseMove={wake}
        >
          {/* scrub bar + A–B markers */}
          <div ref={barRef} onPointerDown={onScrubStart}
            style={{ position: "relative", height: 12, display: "flex", alignItems: "center", cursor: "pointer" }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "rgba(229,225,219,0.22)" }} />
            <div style={{ position: "absolute", left: 0, width: `${frac * 100}%`, height: 2, background: "#E5E1DB" }} />
            {ab.a != null && dur > 0 && <div style={{ position: "absolute", left: `${(ab.a / dur) * 100}%`, top: 0, bottom: 0, width: 1.5, background: "#E5E1DB" }} />}
            {ab.b != null && dur > 0 && <div style={{ position: "absolute", left: `${(ab.b / dur) * 100}%`, top: 0, bottom: 0, width: 1.5, background: "#E5E1DB" }} />}
            <div style={{ position: "absolute", left: `${frac * 100}%`, width: 9, height: 9, borderRadius: "50%", background: "#E5E1DB", transform: "translateX(-50%)", boxShadow: "0 1px 4px rgba(0,0,0,0.6)" }} />
          </div>
          {/* readout row: timecode · speed · A–B hint */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ ...SKB, fontSize: 10, letterSpacing: "0.08em", color: "rgba(229,225,219,0.55)", fontVariantNumeric: "tabular-nums" }}>{fmtTC(cur)} / {fmtTC(dur)}</span>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {[0.5, 1, 1.5, 2].map((s) => (
                <button key={s} onClick={(e) => { e.stopPropagation(); setSpeed(s); wake(); }}
                  style={{ ...SKB, fontSize: 9.5, letterSpacing: "0.04em", padding: "3px 6px", cursor: "pointer", border: "none", background: speed === s ? "#E5E1DB" : "transparent", color: speed === s ? "var(--on-ink)" : "rgba(229,225,219,0.5)" }}>{s}×</button>
              ))}
            </div>
            <span style={{ ...SKB, fontSize: 9, letterSpacing: "0.1em", color: ab.a != null || ab.b != null ? "rgba(229,225,219,0.6)" : "rgba(229,225,219,0.28)", textTransform: "uppercase" }}>
              {ab.a != null && ab.b != null ? "A–B ON · I/O" : "I/O A–B"}
            </span>
          </div>
        </div>
      ) : (
        /* §2 progress hairline (both platforms, all users) — tap/click seeks; fades ~2s idle. */
        <div
          ref={barRef}
          onClick={(e) => { e.stopPropagation(); seekToClientX(e.clientX); wake(); }}
          onPointerDown={desktop ? undefined : (e) => { e.stopPropagation(); }}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 16, display: "flex", alignItems: "flex-end", cursor: "pointer", pointerEvents: "auto", opacity: visible ? 1 : 0, transition: "opacity 300ms ease" }}
        >
          <div style={{ position: "relative", left: 0, right: 0, width: "100%", height: 1 }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: INK }} />
            <div style={{ position: "absolute", left: 0, width: `${frac * 100}%`, height: 1, background: "#E5E1DB" }} />
            {/* desktop non-Pro: subtle PRO mark → upsell (mobile shows nothing). */}
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
