"use client";

/**
 * /finishing-dev — DEV HARNESS for the finishing suite. NOT linked in nav.
 *
 * Loads the synthetic test image, mounts <FinishingShell>, and wires exposure +
 * the in-suite CROP entry end-to-end. This is the bench for building every
 * future tool. It touches NO real data — a mock post context stands in for
 * profiles.grid_layout / posts.layout_id / posts.edit_geometry.
 *
 * ── THE RULE under test ───────────────────────────────────────────────────
 * In-suite crop writes edit_geometry ONLY and must NEVER mutate layout_id.
 *
 * ── DEV-ONLY scaffolding ──────────────────────────────────────────────────
 * The floating strip below is NOT product UI. In production, grid gating reads
 * automatically from profiles.grid_layout (no toggle) and the geometry is the
 * post's saved edit_geometry. The strip is gated to dev builds and lives ONLY
 * on this harness route — the FINISHING shell contains no such control. It
 * exists purely to flip the two test paths:
 *   • GRID standard ↔ collage  → AR locked vs all-four-chips
 *   • SEED none ↔ saved        → fresh max-crop open vs restore-prior-crop
 */

import { useEffect, useState } from 'react';
import FinishingShell from '@/components/finishing/FinishingShell';
import { DEFAULT_PARAMS, type EditParams } from '@/lib/editor/params';
import { neutralGeometry, type EditGeometry } from '@/lib/editGeometry';
import type { SavedLook } from '@/lib/looksService';

const TEST_IMAGE = '/finishing-test.png';
const TEST_IMAGE_AR = 1280 / 720; // the synthetic test asset is 16:9

// Mock post canonical AR — immutable, set "once at creation", read everywhere.
// In-suite crop must never change this.
const MOCK_LAYOUT_ID = 'scope'; // SCOPE 2.39

// Dev-only: the grid/seed strip never renders in production.
const DEV_HARNESS = process.env.NODE_ENV !== 'production';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#E5E1DB';

// Maximal AR-locked crop (mirrors CropTool.computeMaxCrop) for the test AR.
function maxArCrop(orientedAr: number, ratio: number) {
  let w = 1, h = orientedAr / ratio;
  if (h > 1) { h = 1; w = ratio / orientedAr; }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

// "Has prior geometry" mock — a real saved crop (maximal scope crop zoomed to
// 0.7 and panned) to verify CROP RESTORES it exactly instead of resetting.
function savedMockGeometry(): EditGeometry {
  const m = maxArCrop(TEST_IMAGE_AR, 2.39); // scope
  const z = 0.7;
  return {
    ar: MOCK_LAYOUT_ID,
    crop: { x: 0.06, y: 0.12, w: m.w * z, h: m.h * z },
    straighten: 0,
    rotate: 0,
    skew: { x: 0, y: 0 },
  };
}

type SeedMode = 'none' | 'saved';

export default function FinishingDevPage() {
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [params, setParams] = useState<EditParams>(DEFAULT_PARAMS);

  // ── Mock post context (dev only) ──
  const [mockGridLayout, setMockGridLayout] = useState<'standard' | 'collage'>('standard');
  // Default = NO prior crop, so the fresh-open path (max crop fills frame) is
  // what you see first. The SEED toggle swaps in a real saved crop to test restore.
  const [seedMode, setSeedMode] = useState<SeedMode>('none');
  const [mockGeometry, setMockGeometry] = useState<EditGeometry>(() => neutralGeometry(MOCK_LAYOUT_ID));
  // Dev override for Pro status. In production the mount computes this via the
  // EXISTING membership check (getUserByPrivyId → getProfile → paid_member_until)
  // and passes it in; the harness toggles it so both gating paths are testable.
  const [mockIsPro, setMockIsPro] = useState(false);
  // Mock looks persistence (dev only) — the real path uses looksService + uuid.
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([]);

  const applySeed = (mode: SeedMode) => {
    setSeedMode(mode);
    setMockGeometry(mode === 'none' ? neutralGeometry(MOCK_LAYOUT_ID) : savedMockGeometry());
  };

  // Decode the test image off-DOM; it is used only as a WebGL texture source —
  // never rendered as a plain <img>. We await decode() so the element is fully
  // ready before it reaches the pipeline (gl-react gets a canvas drawn from it),
  // with an onload fallback for browsers where decode() rejects.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = TEST_IMAGE;
    img.decode()
      .then(() => { if (!cancelled) setSource(img); })
      .catch(() => { img.onload = () => { if (!cancelled) setSource(img); }; });
    return () => { cancelled = true; };
  }, []);

  // Commit handler — writes edit_geometry ONLY, and proves layout_id is untouched.
  const handleGeometryChange = (g: EditGeometry) => {
    console.assert(
      MOCK_LAYOUT_ID === 'scope',
      '[finishing-dev] THE RULE VIOLATED: layout_id changed during in-suite crop',
    );
    console.log(
      '[finishing-dev] edit_geometry committed →', g,
      '| layout_id (immutable, unchanged):', MOCK_LAYOUT_ID,
      '| grid_layout:', mockGridLayout,
    );
    setMockGeometry(g);
  };

  return (
    <>
      <FinishingShell
        source={source}
        params={params}
        onParamsChange={setParams}
        onDone={() => { /* dev bench — Done is a no-op here */ }}
        geometry={mockGeometry}
        onGeometryChange={handleGeometryChange}
        gridLayout={mockGridLayout}
        layoutId={MOCK_LAYOUT_ID}
        mediaUrl={TEST_IMAGE}
        mediaType="image"
        isPro={mockIsPro}
        savedLooks={savedLooks}
        onSaveLook={(name, p) => {
          // Dev mock — in-memory only (real path persists via looksService).
          setSavedLooks((ls) => [{ id: `${Date.now()}`, name, params: p }, ...ls]);
          console.log('[finishing-dev] saved look (mock):', name);
          return true; // mock "insert" succeeds → plays the confirmation animation
        }}
      />

      {/* ── DEV-ONLY scaffolding strip (never ships; gated to dev builds, lives
            only on this harness route, not in the FINISHING shell). Plain
            unstyled-on-purpose so it never reads as product UI. zIndex below the
            crop overlay (200) so it hides while cropping. ── */}
      {DEV_HARNESS && (
        <div style={{
          position: 'fixed', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 150,
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px',
          background: '#111', border: '1px dashed #555',
        }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: '#ff0', textTransform: 'uppercase', letterSpacing: '0.12em' }}>⚠ DEV</span>
          <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>GRID</span>
          {(['standard', 'collage'] as const).map((g) => {
            const active = mockGridLayout === g;
            return (
              <button key={g} onClick={() => setMockGridLayout(g)}
                style={{ background: active ? RED : 'transparent', border: '1px solid #555', cursor: 'pointer', padding: '3px 7px' }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: active ? '#000' : '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g}</span>
              </button>
            );
          })}
          <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>SEED</span>
          {(['none', 'saved'] as const).map((m) => {
            const active = seedMode === m;
            return (
              <button key={m} onClick={() => applySeed(m)}
                style={{ background: active ? RED : 'transparent', border: '1px solid #555', cursor: 'pointer', padding: '3px 7px' }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: active ? '#000' : '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m}</span>
              </button>
            );
          })}
          <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>TIER</span>
          {([['free', false], ['pro', true]] as const).map(([lbl, val]) => {
            const active = mockIsPro === val;
            return (
              <button key={lbl} onClick={() => setMockIsPro(val)}
                style={{ background: active ? RED : 'transparent', border: '1px solid #555', cursor: 'pointer', padding: '3px 7px' }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: active ? '#000' : '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lbl}</span>
              </button>
            );
          })}
          <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            layout_id {MOCK_LAYOUT_ID} 🔒 · ar {mockGeometry.ar}
          </span>
        </div>
      )}
    </>
  );
}
