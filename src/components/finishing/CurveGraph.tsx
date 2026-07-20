"use client";

/**
 * CurveGraph — the draggable 2D curve editor (Brief 6, generalised in Brief 7).
 *
 * Generic over the CurveEngine + a ChannelConfig: it edits normalised control
 * points and emits them; it does NOT know the channel's meaning (the shader
 * decides how to apply the baked LUT). LUMA/R/G/B reuse it as a diagonal curve;
 * HUE reuses it as a flat (0.5-neutral), wrapping curve — same code.
 *
 * Interaction (approved):
 *   • drag a point (interior X+Y; endpoints Y only, X pinned to the sides)
 *   • tap empty/line → add a control point; drag a point off top/bottom or onto
 *     a neighbour → delete; double-tap → reset to this channel's neutral curve
 *   • wrap channels (hue) link the two endpoints' Y so there's no seam at 0/360
 */

import { useRef } from 'react';
import { buildCurveLUT, identityCurve, type CurvePoint, type ChannelConfig } from '@/lib/editor/curveEngine';

const RED = '#E5E1DB';
const GW = 300, GH = 220, P = 12;
const plotW = GW - 2 * P, plotH = GH - 2 * P;
const HIT = 20;
const SAMPLES = 80;

const toPx = (x: number) => P + x * plotW;
const toPy = (y: number) => (GH - P) - y * plotH;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface DragState {
  points: CurvePoint[];
  index: number;
  isEndpoint: boolean;
  moved: boolean;
  pendingDelete: boolean;
}

interface CurveGraphProps {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  config: ChannelConfig;
}

export default function CurveGraph({ points, onChange, config }: CurveGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<DragState | null>(null);
  const down = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const lastTap = useRef(0);

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const wrap = config.wrap;

  const toData = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * GW;
    const vy = ((clientY - r.top) / r.height) * GH;
    return { vx, vy, x: (vx - P) / plotW, y: ((GH - P) - vy) / plotH };
  };

  const nearestIndex = (vx: number, vy: number, pts: CurvePoint[]) => {
    let bi = -1, bd = HIT * HIT;
    pts.forEach((p, i) => {
      const dx = toPx(p.x) - vx, dy = toPy(p.y) - vy;
      const d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; bi = i; }
    });
    return bi;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const { vx, vy, x, y } = toData(e.clientX, e.clientY);
    down.current = { x, y, vx, vy };
    const idx = nearestIndex(vx, vy, sorted);
    if (idx >= 0) {
      drag.current = {
        points: sorted.map((p) => ({ ...p })),
        index: idx,
        isEndpoint: idx === 0 || idx === sorted.length - 1,
        moved: false,
        pendingDelete: false,
      };
    } else {
      drag.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!down.current) return;
    const { vx, vy, x, y } = toData(e.clientX, e.clientY);

    if (!drag.current) {
      const dist = Math.hypot(vx - down.current.vx, vy - down.current.vy);
      if (dist <= 4) return;
      const nx = Math.min(0.999, Math.max(0.001, clamp01(down.current.x)));
      const ny = clamp01(down.current.y);
      const next = [...sorted.map((p) => ({ ...p })), { x: nx, y: ny }].sort((a, b) => a.x - b.x);
      const ni = next.findIndex((p) => p.x === nx && p.y === ny);
      drag.current = { points: next, index: ni, isEndpoint: false, moved: true, pendingDelete: false };
      onChange(next);
      return;
    }

    const d = drag.current;
    d.moved = true;
    const arr = d.points;
    if (d.isEndpoint) {
      const ny = clamp01(y);
      arr[d.index] = { x: arr[d.index].x, y: ny };       // X pinned, Y only
      if (wrap) {                                         // link endpoints (no seam)
        arr[0] = { x: arr[0].x, y: ny };
        arr[arr.length - 1] = { x: arr[arr.length - 1].x, y: ny };
      }
      d.pendingDelete = false;
    } else {
      const left = arr[d.index - 1].x;
      const right = arr[d.index + 1].x;
      arr[d.index] = { x: Math.min(right - 0.001, Math.max(left + 0.001, x)), y: clamp01(y) };
      d.pendingDelete = y < -0.1 || y > 1.1 || x <= left || x >= right;
    }
    onChange(arr.map((p) => ({ ...p })));
  };

  const onPointerUp = () => {
    const d = drag.current;
    const dn = down.current;
    drag.current = null;
    down.current = null;

    if (d) {
      if (d.pendingDelete && !d.isEndpoint && d.points.length > 2) {
        onChange(d.points.filter((_, i) => i !== d.index));
      }
      return;
    }

    if (dn) {
      const now = Date.now();
      if (now - lastTap.current < 280) {
        lastTap.current = 0;
        onChange(identityCurve(config.key));
        return;
      }
      lastTap.current = now;
      const nx = Math.min(0.999, Math.max(0.001, clamp01(dn.x)));
      onChange([...sorted, { x: nx, y: clamp01(dn.y) }].sort((a, b) => a.x - b.x));
    }
  };

  // Curve polyline from the baked spline (matches what the shader applies).
  const lut = buildCurveLUT(sorted, SAMPLES);
  let path = '';
  for (let i = 0; i < SAMPLES; i++) {
    const x = i / (SAMPLES - 1);
    path += `${i === 0 ? 'M' : 'L'}${toPx(x).toFixed(1)} ${toPy(lut[i]).toFixed(1)} `;
  }

  // Neutral reference: diagonal (out=in) or flat centre line (0.5 adjustment).
  const ref = config.neutral === 'flat'
    ? { x1: toPx(0), y1: toPy(0.5), x2: toPx(1), y2: toPy(0.5) }
    : { x1: toPx(0), y1: toPy(0), x2: toPx(1), y2: toPy(1) };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${GW} ${GH}`}
      width="100%"
      style={{ display: 'block', touchAction: 'none', userSelect: 'none', aspectRatio: `${GW} / ${GH}`, background: '#000' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <rect x={P} y={P} width={plotW} height={plotH} fill="none" stroke="rgba(229,225,219,0.18)" strokeWidth={1} />
      {[1 / 3, 2 / 3].map((f) => (
        <g key={f}>
          <line x1={toPx(f)} y1={P} x2={toPx(f)} y2={GH - P} stroke="rgba(229,225,219,0.10)" strokeWidth={1} />
          <line x1={P} y1={toPy(f)} x2={GW - P} y2={toPy(f)} stroke="rgba(229,225,219,0.10)" strokeWidth={1} />
        </g>
      ))}
      <line x1={ref.x1} y1={ref.y1} x2={ref.x2} y2={ref.y2} stroke="rgba(229,225,219,0.25)" strokeWidth={1} strokeDasharray="3 3" />
      <path d={path} fill="none" stroke={config.line} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {sorted.map((p, i) => (
        <circle key={i} cx={toPx(p.x)} cy={toPy(p.y)} r={5} fill="#000" stroke={RED} strokeWidth={2} />
      ))}
    </svg>
  );
}
