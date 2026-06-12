// ── Economy preview dev flag ─────────────────────────────────────────────────
//
// Mainnet is live. NOTHING in Part 2 (mock-data economy surfaces) may render
// unless this flag is explicitly on, so the UI never implies real earnings that
// don't exist yet. Part 1 surfaces (badge sizing, blurbs, EARN copy) are REAL
// today and are NOT gated by this.
//
// Set NEXT_PUBLIC_ECONOMY_PREVIEW=1 (or "true") in the environment to enable.

export const ECONOMY_PREVIEW: boolean =
  process.env.NEXT_PUBLIC_ECONOMY_PREVIEW === '1' ||
  process.env.NEXT_PUBLIC_ECONOMY_PREVIEW === 'true';

/** Guard for Part 2 surfaces. Returns true only when the dev flag is set. */
export function economyPreviewEnabled(): boolean {
  return ECONOMY_PREVIEW;
}
