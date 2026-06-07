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

import { useEffect, useMemo, useRef, useState } from 'react';
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
import HistoryRipple, { type HistoryStep } from './nav/HistoryRipple';
import { modeDef, firstSubcat, editItemsFor, type Mode, type EditTool } from './nav/navModel';
import { AR_CHIPS, chipForLayout } from '@/lib/aspectRatio';
import { rotateCoverScale, type EditGeometry } from '@/lib/editGeometry';
import { useUpsell } from '@/components/UpsellProvider';

const Pipeline = dynamic(() => import('./Pipeline'), { ssr: false });

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';
const SNAP = 'cubic-bezier(0.16,0.84,0.3,1)'; // Scope snappy ease

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
}

export default function FinishingShell({
  source, params, onParamsChange, onDone, onBack,
  geometry, onGeometryChange, gridLayout, layoutId, mediaUrl, mediaType, isPro,
}: FinishingShellProps) {
  const { showUpsell } = useUpsell();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
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

  const cropAdjusted = geomChanged(geometry, baselineGeometry.current);
  const openCrop = () => { if (source) setCropOpen(true); };

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
  const onOpenTool = (t: EditTool) => {
    if (!toolEnabled(t)) return;
    if (toolLocked(t)) { showUpsell('edit'); return; } // free user → upsell, tool stays closed
    if (t.key === 'crop') { openCrop(); return; }
    snapshot.current = params; // full snapshot for cancel/revert (slider or WB)
    setActiveTool(t);
  };
  const cancelTool = () => {
    onParamsChange(snapshot.current);
    setActiveTool(null);
  };
  const commitTool = () => setActiveTool(null);

  const editItems = activeMode === 'edit' ? editItemsFor(activeSubcat) : [];

  // HISTORY ripple — stubbed sample list driven by current edit state.
  // ORIGINAL (top) → edits → CURRENT (bottom); reading upward = back in time.
  const historySteps = useMemo<HistoryStep[]>(() => {
    const steps: HistoryStep[] = [{ label: 'ORIGINAL' }];
    if (cropAdjusted) steps.push({ label: '+ CROP' });
    if (params.exposure !== 0) {
      const v = params.exposure;
      steps.push({ label: `+ EXPOSURE ${v > 0 ? '+' : ''}${v.toFixed(1)}` });
    }
    steps.push({ label: 'CURRENT', current: true });
    return steps;
  }, [cropAdjusted, params.exposure]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ── */}
      <div style={{ flexShrink: 0, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <button onClick={onBack} aria-label="Back" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          <span style={{ ...SKB, fontSize: 12, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em' }}>FINISHING</span>
        </div>
        <button onClick={onDone} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
          <span style={{ ...SKB, fontSize: 12, color: RED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>DONE</span>
        </button>
      </div>

      {/* ── Live stage (framed by edit_geometry) ── */}
      <div ref={stageRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        {source && geomPreview ? (
          <div style={{ position: 'relative', width: geomPreview.fw, height: geomPreview.fh, overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', left: geomPreview.left, top: geomPreview.top,
              width: geomPreview.sw, height: geomPreview.sh,
              transform: geomPreview.spin !== 0 || geomPreview.cover !== 1
                ? `rotate(${geomPreview.spin}deg) scale(${geomPreview.cover})` : undefined,
              transformOrigin: `${geomPreview.originX}% ${geomPreview.originY}%`,
            }}>
              <Pipeline source={source} params={params} width={geomPreview.sw} height={geomPreview.sh} />
            </div>
          </div>
        ) : (
          <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>LOADING…</span>
        )}
      </div>

      {/* ── Dock: three stacked tiers — subcats (top) · items (middle) · modes (bottom) ── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)', background: '#000' }}>
        {/* TIER 2 — subcategories (hidden for HISTORY) */}
        {activeMode !== 'history' && (
          <Tier2Subcats
            subcats={modeDef(activeMode).subcats}
            active={activeSubcat}
            onSelect={setActiveSubcat}
          />
        )}

        {/* TIER 3 — items (EDIT/LOOKS/PALETTE/FX rail) or the HISTORY ripple */}
        {activeMode === 'history' ? (
          <HistoryRipple steps={historySteps} />
        ) : (
          <Tier3Items
            mode={activeMode}
            editItems={editItems}
            toolTouched={toolTouched}
            toolEnabled={toolEnabled}
            toolLocked={toolLocked}
            onOpenTool={onOpenTool}
          />
        )}

        {/* TIER 1 — modes (bottom, heaviest) */}
        <Tier1Modes active={activeMode} onSelect={changeMode} />
      </div>

      {/* ── Tool sheet ── */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10,
          background: '#0a0a0a', borderTop: `1px solid rgba(255,255,255,0.1)`,
          transform: activeTool ? 'translateY(0)' : 'translateY(110%)',
          transition: `transform 0.42s ${SNAP}`,
          padding: '16px 18px 28px',
        }}
      >
        {/* header: X cancel / ✓ commit */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button onClick={cancelTool} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="white" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{activeTool?.label ?? ''}</span>
            {activeTool?.pro && <span style={{ ...SKB, fontSize: 7, color: RED, textTransform: 'uppercase', letterSpacing: '0.12em', border: `1px solid ${RED}`, padding: '1px 4px' }}>PRO</span>}
          </span>
          <button onClick={commitTool} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5L13 4.5" stroke={RED} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        {/* body — White Balance (compound) or a single mapped slider */}
        {activeTool?.kind === 'wb' && (
          <WhiteBalancePanel
            temp={params.whiteBalance.t}
            tint={params.whiteBalance.tint}
            onChange={(wb) => onParamsChange({ ...params, whiteBalance: wb })}
          />
        )}
        {activeTool && activeTool.kind === 'slider' && (
          <ToolSlider
            type={activeTool.sliderType ?? 'bi'}
            value={sliderValue(params, activeTool.key)}
            onChange={(stop) => onParamsChange(setSliderValue(params, activeTool.key, stop))}
            label={activeTool.label}
          />
        )}
        {activeTool?.kind === 'grain' && (
          <GrainPicker
            stock={params.grainStock}
            intensity={params.grainIntensity}
            onChange={({ grainStock, grainIntensity }) => onParamsChange({ ...params, grainStock, grainIntensity })}
          />
        )}
        {activeTool?.kind === 'splitTone' && (
          <SplitTonePanel
            value={params.splitTone}
            onChange={(splitTone) => onParamsChange({ ...params, splitTone })}
          />
        )}
        {activeTool?.kind === 'curve' && (
          <CurvesPanel
            curves={params.curves}
            onChange={(curves) => onParamsChange({ ...params, curves })}
            isPro={isPro}
            onUpsell={() => showUpsell('edit')}
          />
        )}
      </div>

      {/* ── CROP — full-screen overlay (the shared CropTool, matching creation) ── */}
      {cropOpen && source && (
        <CropEntry
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          geometry={geometry}
          gridLayout={gridLayout}
          layoutId={layoutId}
          onCommit={(g) => { onGeometryChange(g); setCropOpen(false); }}
          onCancel={() => setCropOpen(false)}
        />
      )}
    </div>
  );
}

export { DEFAULT_PARAMS };
