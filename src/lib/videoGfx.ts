// ── videoGfx — the VID-2 `gfx:` crumb store ─────────────────────────────────────────────────────
// Each active HLS player reports how it renders: 'graded' (finishing shaders → WebGL canvas) or
// 'fallback' (CSS approximation on the plain <video>) with a reason. The ?debug=video overlay reads
// gfxCrumb(allowEnabled) for ONE phone-readable line (VID-2c §4):
//   gfx: graded | off (allowlist) | off (no-webgl) | off (fallback: <reason>) | off
// Byte-inert until a player registers (GradedVideo wires this). Module-level, like vdbgLiveCounts.
export type GfxMode = 'graded' | 'fallback';

const players = new Map<string, { mode: GfxMode; fps: number; reason?: string }>();

/** A player (by stable id) reports its render mode + fps, and a reason when it fell back. */
export function setGfx(id: string, mode: GfxMode, fps: number, reason?: string): void {
  players.set(id, { mode, fps: Math.round(fps), reason });
}

/** A player unmounts / releases — drop it from the summary. */
export function clearGfx(id: string): void {
  players.delete(id);
}

/** The single overlay crumb. `allowEnabled` = this viewer's resolved allowlist boolean. A live graded
 *  player wins; otherwise allowlist-off is the headline; otherwise the first fallback reason. */
export function gfxCrumb(allowEnabled: boolean): string {
  const vals = [...players.values()];
  if (vals.some((v) => v.mode === 'graded')) return 'graded';
  if (!allowEnabled) return 'off (allowlist)';
  const fb = vals.find((v) => v.mode === 'fallback' && v.reason);
  if (fb?.reason === 'no-webgl') return 'off (no-webgl)';
  if (fb?.reason) return `off (fallback: ${fb.reason})`;
  return 'off';
}
