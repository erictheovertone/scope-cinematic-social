// ── src/lib/splash.ts — the PWA launch screen set (Brief M21) ────────────────
// One source of truth for the iOS startup images: scripts/gen-splash.mjs renders the PNGs
// from it, and the root layout emits the matching apple-touch-startup-image <link>s.
// Portrait only (the manifest locks orientation). Viewports in CSS px, R = device pixel ratio.

export const SPLASH_GROUND = "#050505";
export const SPLASH_INK = "#E5E1DB";
/** The light theme's canvas (== --canvas under [data-theme="light"]) — the pre-stylesheet ground. */
export const CANVAS_LIGHT = "#E5E1DB";
/** The aperture mark's width at 1× — LaunchCue draws it at exactly this size, centered. */
export const SPLASH_MARK_W = 96;
/** The mark's height ÷ width — public/logomark-plain-white.png is 1920×1223. The ONE source
 *  for this ratio: LaunchCue sizes its span by it, and gen-splash renders the cue frame by it,
 *  so the static splash and the live cue cannot drift in aspect. */
export const MARK_ASPECT = 1223 / 1920;

export const SPLASH_SCREENS = [
  { w: 440, h: 956, r: 3 }, // 16/17 Pro Max
  { w: 420, h: 912, r: 3 }, // Air
  { w: 430, h: 932, r: 3 }, // 14/15 Pro Max, 15/16 Plus
  { w: 402, h: 874, r: 3 }, // 16 Pro, 17, 17 Pro
  { w: 393, h: 852, r: 3 }, // 14/15 Pro, 15/16
  { w: 390, h: 844, r: 3 }, // 12/13/14
  { w: 375, h: 812, r: 3 }, // X/XS/11 Pro, 12/13 mini
  { w: 414, h: 896, r: 2 }, // XR/11
  { w: 414, h: 896, r: 3 }, // XS Max/11 Pro Max
  { w: 414, h: 736, r: 3 }, // 6/7/8 Plus
  { w: 375, h: 667, r: 2 }, // 6/7/8, SE 2/3
].map((s) => ({
  ...s,
  file: `iphone-${s.w}x${s.h}@${s.r}.png`,
  media: `(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.r}) and (orientation: portrait)`,
}));
