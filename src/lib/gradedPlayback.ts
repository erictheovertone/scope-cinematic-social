// ── gradedPlayback — the VID-2 flag (NEXT_PUBLIC_GRADED_PLAYBACK) ────────────────────────────────
// Option A (finishing shaders at playback) ships behind this flag: OFF everywhere until it's set in
// Preview, then Production after Eric's on-device FPS pass. OFF → every HLS player keeps today's CSS
// approximation (the fallback path), byte-for-byte. The gate is intentionally static (flag + "the
// post actually has a look"): the RUNTIME viability (GL context creation, context-loss, a black first
// frame) is decided inside GradedVideo, which falls back to CSS and writes a `fallback` gfx crumb —
// never a black player (Brief VID-2 §3).
//
// Read per call (never cached): a NEXT_PUBLIC_ var is inlined at build, so this is a literal compare.

/** True when graded WebGL playback is enabled for this deploy (NEXT_PUBLIC_GRADED_PLAYBACK=1|true). */
export function gradedPlaybackEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_GRADED_PLAYBACK;
  return v === '1' || v === 'true';
}

/** Static gate: should this player ATTEMPT graded WebGL playback? (flag ON, it's an HLS source, and
 *  the post carries a real look to apply). Runtime GL success/fallback is decided by GradedVideo. */
export function shouldAttemptGraded(isHls: boolean, hasLook: boolean): boolean {
  return gradedPlaybackEnabled() && isHls && hasLook;
}
