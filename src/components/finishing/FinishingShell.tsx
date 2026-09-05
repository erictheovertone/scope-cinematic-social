"use client";

/**
 * FinishingShell — the editing-suite UI shell.
 *
 *   ┌───────────────────────────────────────────┐
 *   │ FINISHING                             DONE │  top bar
 *   ├───────────────────────────────────────────┤
 *   │                                           │
 *   │            <Pipeline> live stage          │  WebGL Surface
 *   │                                           │
 *   ├───────────────────────────────────────────┤
 *   │ CORRECTION  COLOR  DETAIL  TEXTURE  LOOKS  │  category tabs
 *   │ [EXPOSURE] [CONTRAST·SOON] [FADE·SOON] ... │  tool rail
 *   └───────────────────────────────────────────┘
 *   tool sheet slides up on the Scope snappy ease when a tool is opened.
 *
 * Only EXPOSURE opens a real sheet (one ToolSlider); every other tool is
 * visibly disabled ("SOON") — no fake panels. Cancel reverts to the on-open
 * snapshot; commit keeps the value.
 *
 * Pipeline is dynamically imported with ssr:false (WebGL is client-only).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { EditParams } from '@/lib/editor/params';
import { DEFAULT_PARAMS } from '@/lib/editor/params';
import ToolSlider from './ToolSlider';
import WhiteBalancePanel from './WhiteBalancePanel';
import SplitTonePanel from './SplitTonePanel';
import GrainPicker from './GrainPicker';
import CurvesPanel from './CurvesPanel';
import { CHANNELS, isIdentityChannel } from '@/lib/editor/curveEngine';
import CropEntry from './CropEntry';
import Tier1Modes from './nav/Tier1Modes';
import Tier2Subcats from './nav/Tier2Subcats';
import Tier3Items from './nav/Tier3Items';
import HistoryRipple from './nav/HistoryRipple';
import AddToPalette from './AddToPalette';
import LooksLibrary from './LooksLibrary';
import PaletteTile from './PaletteTile';
import VideoScrubber from './VideoScrubber';
import LookSavedOverlay, { type Rect as StageRect } from './LookSavedOverlay';
import { captureLookThumb } from '@/lib/editor/bakeLook';
import { type HistoryEvent, toolChanged, describeTool, makeEvent } from '@/lib/editor/history';
import type { SavedLook } from '@/lib/looksService';
import { lookById } from './looksCatalog';
import { ensureLut } from '@/lib/editor/lut';
import { modeDef, firstSubcat, editItemsFor, type Mode, type EditTool } from './nav/navModel';
import { AR_CHIPS, chipForLayout } from '@/lib/aspectRatio';
import { rotateCoverScale, type EditGeometry } from '@/lib/editGeometry';
import { useUpsell } from '@/components/UpsellProvider';

const Pipeline = dynamic(() => import('./Pipeline'), { ssr: false });

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#E5E1DB';
const SNAP = 'cubic-bezier(0.16,0.84,0.3,1)'; // Scope snappy ease

// "+" viewing-menu item styles (sharp corners, black, red accent — design system).
const menuItem: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
};
const menuLabel: React.CSSProperties = { ...SKB, fontSize: 'var(--fs-9)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'inherit' };
const menuTag: React.CSSProperties = { ...SKB, fontSize: 'var(--fs-7)', textTransform: 'uppercase', letterSpacing: '0.1em', color: RED };

type Source = HTMLImageElement | HTMLVideoElement;

function sourceAspect(s: Source): number {
  if (typeof HTMLVideoElement !== 'undefined' && s instanceof HTMLVideoElement) {
    return s.videoWidth && s.videoHeight ? s.videoWidth / s.videoHeight : 16 / 9;
  }
  const img = s as HTMLImageElement;
  return img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 16 / 9;
}

// Maximal centred AR-locked crop (mirrors CropTool.computeMaxCrop) — used to
// frame the preview when geometry carries no real crop yet.
function maxArCrop(orientedAr: number, ratio: number) {
  let w = 1, h = orientedAr / ratio;
  if (h > 1) { h = 1; w = ratio / orientedAr; }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
const isFullFrame = (c: { x: number; y: number; w: number; h: number }) =>
  c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1;

// CROP tile turns red once geometry differs from the on-open baseline.
function geomChanged(a: EditGeometry | null, b: EditGeometry | null): boolean {
  if (!a || !b) return false;
  return (
    a.ar !== b.ar ||
    a.straighten !== b.straighten ||
    ((a.rotate % 360) + 360) % 360 !== ((b.rotate % 360) + 360) % 360 ||
    a.crop.x !== b.crop.x || a.crop.y !== b.crop.y || a.crop.w !== b.crop.w || a.crop.h !== b.crop.h
  );
}

// Slider tool key → EditParams field (WB temp/tint are handled by the WB panel).
function sliderValue(params: EditParams, key: string): number {
  switch (key) {
    case 'exposure': return params.exposure;
    case 'denoise': return params.denoise;
    case 'contrast': return params.contrast;
    case 'saturation': return params.saturation;
    case 'fade': return params.fade;
    case 'sharpen': return params.sharpen;
    case 'vignette': return params.vignette;
    case 'skinTone': return params.skinTone;
    case 'bloom': return params.bloom;
    case 'halation': return params.halation;
    case 'clarity': return params.clarity;
    case 'blur': return params.blur;
    default: return 0;
  }
}
function setSliderValue(params: EditParams, key: string, stop: number): EditParams {
  switch (key) {
    case 'exposure': return { ...params, exposure: stop };
    case 'denoise': return { ...params, denoise: stop };
    case 'contrast': return { ...params, contrast: stop };
    case 'saturation': return { ...params, saturation: stop };
    case 'fade': return { ...params, fade: stop };
    case 'sharpen': return { ...params, sharpen: stop };
    case 'vignette': return { ...params, vignette: stop };
    case 'skinTone': return { ...params, skinTone: stop };
    case 'bloom': return { ...params, bloom: stop };
    case 'halation': return { ...params, halation: stop };
    case 'clarity': return { ...params, clarity: stop };
    case 'blur': return { ...params, blur: stop };
    default: return params;
  }
}

interface FinishingShellProps {
  source: Source | null;
  params: EditParams;
  onParamsChange: (p: EditParams) => void;
  onDone: () => void;
  /** Optional back affordance (creation flow → returns to crop). Omitted in the dev harness. */
  onBack?: () => void;
  // ── GEOMETRY stage (in-suite CROP) ──
  /** the post's current edit_geometry (drives the framed preview + crop seed) */
  geometry: EditGeometry;
  /** persists adjusted geometry to edit_geometry ONLY — never layout_id */
  onGeometryChange: (g: EditGeometry) => void;
  /** standard → AR locked to layoutId; collage → AR unlocked */
  gridLayout: 'standard' | 'collage';
  /** the post's immutable canonical AR (layout_id) */
  layoutId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  /**
   * Verified Pro status (DID → users.privy_id → profiles.paid_member_until).
   * Computed by the caller via the EXISTING membership check and passed in — the
   * shell never queries tier itself. Drives the generic pro-lock gate below.
   */
  isPro: boolean;
  // ── ADD TO PALETTE (save current edits as a Look) — persistence owned by the
  //    caller (real looksService + uuid in the post flow; mock in the dev harness). ──
  savedLooks?: SavedLook[];
  /** Persist the look. Resolves true on a CONFIRMED insert success (drives the
   *  "added to palette" confirmation animation); false/void = no animation. */
  onSaveLook?: (name: string, params: EditParams, thumb?: Blob) => void | Promise<boolean | void>;
}

export default function FinishingShell({
  source, params, onParamsChange, onDone, onBack,
  geometry, onGeometryChange, gridLayout, layoutId, mediaUrl, mediaType, isPro,
  savedLooks = [], onSaveLook,
}: FinishingShellProps) {
  const { showUpsell } = useUpsell();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  // "Added to Palette" confirmation animation + PALETTE tab arrival ping.
  const [saveAnim, setSaveAnim] = useState<{ id: number; source: StageRect; target: { x: number; y: number } } | null>(null);
  const [tabPing, setTabPing] = useState<Mode | null>(null);
  const saveAnimId = useRef(0);
  // ── three-tier cascade: mode → subcategory → items ──
  const [activeMode, setActiveMode] = useState<Mode>('edit');
  const [activeSubcat, setActiveSubcat] = useState<string>(() => firstSubcat('edit'));
  const [activeTool, setActiveTool] = useState<EditTool | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  // Full params snapshot taken when a tool panel opens — cancel restores it.
  // (Only the active tool mutates params while its sheet is open, so this is exact.)
  const snapshot = useRef<EditParams>(params);
  // Geometry as it was when the suite opened — the CROP tile lights red once the
  // user commits a reframe that differs from this.
  const baselineGeometry = useRef<EditGeometry>(geometry);

  // ── Real edit history (Part 1) — one SETTLED event per tool change ──
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const cropSnapshot = useRef<EditGeometry>(geometry); // geometry when CROP opened
  const logTool = (tool: EditTool, p: EditParams) => {
    const { label, value } = describeTool(tool, p);
    setHistory((h) => [...h, makeEvent(tool.key, label, value)]);
  };

  // Active LOOK LUT (parsed from the selected .cube; loaded async, applied in the
  // LOOK stage of the preview + bake). Null when no look / not yet loaded.
  const [activeLut, setActiveLut] = useState<{ canvas: HTMLCanvasElement; size: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const look = lookById(params.lutId);
    if (!look) { setActiveLut(null); return; }
    ensureLut(look.id, look.file)
      .then((e) => { if (!cancelled) setActiveLut({ canvas: e.canvas, size: e.parsed.size }); })
      .catch(() => { if (!cancelled) setActiveLut(null); });
    return () => { cancelled = true; };
  }, [params.lutId]);

  // ── Responsive: Theatre layout (Brief: Theatre Editor) ──
  // Theatre = wide screens by default (desktop + tablet), OR a phone rotated to
  // landscape, OR the "+" menu's Theatre toggle. Portrait phone keeps the stacked
  // editor. Layout-only — same pipeline/tools/params/navModel.
  const [vp, setVp] = useState(() => (typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : { w: 0, h: 0 }));
  useEffect(() => {
    const measure = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); };
  }, []);
  const [theatreToggle, setTheatreToggle] = useState(false);
  const [subcatMenuOpen, setSubcatMenuOpen] = useState(false); // mobile-landscape lower-left "+"
  const wide = vp.w >= 768;                          // desktop + tablet → Theatre default
  const landscapeNarrow = vp.w > 0 && vp.w < 768 && vp.w > vp.h; // phone rotated to landscape
  const theatre = wide || landscapeNarrow || theatreToggle;
  const compactRail = theatre && !wide;              // landscape-mobile / toggled-portrait density
  // ── Theatre browsing ↔ ADJUSTING shift ──
  // Tapping a tool enters "adjusting": the Tier-2/Tier-3 rows collapse, the image
  // expands, and a thin slider bar shows the active control below the image.
  // Theatre-only; portrait keeps its slide-up sheet. Same mounted editor — a pure
  // visibility/layout state change (never a remount).
  const adjusting = theatre && !!activeTool && (activeMode === 'edit' || activeMode === 'fx');

  // ── VIEW state (the "+" menu + image gestures) — preview-only, NEVER stored/baked ──
  const [menuOpen, setMenuOpen] = useState(false);
  const [peek, setPeek] = useState(false);   // hold-to-peek original (transient, while held)
  const [zoom, setZoom] = useState({ active: false, level: 2, panX: 0.5, panY: 0.5 });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{ x: number; y: number; moved: boolean; held: boolean } | null>(null);
  const panLast = useRef<{ x: number; y: number } | null>(null);

  // Hold the image = show original (bypass all EditParams); release = edited. View-only.
  const showingOriginal = peek;
  const previewParams = showingOriginal ? DEFAULT_PARAMS : params;

  const toggleZoom = () => {
    setZoom((z) => z.active ? { ...z, active: false } : { active: true, level: 2, panX: 0.5, panY: 0.5 });
    setMenuOpen(false);
  };

  // Measure the stage and fit the Surface to the source AR.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The live stage shows the post AS FRAMED by edit_geometry, so a committed
  // reframe is immediately visible. The target-AR crop window is fit to the
  // stage; the full image (rendered by the gl-react Pipeline) is scaled so its
  // crop window fills that frame and offset to the crop origin. straighten is
  // exact; rotate is approximate when combined with an off-centre crop — the
  // same contract as editGeometry.geometryMediaStyle (real bake is exact).
  const geomPreview = useMemo(() => {
    if (!source || stage.w <= 0 || stage.h <= 0) return null;
    const baseAr = sourceAspect(source);
    const rot = ((geometry.rotate % 360) + 360) % 360;
    const orientedAr = rot === 90 || rot === 270 ? (baseAr ? 1 / baseAr : 0) : baseAr;
    if (!orientedAr) return null;
    const chip = AR_CHIPS.find((c) => c.id === geometry.ar) ?? chipForLayout(layoutId);

    // No real crop yet (full-frame sentinel) ⇒ frame at the AR max crop — exactly
    // what CROP opens at and how the post renders. A real saved crop is used as-is.
    const crop = isFullFrame(geometry.crop) ? maxArCrop(orientedAr, chip.ratio) : geometry.crop;

    // Crop window at display size, fit into the stage.
    let fw = stage.w, fh = stage.w / chip.ratio;
    if (fh > stage.h) { fh = stage.h; fw = stage.h * chip.ratio; }

    const cw = Math.max(crop.w, 0.0001);
    const ch = Math.max(crop.h, 0.0001);
    const sw = fw / cw; // full-image display size (AR-consistent crop ⇒ sw/sh == orientedAr)
    const sh = fh / ch;

    const cover = geometry.straighten !== 0
      ? rotateCoverScale(geometry.straighten, crop.w, crop.h) : 1;
    const spin = rot + geometry.straighten;

    return {
      fw: Math.round(fw), fh: Math.round(fh),
      sw: Math.round(sw), sh: Math.round(sh),
      left: -crop.x * sw, top: -crop.y * sh,
      spin, cover,
      // rotate/straighten about the crop centre so the framed window stays put
      originX: (crop.x + crop.w / 2) * 100,
      originY: (crop.y + crop.h / 2) * 100,
    };
  }, [source, stage, geometry, layoutId]);

  // ZOOM view — RE-RENDER the pipeline at higher resolution (true grain/denoise
  // detail, not a CSS upscale of the fit-res canvas), then show a panned window.
  // The Surface is rendered at sw·z (capped at MAXDIM); if capped, a CSS scale
  // fills the remainder (softer past the cap). rotate/straighten are dropped in
  // the zoom inspect view (grain/denoise are orientation-agnostic; they remain
  // exact in fit view + bake).
  const zoomView = useMemo(() => {
    if (!zoom.active || !geomPreview) return null;
    const MAXDIM = 4096;
    const z = Math.max(1, zoom.level);
    const { fw, fh, sw, sh, left, top } = geomPreview;
    const renderZ = Math.min(z, MAXDIM / sw, MAXDIM / sh);
    const renderW = Math.round(sw * renderZ);
    const renderH = Math.round(sh * renderZ);
    const css = z / renderZ; // ≥1; CSS upscale only when render hit the cap
    const maxPanX = fw * z - fw;
    const maxPanY = fh * z - fh;
    return {
      fw, fh, renderW, renderH, css,
      left: left * z - zoom.panX * maxPanX,
      top: top * z - zoom.panY * maxPanY,
    };
  }, [zoom, geomPreview]);

  // Combined IMAGE-STAGE gesture — handlers live ONLY on the stage element (never
  // window/document; no pointer capture, so nothing can get stuck swallowing the
  // tool rail / tier rows). A stationary press → hold-to-peek the original; a drag
  // (only when zoomed) → pan. Movement past a small threshold cancels peek and
  // becomes a pan; release always restores. Editing controls live in the dock and
  // are untouched, so editing while zoomed works and the zoomed region updates live.
  const STAGE_HOLD_MS = 180;
  const STAGE_MOVE_PX = 6;
  const onStagePointerDown = (e: React.PointerEvent) => {
    gesture.current = { x: e.clientX, y: e.clientY, moved: false, held: false };
    panLast.current = { x: e.clientX, y: e.clientY };
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      if (gesture.current && !gesture.current.moved) { gesture.current.held = true; setPeek(true); }
    }, STAGE_HOLD_MS);
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > STAGE_MOVE_PX) {
      g.moved = true; // it's a drag, not a hold
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
      setPeek(false);
    }
    if (zoom.active && g.moved && panLast.current && geomPreview) {
      const dx = e.clientX - panLast.current.x;
      const dy = e.clientY - panLast.current.y;
      panLast.current = { x: e.clientX, y: e.clientY };
      const maxPanX = geomPreview.fw * zoom.level - geomPreview.fw;
      const maxPanY = geomPreview.fh * zoom.level - geomPreview.fh;
      setZoom((zm) => ({
        ...zm,
        panX: maxPanX > 0 ? Math.min(1, Math.max(0, zm.panX - dx / maxPanX)) : 0.5,
        panY: maxPanY > 0 ? Math.min(1, Math.max(0, zm.panY - dy / maxPanY)) : 0.5,
      }));
    }
  };
  const onStagePointerUp = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    const g = gesture.current;
    setPeek(false);
    panLast.current = null;
    gesture.current = null;
    // Theatre: a clean TAP on the image (no drag, no hold-peek) while adjusting
    // returns to browsing — committing the active tool so its value persists.
    if (adjusting && g && !g.moved && !g.held) commitTool();
  };

  const cropAdjusted = geomChanged(geometry, baselineGeometry.current);
  const openCrop = () => { if (source) { cropSnapshot.current = geometry; setCropOpen(true); } };

  // Cascade: changing mode resets the subcategory to that mode's first.
  const changeMode = (m: Mode) => {
    setActiveMode(m);
    setActiveSubcat(firstSubcat(m));
  };

  // EDIT-tool state.
  const toolEnabled = (t: EditTool) => t.enabled && (t.kind !== 'geometry' || !!source);
  const toolTouched = (t: EditTool) => {
    if (t.key === 'crop') return cropAdjusted;
    if (t.kind === 'wb') return params.whiteBalance.t !== 0 || params.whiteBalance.tint !== 0;
    if (t.kind === 'grain') return params.grainStock !== null && params.grainIntensity > 0;
    if (t.kind === 'splitTone') {
      const s = params.splitTone;
      return (s.shadowsHue !== null && s.shadowsStrength > 0) || (s.highlightsHue !== null && s.highlightsStrength > 0);
    }
    if (t.kind === 'curve') return CHANNELS.some((c) => !isIdentityChannel(c.key, params.curves[c.key]));
    return sliderValue(params, t.key) !== 0;
  };
  // GENERIC pro-lock — any pro:true tool flows through this; future Pro tools
  // get the lock + upsell for free just by setting pro:true (no per-tool code).
  const toolLocked = (t: EditTool) => t.enabled && !!t.pro && !isPro;

  // ── THE DUST LIFT — post-purchase unlock choreography ───────────────────────
  // While the Pro celebration covers the screen the state is ALREADY refreshed
  // (toolLocked → false, everything tappable); the lock VISUALS are held as
  // ghosts ('armed') so nothing flashes open early. On the celebration-done cue
  // they dissolve upward like dust ('playing', CSS below), then unmount
  // ('done'). Plays ONCE, only when this mount actually showed locks.
  const [dustPhase, setDustPhase] = useState<'idle' | 'armed' | 'playing' | 'done'>('idle');
  const everLockedRef = useRef(false);
  if (!isPro) everLockedRef.current = true;
  useEffect(() => {
    if (isPro && everLockedRef.current && dustPhase === 'idle') setDustPhase('armed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro]);
  useEffect(() => {
    if (dustPhase !== 'armed') return;
    const play = () => {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) { setDustPhase('done'); return; } // no motion: locks simply disappear
      setDustPhase('playing');
      window.setTimeout(() => setDustPhase('done'), 1600);
    };
    window.addEventListener('scope:pro-celebration-done', play);
    const safety = window.setTimeout(play, 12_000); // ghosts must never persist
    return () => { window.removeEventListener('scope:pro-celebration-done', play); window.clearTimeout(safety); };
  }, [dustPhase]);
  const lockDust = dustPhase === 'armed' ? 'hold' as const : dustPhase === 'playing' ? 'play' as const : null;
  const onOpenTool = (t: EditTool) => {
    if (!toolEnabled(t)) return;
    if (toolLocked(t)) { showUpsell('edit'); return; } // free user → upsell, tool stays closed
    // Switch-away = implicit commit: settle the previously-open tool if it changed.
    if (activeTool && activeTool.key !== t.key && toolChanged(activeTool, params, snapshot.current)) {
      logTool(activeTool, params);
    }
    if (t.key === 'crop') { openCrop(); return; }
    snapshot.current = params; // full snapshot for cancel/revert (slider or WB)
    setActiveTool(t);
  };
  const cancelTool = () => {
    onParamsChange(snapshot.current); // revert → no history event
    setActiveTool(null);
  };
  const commitTool = () => {
    // Settle: log ONE event for this tool if its value changed since it opened.
    if (activeTool && toolChanged(activeTool, params, snapshot.current)) logTool(activeTool, params);
    setActiveTool(null);
  };

  const editItems = activeMode === 'edit' ? editItemsFor(activeSubcat) : [];

  // Save the current edit stack as a Look (ADD TO PALETTE). Pro-gating + persistence
  // are handled by AddToPalette (upsell) and the caller's onSaveLook respectively.
  // Video gets a scrub bar + hero-frame workflow; photos never do.
  const isVideoSource = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
  // Persist the paused "hero frame" timestamp into params (metadata only). Stable
  // via a ref so the scrubber's listeners don't re-bind on every param change.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const handleHeroFrame = useCallback((t: number) => {
    if (Math.abs((paramsRef.current.heroFrameTime ?? 0) - t) < 0.001) return; // no churn
    onParamsChange({ ...paramsRef.current, heroFrameTime: t });
  }, [onParamsChange]);

  const saveLook = async (name: string) => {
    // Capture a thumbnail of the CURRENT frame WITH the look applied — this is the
    // only moment the local source blob and the look coexist (it can't be
    // re-rendered later). Best-effort: a capture failure must NOT block the save.
    //
    // PRIVACY: this burns in the user's current frame, which may be a photo they
    // never published. Acceptable ONLY because the PALETTE is PRIVATE to the user
    // (own saved looks). If palettes ever become shareable/sellable, a
    // consent/regenerate step MUST be added before any thumbnail is reused.
    let thumb: Blob | undefined;
    try {
      if (source) thumb = (await captureLookThumb(source, params)) ?? undefined;
    } catch (e) {
      console.warn('[FinishingShell] look thumbnail capture failed (saving anyway):', e);
    }
    // Only animate on a CONFIRMED insert success — never on a failed/pending write.
    const ok = await onSaveLook?.(name, params, thumb);
    if (ok) triggerLookSaved();
  };

  // "Added to Palette" confirmation: snap brackets onto the image → fly to the
  // PALETTE tab → ping it → text. Resolves the tab's LIVE position (portrait dock
  // vs Theatre rail) via the data-finishing-mode locator. id bumps each save so a
  // rapid re-save remounts the overlay and restarts cleanly.
  const triggerLookSaved = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const sr = stage.getBoundingClientRect();
    const source: StageRect = { left: sr.left, top: sr.top, width: sr.width, height: sr.height };
    let target = { x: sr.left + sr.width / 2, y: window.innerHeight - 28 }; // fallback: bottom-centre
    const tab = document.querySelector('[data-finishing-mode="palette"]') as HTMLElement | null;
    if (tab) { const tr = tab.getBoundingClientRect(); target = { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 }; }
    saveAnimId.current += 1;
    setSaveAnim({ id: saveAnimId.current, source, target });
  };
  const applySavedLook = (look: SavedLook) => { onParamsChange(look.params); }; // re-load onto CURRENT image only

  // Built-in look apply/clear/intensity (lutId + lutIntensity in EditParams).
  const applyBuiltinLook = (lookId: string) => {
    const look = lookById(lookId);
    onParamsChange({ ...params, lutId: lookId, lutIntensity: params.lutIntensity > 0 ? params.lutIntensity : 12 });
    if (look) setHistory((h) => [...h, makeEvent('lutIntensity', 'LOOK', look.name)]);
  };
  const clearLook = () => onParamsChange({ ...params, lutId: null, lutIntensity: 0 });
  const setLutIntensity = (stop: number) => onParamsChange({ ...params, lutIntensity: stop });

  // "+" viewing-menu items — shared by phone (below) and Theatre.
  const menuItemsContent = (
    <>
      <button onClick={toggleZoom} style={{ ...menuItem, color: zoom.active ? RED : '#E5E1DB' }}>
        <span style={menuLabel}>ZOOM</span>
        {zoom.active && <span style={menuTag}>ON</span>}
      </button>
      <button onClick={() => { setTheatreToggle((o) => !o); setMenuOpen(false); }} style={{ ...menuItem, color: theatre ? RED : '#E5E1DB', borderTop: '1px solid rgba(229,225,219,0.1)' }}>
        <span style={menuLabel}>THEATRE EDITOR</span>
        {theatre && <span style={menuTag}>ON</span>}
      </button>
    </>
  );

  // The live stage content (Pipeline preview + BEFORE badge) — identical pixels
  // in both layouts; only the surrounding container differs.
  const stageInner = (
    <>
      {source && geomPreview ? (
        zoomView ? (
          <div style={{ position: 'relative', width: zoomView.fw, height: zoomView.fh, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: zoomView.left, top: zoomView.top, width: zoomView.renderW, height: zoomView.renderH, transform: zoomView.css !== 1 ? `scale(${zoomView.css})` : undefined, transformOrigin: 'top left' }}>
              <Pipeline source={source} params={previewParams} width={zoomView.renderW} height={zoomView.renderH} activeLut={activeLut} />
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', width: geomPreview.fw, height: geomPreview.fh, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: geomPreview.left, top: geomPreview.top, width: geomPreview.sw, height: geomPreview.sh, transform: geomPreview.spin !== 0 || geomPreview.cover !== 1 ? `rotate(${geomPreview.spin}deg) scale(${geomPreview.cover})` : undefined, transformOrigin: `${geomPreview.originX}% ${geomPreview.originY}%` }}>
              <Pipeline source={source} params={previewParams} width={geomPreview.sw} height={geomPreview.sh} activeLut={activeLut} />
            </div>
          </div>
        )
      ) : (
        <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>LOADING…</span>
      )}
      {showingOriginal && (
        <div style={{ position: 'absolute', top: 10, left: 10, background: RED, padding: '3px 7px' }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#000', textTransform: 'uppercase', letterSpacing: '0.1em' }}>BEFORE</span>
        </div>
      )}
    </>
  );

  // Mode-contextual band body (history ripple · looks library · saved palette ·
  // EDIT/FX tool rail) — same navModel-driven switch in both layouts. `lean` only
  // affects the EDIT/FX tool rail (Theatre = leaner, borderless tiles); the
  // history/looks/palette sections are identical regardless.
  const renderBandBody = (lean: boolean) => (
    activeMode === 'history' ? (
      <div>
        <HistoryRipple events={history} />
        <div style={{ padding: '4px 16px 14px' }}>
          <AddToPalette isPro={isPro} onUpsell={() => showUpsell('edit')} onSave={saveLook} />
        </div>
      </div>
    ) : activeMode === 'looks' ? (
      <LooksLibrary lockDust={lockDust} source={source} isPro={isPro} onUpsell={() => showUpsell('edit')} activeLookId={params.lutId} intensity={params.lutIntensity} onApply={applyBuiltinLook} onClear={clearLook} onIntensity={setLutIntensity} />
    ) : activeMode === 'palette' ? (
      <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AddToPalette isPro={isPro} onUpsell={() => showUpsell('edit')} onSave={saveLook} />
        {savedLooks.length === 0 ? (
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.6 }}>NO SAVED LOOKS YET · ADD TO PALETTE SAVES YOUR CURRENT EDIT</span>
        ) : (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {savedLooks.map((look) => (
              <PaletteTile key={look.id} look={look} onTap={() => applySavedLook(look)} />
            ))}
          </div>
        )}
      </div>
    ) : (
      <>
        {/* Dust-lift keyframes — used by the ghost locks here and in LooksLibrary. */}
        <style>{`
          @keyframes pro-dust { to { opacity: 0; transform: translateY(-10px) scale(1.08); filter: blur(5px); } }
          .pro-dust-play { animation: pro-dust 450ms ease-out forwards; }
        `}</style>
        <Tier3Items mode={activeMode} editItems={editItems} toolTouched={toolTouched} toolEnabled={toolEnabled} toolLocked={toolLocked} onOpenTool={onOpenTool} lean={lean} lockDust={lockDust} />
      </>
    )
  );

  // Active tool's control (no chrome) — docked in the Theatre band; in the phone
  // slide-up sheet below. Shared switch so a navModel tool works in both.
  const toolControlBody = (
    <>
      {activeTool?.kind === 'wb' && (
        <WhiteBalancePanel temp={params.whiteBalance.t} tint={params.whiteBalance.tint} onChange={(wb) => onParamsChange({ ...params, whiteBalance: wb })} />
      )}
      {activeTool && activeTool.kind === 'slider' && (
        <ToolSlider type={activeTool.sliderType ?? 'bi'} value={sliderValue(params, activeTool.key)} onChange={(stop) => onParamsChange(setSliderValue(params, activeTool.key, stop))} label={activeTool.label} />
      )}
      {activeTool?.kind === 'grain' && (
        <GrainPicker stock={params.grainStock} intensity={params.grainIntensity} onChange={({ grainStock, grainIntensity }) => onParamsChange({ ...params, grainStock, grainIntensity })} />
      )}
      {activeTool?.kind === 'splitTone' && (
        <SplitTonePanel value={params.splitTone} onChange={(splitTone) => onParamsChange({ ...params, splitTone })} />
      )}
      {activeTool?.kind === 'curve' && (
        <CurvesPanel curves={params.curves} onChange={(curves) => onParamsChange({ ...params, curves })} isPro={isPro} onUpsell={() => showUpsell('edit')} />
      )}
    </>
  );

  // Small red ‹ back affordance — returns to browsing (commits, value persists).
  const backToBrowsing = (
    <button onClick={commitTool} aria-label="Back to tools" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0, flexShrink: 0 }}>
      <svg width="17.5" height="17.5" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke={RED} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );

  // ── Theatre ADJUSTING bar — thin control below the image (replaces the old
  //    three-stacked-bands docked control). Slider tools = one thin line
  //    (back · name · track · value); curve/compound tools present their existing
  //    panel here. Same params/pipeline as the portrait editor. ──
  const adjustingBar = activeTool && (
    <div style={{ borderTop: '1px solid rgba(229,225,219,0.08)', background: '#000', padding: activeTool.kind === 'slider' ? '7px 14px 9px' : '9px 14px 14px' }}>
      {activeTool.kind === 'slider' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {backToBrowsing}
          <ToolSlider inline type={activeTool.sliderType ?? 'bi'} value={sliderValue(params, activeTool.key)} onChange={(stop) => onParamsChange(setSliderValue(params, activeTool.key, stop))} label={activeTool.label} />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {backToBrowsing}
            <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{activeTool.label}</span>
            {activeTool.pro && <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: RED, textTransform: 'uppercase', letterSpacing: '0.12em', border: `1px solid ${RED}`, padding: '1px 4px' }}>PRO</span>}
          </div>
          {toolControlBody}
        </>
      )}
    </div>
  );

  const cropOverlay = cropOpen && source && (
    <CropEntry
      mediaUrl={mediaUrl} mediaType={mediaType} geometry={geometry} gridLayout={gridLayout} layoutId={layoutId}
      onCommit={(g) => { if (geomChanged(g, cropSnapshot.current)) setHistory((h) => [...h, makeEvent('crop', 'CROP', '')]); onGeometryChange(g); setCropOpen(false); }}
      onCancel={() => setCropOpen(false)}
    />
  );

  // ════════════════════════ UNIFIED EDITOR LAYOUT ════════════════════════
  // ONE persistent editor: the stage (decoded source + gl-react Pipeline) mounts
  // ONCE and STAYS mounted across the portrait↔Theatre switch. Theatre and
  // portrait are two ARRANGEMENTS of the SAME editor — never two editors. Only the
  // chrome around the stage (top bar, mode rail, bottom band/dock) re-arranges.
  //
  // Stable `key`s on the root's direct children let React match the persistent
  // stage (key="main") across the toggle instead of unmounting/remounting it —
  // a remount would re-decode the image (the stuck LOADING bug) and reset all
  // edits/history. Rotating or toggling Theatre now re-flows the same editor.
  const showSubcats = activeMode !== 'history' && activeMode !== 'looks';
  const arChip = AR_CHIPS.find((c) => c.id === geometry.ar) ?? chipForLayout(layoutId);
  const railW = compactRail ? 58 : 86;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column',
      // Hold-to-compare is a long-press → iOS fires text-selection/callout (the screen
      // goes blue). Kill selection across the whole suite surface; inputs opt back in.
      userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      {/* menu backdrop — outside tap closes (menu animates out via its own transition) */}
      {menuOpen && <div key="menu-backdrop" onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />}

      {/* ── TOP BAR ── (Theatre: thin bar w/ inline "+" menu · Portrait: standard bar) */}
      {theatre ? (
        <div key="topbar" style={{ flexShrink: 0, height: `calc(${compactRail ? 30 : 44}px + env(safe-area-inset-top, 0px))`, paddingTop: 'env(safe-area-inset-top, 0px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14, paddingRight: 14, borderBottom: '1px solid rgba(229,225,219,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onBack && (
              <button onClick={onBack} aria-label="Back" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
                <svg width="17.5" height="17.5" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="#E5E1DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            <span style={{ ...SKB, fontSize: compactRail ? 10 : 12, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>FINISHING · THEATRE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* "+" viewing menu (inline in the bar) */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen((o) => !o)} aria-label="Viewing options" style={{ width: 24, height: 24, background: 'transparent', cursor: 'pointer', lineHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${menuOpen ? RED : 'rgba(229,225,219,0.25)'}`, color: menuOpen || zoom.active ? RED : '#E5E1DB', transition: `border-color 0.3s ${SNAP}, color 0.3s ${SNAP}` }}>
                <svg width="14.5" height="14.5" viewBox="0 0 12 12" fill="none" style={{ transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)', transition: `transform 0.3s ${SNAP}` }}><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, minWidth: 150, background: '#000', border: '1px solid rgba(229,225,219,0.18)', transformOrigin: 'top right', transform: menuOpen ? 'scale(1)' : 'scale(0.7)', opacity: menuOpen ? 1 : 0, pointerEvents: menuOpen ? 'auto' : 'none', transition: `transform ${menuOpen ? 0.3 : 0.2}s ${SNAP}, opacity ${menuOpen ? 0.3 : 0.2}s ${SNAP}` }}>
                {menuItemsContent}
              </div>
            </div>
            <button onClick={onDone} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
              <span style={{ ...SKB, fontSize: compactRail ? 10 : 12, color: RED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>DONE</span>
            </button>
          </div>
        </div>
      ) : (
        <div key="topbar" style={{ flexShrink: 0, height: 'calc(50px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 18, borderBottom: '1px solid rgba(229,225,219,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {onBack && (
              <button onClick={onBack} aria-label="Back" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
                <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="#E5E1DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>FINISHING</span>
          </div>
          {/* Right cluster: "+" viewing menu to the LEFT of DONE (the "+" used to be an
              absolute top:56 element that slid UNDER DONE beneath the notch). Both ≥44px
              tap targets + press treatment; DONE stays top-right. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!theatre && (
              <div style={{ position: 'relative' }}>
                <button onClick={() => setMenuOpen((o) => !o)} aria-label="Viewing options" className="tappable" style={{ width: 44, height: 44, background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: menuOpen || zoom.active ? RED : '#E5E1DB', transition: `color 0.3s ${SNAP}` }}>
                  {/* Bare glyph — no box border (the repositioning wrapper's white box removed). */}
                  <svg width="18" height="18" viewBox="0 0 12 12" fill="none" style={{ transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)', transition: `transform 0.3s ${SNAP}` }}><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
                <div style={{ position: 'absolute', top: 'calc(100% + 2px)', right: 0, zIndex: 30, minWidth: 150, background: '#000', border: '1px solid rgba(229,225,219,0.18)', transformOrigin: 'top right', transform: menuOpen ? 'scale(1)' : 'scale(0.7)', opacity: menuOpen ? 1 : 0, pointerEvents: menuOpen ? 'auto' : 'none', transition: `transform ${menuOpen ? 0.3 : 0.2}s ${SNAP}, opacity ${menuOpen ? 0.3 : 0.2}s ${SNAP}` }}>
                  {menuItemsContent}
                </div>
              </div>
            )}
            <button onClick={onDone} aria-label="Done" className="tappable" style={{ minWidth: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px' }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: RED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>DONE</span>
            </button>
          </div>
        </div>
      )}

      {/* (Portrait "+" viewing menu now lives INLINE in the top bar, left of DONE —
          see the topbar above. The old absolute top:56 element collided with DONE.) */}

      {/* ── MAIN ROW — the PERSISTENT stage (decoded source + Pipeline) mounts ONCE
            here and survives the portrait↔Theatre toggle (stable key="main"). The
            Theatre mode rail sits to its right; portrait has no rail (dock below). ── */}
      <div key="main" style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        <div
          ref={stageRef}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerLeave={onStagePointerUp}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', cursor: zoom.active ? 'grab' : 'default', touchAction: zoom.active ? 'none' : 'auto' }}
        >
          {stageInner}
          {/* Adjusting: small ‹ back over the image (top-left) — mirror of tapping
              the image; returns to browsing. Minimal, red, no box. */}
          {adjusting && (
            <button onClick={commitTool} aria-label="Back to tools" style={{ position: 'absolute', top: 8, left: 8, zIndex: 6, background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, lineHeight: 0 }}>
              <svg width="21.5" height="21.5" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          {/* Theatre AR label — viewing-at-size cue (portrait shows it via the dock context) */}
          {theatre && (
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{arChip.ratioLabel}{showingOriginal ? ' · BEFORE' : ''}</span>
            </div>
          )}
        </div>
        {theatre && (
          <div style={{ flexShrink: 0, width: railW }}>
            <Tier1Modes active={activeMode} onSelect={changeMode} orientation="vertical" compact={compactRail} pingKey={tabPing} />
          </div>
        )}
      </div>

      {/* ── VIDEO scrubber — beneath the viewer (portrait + Theatre); video only.
            Paused-by-default hero-frame grading; scrubbing redraws the graded frame. ── */}
      {isVideoSource && source && (
        <VideoScrubber video={source as HTMLVideoElement} onHeroFrame={handleHeroFrame} compact={compactRail} />
      )}

      {/* ── Zoom level slider — only while Zoom is active ── */}
      {zoom.active && (
        <div key="zoom" style={{ flexShrink: 0, padding: theatre ? '8px 18px' : '10px 18px', borderTop: '1px solid rgba(229,225,219,0.08)', background: '#000', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: RED, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>ZOOM {zoom.level.toFixed(1)}×</span>
          <input
            type="range" min={1} max={8} step={0.1} value={zoom.level}
            onChange={(e) => setZoom((z) => ({ ...z, level: parseFloat(e.target.value) }))}
            style={{ flex: 1, accentColor: RED }}
          />
          <button onClick={() => setZoom({ active: false, level: 2, panX: 0.5, panY: 0.5 })} style={{ background: 'transparent', border: '1px solid rgba(229,225,219,0.2)', cursor: 'pointer', padding: '4px 8px' }}>
            <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>EXIT</span>
          </button>
        </div>
      )}

      {/* ── BOTTOM — Theatre contextual band (lean tool row) OR portrait stacked dock ── */}
      {theatre ? (
        <div key="bottom" style={{ flexShrink: 0, position: 'relative', borderTop: '1px solid rgba(229,225,219,0.08)', background: '#000', maxHeight: '46vh', overflowY: 'auto' }}>
          {/* BROWSING chrome — Tier-2 subcats + Tier-3 tool row. Collapses to 0 in
              the adjusting state (grid-rows fr→0fr animates to the exact height) so
              the image expands into the reclaimed space. */}
          <div style={{ display: 'grid', gridTemplateRows: adjusting ? '0fr' : '1fr', opacity: adjusting ? 0 : 1, transition: `grid-template-rows 0.42s ${SNAP}, opacity 0.28s ${SNAP}` }}>
            <div style={{ overflow: 'hidden', minHeight: 0 }}>
              {/* Tier-2 subcats: inline on desktop/tablet; via the lower-left "+" on mobile-landscape */}
              {showSubcats && !compactRail && (
                <Tier2Subcats subcats={modeDef(activeMode).subcats} active={activeSubcat} onSelect={setActiveSubcat} />
              )}
              {renderBandBody(true)}
            </div>
          </div>
          {/* ADJUSTING bar — thin control below the image. Expands in via the same
              grid-rows animation; only mounts its control while adjusting. */}
          {(activeMode === 'edit' || activeMode === 'fx') && (
            <div style={{ display: 'grid', gridTemplateRows: adjusting ? '1fr' : '0fr', opacity: adjusting ? 1 : 0, transition: `grid-template-rows 0.42s ${SNAP}, opacity 0.28s ${SNAP}` }}>
              <div style={{ overflow: 'hidden', minHeight: 0 }}>
                {adjustingBar}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div key="bottom" style={{ flexShrink: 0, borderTop: '1px solid rgba(229,225,219,0.08)', background: '#000' }}>
          {/* TIER 2 — subcategories. Hidden for HISTORY and LOOKS (those render their own sections). */}
          {showSubcats && (
            <Tier2Subcats subcats={modeDef(activeMode).subcats} active={activeSubcat} onSelect={setActiveSubcat} />
          )}
          {/* TIER 3 — HISTORY ripple · LOOKS library · PALETTE · or the EDIT item rail */}
          {renderBandBody(false)}
          {/* TIER 1 — modes (bottom, heaviest) */}
          <Tier1Modes active={activeMode} onSelect={changeMode} pingKey={tabPing} />
        </div>
      )}

      {/* ── Portrait tool sheet — fixed slide-up (Theatre docks its control in the band) ── */}
      {!theatre && (
        <div
          key="sheet"
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10,
            background: '#0a0a0a', borderTop: `1px solid rgba(229,225,219,0.1)`,
            transform: activeTool ? 'translateY(0)' : 'translateY(110%)',
            transition: `transform 0.42s ${SNAP}`,
            padding: '16px 18px calc(28px + var(--safe-bottom))', /* X3 §3 — bottom sheet: clear the home indicator */
          }}
        >
          {/* header: X cancel / ✓ commit */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <button onClick={cancelTool} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
              <svg width="17.5" height="17.5" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#E5E1DB" strokeWidth="1.4" strokeLinecap="round" /></svg>
            </button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{activeTool?.label ?? ''}</span>
              {activeTool?.pro && <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: RED, textTransform: 'uppercase', letterSpacing: '0.12em', border: `1px solid ${RED}`, padding: '1px 4px' }}>PRO</span>}
            </span>
            <button onClick={commitTool} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
              <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5L13 4.5" stroke={RED} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          {toolControlBody}
        </div>
      )}

      {/* ── Theatre mobile-landscape: lower-left "+" → ripple-reveal subcats UPWARD (edit/fx) ── */}
      {theatre && compactRail && !adjusting && (activeMode === 'edit' || activeMode === 'fx') && (
        <div key="ml-subcat" style={{ position: 'fixed', left: 10, bottom: 10, zIndex: 31, display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-start', gap: 6, pointerEvents: 'none' }}>
          <button onClick={() => setSubcatMenuOpen((o) => !o)} aria-label="Filter" style={{ width: 26, height: 26, background: '#000', cursor: 'pointer', lineHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', border: `1px solid ${subcatMenuOpen ? RED : 'rgba(229,225,219,0.25)'}`, color: subcatMenuOpen ? RED : '#E5E1DB', transition: `border-color 0.3s ${SNAP}, color 0.3s ${SNAP}` }}>
            <svg width="15.5" height="15.5" viewBox="0 0 12 12" fill="none" style={{ transform: subcatMenuOpen ? 'rotate(45deg)' : 'rotate(0deg)', transition: `transform 0.3s ${SNAP}` }}><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: '#000', border: subcatMenuOpen ? '1px solid rgba(229,225,219,0.18)' : '1px solid transparent', transformOrigin: 'bottom left', transform: subcatMenuOpen ? 'scale(1)' : 'scale(0.7)', opacity: subcatMenuOpen ? 1 : 0, pointerEvents: subcatMenuOpen ? 'auto' : 'none', transition: `transform ${subcatMenuOpen ? 0.3 : 0.2}s ${SNAP}, opacity ${subcatMenuOpen ? 0.3 : 0.2}s ${SNAP}` }}>
            {modeDef(activeMode).subcats.map((s) => (
              <button key={s.key} onClick={() => { setActiveSubcat(s.key); setSubcatMenuOpen(false); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 14px', textAlign: 'left' }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: s.key === activeSubcat ? RED : '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {theatre && subcatMenuOpen && <div key="ml-backdrop" onClick={() => setSubcatMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />}

      {/* ── CROP — full-screen overlay (the shared CropTool, matching creation) ── */}
      {cropOverlay}

      {/* ── "Added to Palette" confirmation (success only; non-blocking overlay) ── */}
      {saveAnim && (
        <LookSavedOverlay
          key={saveAnim.id}
          source={saveAnim.source}
          target={saveAnim.target}
          onArrive={() => { setTabPing('palette'); setTimeout(() => setTabPing(null), 450); }}
          onDone={() => setSaveAnim((cur) => (cur && cur.id === saveAnim.id ? null : cur))}
        />
      )}
    </div>
  );
}

export { DEFAULT_PARAMS };
