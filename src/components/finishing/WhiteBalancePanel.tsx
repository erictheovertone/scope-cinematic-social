"use client";

/**
 * WhiteBalancePanel — the White Balance tool body (CORRECTION).
 *
 * Two sub-sliders in one panel: TEMPERATURE (blue↔amber) and TINT
 * (green↔magenta), both bidirectional with a centre detent. Each rides a thin
 * 1px gradient hairline track — the ONE approved exception to the strict
 * red-fill slider, scoped to these two tracks only (see ToolSlider.trackGradient).
 * Full-strength endpoint colours, white circular thumb — filmic, not candy.
 */

import ToolSlider from './ToolSlider';

// Full-strength endpoints (not pastel), drawn as a thin hairline by ToolSlider.
const TEMP_TRACK = 'linear-gradient(90deg, #1E6BFF 0%, #E5E1DB 50%, #FFB000 100%)';
const TINT_TRACK = 'linear-gradient(90deg, #00C853 0%, #E5E1DB 50%, #FF1FB0 100%)';

interface WhiteBalancePanelProps {
  /** temperature stop (params.whiteBalance.t) */
  temp: number;
  /** tint stop (params.whiteBalance.tint) */
  tint: number;
  onChange: (wb: { t: number; tint: number }) => void;
}

export default function WhiteBalancePanel({ temp, tint, onChange }: WhiteBalancePanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ToolSlider
        type="bi"
        value={temp}
        onChange={(s) => onChange({ t: s, tint })}
        label="TEMPERATURE"
        trackGradient={TEMP_TRACK}
      />
      <ToolSlider
        type="bi"
        value={tint}
        onChange={(s) => onChange({ t: temp, tint: s })}
        label="TINT"
        trackGradient={TINT_TRACK}
      />
    </div>
  );
}
