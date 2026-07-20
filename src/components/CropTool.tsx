"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AR_CHIPS, type ArChip } from "@/lib/aspectRatio";
import { rotateCoverScale } from "@/lib/editGeometry";
import { neutralGeometry, type EditGeometry } from "@/lib/editGeometry";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const RED = "#E5E1DB";

interface CropToolProps {
  mediaUrl: string;
  mediaType: "image" | "video";
  /** collage users pick freely; everyone else is locked to their grid AR */
  allowArChoice: boolean;
  /** chip id to start on (the locked AR for non-collage) */
  initialAr: string;
  /**
   * OPTIONAL re-edit seed. When provided (in-suite CROP adjustment), the tool
   * opens showing this existing crop/straighten/rotate instead of a fresh
   * maximal-centred crop. Creation never passes it, so its absence is the exact
   * original behaviour — fully backward compatible.
   */
  initialGeometry?: EditGeometry;
  onCancel: () => void;
  onConfirm: (geometry: EditGeometry, layoutId: string) => void;
}

type Tab = "crop" | "rotate" | "skew";
type Handle = "nw" | "ne" | "sw" | "se" | "move";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const chipById = (id: string): ArChip =>
  AR_CHIPS.find((c) => c.id === id) ?? AR_CHIPS[1];

// A re-edit seed only counts when it carries REAL prior geometry. A full-frame,
// un-straightened, un-rotated geometry is the "nothing saved yet" sentinel: in
// that case we must NOT suppress computeMaxCrop, so CROP opens at the max crop
// for the locked AR (never a small/full-frame box). Creation passes no geometry,
// so this is false there — byte-for-byte the original fresh-crop path.
function hasPriorGeometry(g?: EditGeometry): boolean {
  if (!g) return false;
  const fullFrame = g.crop.x === 0 && g.crop.y === 0 && g.crop.w === 1 && g.crop.h === 1;
  return !(fullFrame && g.straighten === 0 && (((g.rotate % 360) + 360) % 360) === 0);
}

export default function CropTool({
  mediaUrl, mediaType, allowArChoice, initialAr, initialGeometry, onCancel, onConfirm,
}: CropToolProps) {
  const seeded = hasPriorGeometry(initialGeometry);
  const [ar, setAr] = useState<string>(() => (chipById(initialAr).id));
  const [crop, setCrop] = useState(() => seeded && initialGeometry ? { ...initialGeometry.crop } : { x: 0, y: 0, w: 1, h: 1 });
  const [straighten, setStraighten] = useState(() => seeded && initialGeometry ? initialGeometry.straighten : 0);
  const [rotate, setRotate] = useState(() => seeded && initialGeometry ? initialGeometry.rotate : 0); // 0 | 90 | 180 | 270
  // Only skip the mount-time crop reset when restoring REAL prior geometry. With
  // no prior geometry this stays false, so computeMaxCrop fires → max crop. The
  // guard is consumed on the first valid-layout run, so later AR/rotate changes
  // (incl. collage AR switches) always recompute the max crop.
  const seededRef = useRef<boolean>(seeded);
  const [tab, setTab] = useState<Tab>("crop");
  const [naturalAr, setNaturalAr] = useState(0); // un-rotated source w/h

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number; startY: number; mode: Handle;
    sx: number; sy: number; sw: number; sh: number; bW: number; bH: number;
  } | null>(null);
  const lastTap = useRef(0);

  const chip = chipById(ar);
  // Oriented source AR after the 90° rotate.
  const orientedAr = rotate === 90 || rotate === 270 ? (naturalAr ? 1 / naturalAr : 0) : naturalAr;

  // Maximal centred AR-locked crop for the current oriented media + chosen AR.
  const computeMaxCrop = useCallback((oAR: number, ratio: number) => {
    if (!oAR) return { x: 0, y: 0, w: 1, h: 1 };
    // fraction relation: w/h = ratio / oAR  (rect px AR == ratio)
    let w = 1, h = (oAR / ratio);
    if (h > 1) { h = 1; w = ratio / oAR; }
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }, []);

  // Reset crop whenever AR, rotate, or the media changes. When seeded for a
  // re-edit, skip exactly the first valid-layout run so the seeded crop survives
  // media load; every later AR/rotate change resets as normal.
  useEffect(() => {
    if (!orientedAr) return;
    if (seededRef.current) { seededRef.current = false; return; }
    setCrop(computeMaxCrop(orientedAr, chip.ratio));
  }, [ar, rotate, orientedAr, chip.ratio, computeMaxCrop]);

  // ── Crop drag ────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent, mode: Handle) => {
    e.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX, startY: e.clientY, mode,
      sx: crop.x, sy: crop.y, sw: crop.w, sh: crop.h, bW: rect.width, bH: rect.height,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.bW;
    const dy = (e.clientY - d.startY) / d.bH;
    const ratioFrac = chip.ratio / (orientedAr || 1); // w/h in fraction space

    if (d.mode === "move") {
      setCrop({
        x: clamp(d.sx + dx, 0, 1 - d.sw),
        y: clamp(d.sy + dy, 0, 1 - d.sh),
        w: d.sw, h: d.sh,
      });
      return;
    }

    // Corner resize, AR-locked. Anchor the opposite corner.
    const right = d.mode === "ne" || d.mode === "se";
    const bottom = d.mode === "sw" || d.mode === "se";
    const anchorX = right ? d.sx : d.sx + d.sw;
    const anchorY = bottom ? d.sy : d.sy + d.sh;

    // New width driven by horizontal drag toward/away from anchor.
    let newW = right ? d.sw + dx : d.sw - dx;
    newW = clamp(newW, 0.1, 1);
    let newH = newW / ratioFrac;
    if (newH > 1) { newH = 1; newW = newH * ratioFrac; }

    let nx = right ? anchorX : anchorX - newW;
    let ny = bottom ? anchorY : anchorY - newH;

    // Clamp into bounds without breaking AR.
    if (nx < 0) { nx = 0; }
    if (ny < 0) { ny = 0; }
    if (nx + newW > 1) { newW = 1 - nx; newH = newW / ratioFrac; }
    if (ny + newH > 1) { newH = 1 - ny; newW = newH * ratioFrac; if (!right) nx = anchorX - newW; }
    setCrop({ x: clamp(nx, 0, 1), y: clamp(ny, 0, 1), w: newW, h: newH });
  };

  const onPointerUp = () => { dragRef.current = null; };

  // ── Straighten ruler ─────────────────────────────────────────────────
  const rulerRef = useRef<HTMLDivElement>(null);
  const rulerDrag = useRef<{ startX: number; start: number } | null>(null);
  const onRulerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    rulerDrag.current = { startX: e.clientX, start: straighten };
  };
  const onRulerMove = (e: React.PointerEvent) => {
    const d = rulerDrag.current;
    if (!d) return;
    // 4px per degree
    let next = d.start - (e.clientX - d.startX) / 4;
    next = clamp(next, -45, 45);
    // soft detent at 0
    if (Math.abs(next) < 0.8) next = 0;
    setStraighten(Math.round(next * 10) / 10);
  };
  const onRulerUp = () => { rulerDrag.current = null; };
  const onRulerDoubleTap = () => setStraighten(0);

  // ── Output ───────────────────────────────────────────────────────────
  const handleConfirm = () => {
    const geom: EditGeometry = {
      ar,
      crop: { ...crop },
      straighten,
      rotate: ((rotate % 360) + 360) % 360,
      skew: { x: 0, y: 0 }, // deferred — always neutral
    };
    onConfirm(geom, ar);
  };

  // ── Preview transform — the CANONICAL contract (editGeometry/bake): cover
  // scale computed for the CROP WINDOW, applied about the CROP CENTRE. The old
  // full-media cover about the media centre showed a different window through
  // the overlay than the bake/suite/feed produce (the measured mismatch).
  const straightenCover = straighten !== 0 ? rotateCoverScale(straighten, crop.w, crop.h) : 1;
  const mediaTransform = `rotate(${rotate + straighten}deg) scale(${straightenCover})`;
  const mediaOrigin = `${(crop.x + crop.w / 2) * 100}% ${(crop.y + crop.h / 2) * 100}%`;

  // Crop rect in % for overlay.
  const cl = crop.x * 100, ct = crop.y * 100, cwp = crop.w * 100, chp = crop.h * 100;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000", display: "flex", flexDirection: "column" }}>
      {/* ── Top bar ── (safe-area: sits BELOW the status bar so Cancel/Confirm are never
          buried under the notch — inset-relative, identical across devices) */}
      <div style={{ flexShrink: 0, height: "calc(48px + env(safe-area-inset-top, 0px))", paddingTop: "env(safe-area-inset-top, 0px)", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 16, borderBottom: "1px solid rgba(229,225,219,0.08)" }}>
        <button onClick={onCancel} aria-label="Cancel" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 8, lineHeight: 0 }}>
          <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#E5E1DB" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.1em" }}>CROP</span>
        <button onClick={handleConfirm} aria-label="Confirm" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 8, lineHeight: 0 }}>
          <svg width="21.5" height="21.5" viewBox="0 0 18 18" fill="none"><path d="M3 9.5l4 4L15 5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {/* ── Stage ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 12 }}>
        <div
          ref={stageRef}
          style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", lineHeight: 0, touchAction: "none" }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {mediaType === "video" ? (
            <video
              src={mediaUrl} autoPlay muted loop playsInline
              onLoadedMetadata={(e) => { const v = e.currentTarget; setNaturalAr(v.videoWidth / v.videoHeight); }}
              style={{ display: "block", maxWidth: "100%", maxHeight: "62vh", transform: mediaTransform, transformOrigin: mediaOrigin, transition: "transform 0.05s linear" }}
            />
          ) : (
            <img
              src={mediaUrl} alt="Crop preview"
              onLoad={(e) => { const i = e.currentTarget; setNaturalAr(i.naturalWidth / i.naturalHeight); }}
              style={{ display: "block", maxWidth: "100%", maxHeight: "62vh", transform: mediaTransform, transformOrigin: mediaOrigin, transition: "transform 0.05s linear" }}
            />
          )}

          {/* Crop overlay */}
          {orientedAr > 0 && (
            <div
              onPointerDown={(e) => onPointerDown(e, "move")}
              style={{
                position: "absolute", zIndex: 6,
                left: `${cl}%`, top: `${ct}%`, width: `${cwp}%`, height: `${chp}%`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
                outline: `1px solid rgba(229,225,219,0.5)`,
                cursor: "grab", touchAction: "none",
              }}
            >
              {/* rule-of-thirds grid */}
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                <div style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 1, background: "rgba(229,225,219,0.25)" }} />
                <div style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 1, background: "rgba(229,225,219,0.25)" }} />
                <div style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 1, background: "rgba(229,225,219,0.25)" }} />
                <div style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 1, background: "rgba(229,225,219,0.25)" }} />
              </div>

              {/* red viewfinder corner brackets */}
              {([
                { id: "nw", s: { top: -1, left: -1 }, bt: true, bl: true },
                { id: "ne", s: { top: -1, right: -1 }, bt: true, br: true },
                { id: "sw", s: { bottom: -1, left: -1 }, bb: true, bl: true },
                { id: "se", s: { bottom: -1, right: -1 }, bb: true, br: true },
              ] as any[]).map(({ id, s, bt, br, bb, bl }) => (
                <div
                  key={id}
                  onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, id as Handle); }}
                  style={{ position: "absolute", width: 30, height: 30, cursor: `${id}-resize`, touchAction: "none", display: "flex", alignItems: "center", justifyContent: "center", ...s, ...(s.right !== undefined ? { transform: "translate(1px,0)" } : {}) }}
                >
                  <div style={{
                    position: "absolute", ...s,
                    width: 18, height: 18,
                    borderTop: bt ? `2px solid ${RED}` : "none",
                    borderRight: br ? `2px solid ${RED}` : "none",
                    borderBottom: bb ? `2px solid ${RED}` : "none",
                    borderLeft: bl ? `2px solid ${RED}` : "none",
                  }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── AR row — exactly four chips, full-width, outline scaled to true ratio ── */}
      <div style={{ flexShrink: 0, padding: "10px 12px 6px", borderTop: "1px solid rgba(229,225,219,0.06)" }}>
        {!allowArChoice && (
          <p style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(229,225,219,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px", textAlign: "center" }}>
            ASPECT LOCKED TO YOUR GRID
          </p>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: allowArChoice ? "space-between" : "center" }}>
          {/* collage → the real, selectable chooser (all four chips). standard →
              the single chosen chip only; no greyed "ghost" set of the others. */}
          {(allowArChoice ? AR_CHIPS : AR_CHIPS.filter((c) => c.id === ar)).map((c) => {
            const active = c.id === ar;
            const boxW = 40, boxH = Math.round(boxW / c.ratio);
            return (
              <button
                key={c.id}
                onClick={() => { if (allowArChoice) setAr(c.id); }}
                disabled={!allowArChoice}
                style={{
                  flex: allowArChoice ? 1 : "0 0 auto", background: "transparent", border: "none",
                  cursor: allowArChoice ? "pointer" : "default",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "4px 0",
                }}
              >
                <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: boxW, height: Math.max(boxH, 6), border: `1.5px solid ${active ? RED : "rgba(229,225,219,0.4)"}` }} />
                </div>
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: active ? RED : "rgba(229,225,219,0.55)", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center", lineHeight: 1.3 }}>
                  {c.label}
                </span>
                <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: active ? RED : "rgba(229,225,219,0.3)" }}>{c.ratioLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div style={{ flexShrink: 0, display: "flex", borderTop: "1px solid rgba(229,225,219,0.06)" }}>
        {([
          { id: "crop", label: "CROP + STRAIGHTEN" },
          { id: "rotate", label: "ROTATE" },
          { id: "skew", label: "SKEW" },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, background: "transparent", border: "none", cursor: "pointer",
              padding: "12px 0", borderBottom: tab === t.id ? `2px solid ${RED}` : "2px solid transparent",
            }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: tab === t.id ? "#E5E1DB" : "rgba(229,225,219,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flexShrink: 0, minHeight: 84, padding: "14px 16px 22px", borderTop: "1px solid rgba(229,225,219,0.06)" }}>
        {tab === "crop" && (
          <div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-13)', color: straighten === 0 ? "rgba(229,225,219,0.5)" : RED }}>
                {straighten > 0 ? "+" : ""}{straighten.toFixed(1)}°
              </span>
            </div>
            <div
              ref={rulerRef}
              onPointerDown={onRulerDown}
              onPointerMove={onRulerMove}
              onPointerUp={onRulerUp}
              onPointerLeave={onRulerUp}
              onDoubleClick={onRulerDoubleTap}
              style={{ position: "relative", height: 30, cursor: "ew-resize", touchAction: "none", overflow: "hidden" }}
            >
              {/* ticks */}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
                {Array.from({ length: 19 }).map((_, i) => {
                  const deg = (i - 9) * 5;
                  const offset = (deg - straighten) * 4; // px, 4px/deg
                  return (
                    <div key={i} style={{ position: "absolute", left: `calc(50% + ${offset}px)`, top: "50%", transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 1, height: deg % 15 === 0 ? 14 : 8, background: deg === 0 ? RED : "rgba(229,225,219,0.3)" }} />
                    </div>
                  );
                })}
              </div>
              {/* center detent marker */}
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1.5, background: RED, transform: "translateX(-50%)" }} />
            </div>
            <p style={{ ...SKR, fontSize: 'var(--fs-7)', color: "rgba(229,225,219,0.25)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em", margin: "8px 0 0" }}>
              Drag to straighten · double-tap to reset
            </p>
          </div>
        )}

        {tab === "rotate" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
            <button onClick={() => setRotate((r) => (r - 90 + 360) % 360)} style={{ background: "transparent", border: "1px solid rgba(229,225,219,0.2)", cursor: "pointer", padding: "10px 14px" }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em" }}>↺ 90°</span>
            </button>
            <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: "rgba(229,225,219,0.5)" }}>{rotate}°</span>
            <button onClick={() => setRotate((r) => (r + 90) % 360)} style={{ background: "transparent", border: "1px solid rgba(229,225,219,0.2)", cursor: "pointer", padding: "10px 14px" }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em" }}>↻ 90°</span>
            </button>
          </div>
        )}

        {tab === "skew" && (
          // SKEW — stubbed/deferred. Skew is a perspective (non-affine) transform
          // that cannot bake with plain canvas; it adopts the gl-react WebGL
          // pipeline in the same build as the first color tool. Inert for now;
          // edit_geometry.skew is persisted as {x:0,y:0}.
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, opacity: 0.5 }}>
            <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: "rgba(229,225,219,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>SKEW</span>
            <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: RED, textTransform: "uppercase", letterSpacing: "0.12em" }}>COMING SOON</span>
          </div>
        )}
      </div>
    </div>
  );
}
