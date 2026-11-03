// ── videoGfx — the VID-2 `gfx:` crumb store ─────────────────────────────────────────────────────
// Each active HLS player reports how it is rendering: 'graded' (the finishing shaders drive a WebGL
// canvas) or 'fallback' (today's CSS approximation on the plain <video>), plus its live fps. The
// ?debug=video overlay reads gfxSummary() so Eric's device trace shows, at a glance, graded|fallback
// per player + fps — the Brief VID-2 §3 crumb. Byte-inert until a player registers (GradedVideo wires
// this in §1); until then the overlay shows "gfx: none". Module-level, like vdbgLiveCounts.
export type GfxMode = 'graded' | 'fallback';

const players = new Map<string, { mode: GfxMode; fps: number }>();

/** A player (by stable id) reports its current render mode + fps. Call on mount and on fps ticks. */
export function setGfx(id: string, mode: GfxMode, fps: number): void {
  players.set(id, { mode, fps: Math.round(fps) });
}

/** A player unmounts / releases — drop it from the summary. */
export function clearGfx(id: string): void {
  players.delete(id);
}

/** One-line summary for the ?debug=video overlay: counts per mode + fps range. */
export function gfxSummary(): string {
  if (players.size === 0) return 'none';
  const graded: number[] = [];
  const fallback: number[] = [];
  for (const { mode, fps } of players.values()) (mode === 'graded' ? graded : fallback).push(fps);
  const part = (label: string, a: number[]) =>
    a.length ? `${a.length} ${label} (${Math.min(...a)}–${Math.max(...a)}fps)` : '';
  return [part('graded', graded), part('fallback', fallback)].filter(Boolean).join(' · ') || 'none';
}
