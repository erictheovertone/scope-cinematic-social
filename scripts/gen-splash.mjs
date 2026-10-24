// Brief M21 — PWA launch artwork. Renders, from the aperture logomark (public/logomark-plain-white.png):
//   • public/splash/iphone-{W}x{H}@{R}.png — one iOS startup image per current iPhone portrait
//     viewport × DPR: #050505 ground, the mark in ivory (#E5E1DB) CENTERED, 96px wide at 1×.
//     The in-app LaunchCue draws the mark at exactly this spot, so splash → cue is seamless.
//   • public/splash/maskable-{192,512}.png — Android maskable icons (mark inside the 80% safe zone).
//   • public/splash/mark-mask.png — the mark at 192px wide: the LaunchCue's CSS mask (the 1920px
//     master is 100KB; the cue must paint on the very first frame).
// The set is committed (reusable as the native @capacitor/splash-screen artwork). Re-run after a
// logomark change:  npm run splash:gen    — the <link> tags live in src/lib/splash.ts.
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { SPLASH_SCREENS, SPLASH_MARK_W, SPLASH_GROUND, SPLASH_INK } from '../src/lib/splash.ts';

const MARK = 'public/logomark-plain-white.png';
const OUT = 'public/splash';
mkdirSync(OUT, { recursive: true });

const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/** The mark at `w` px wide, filled ivory (its alpha = the shape). */
async function inkMark(w) {
  const mask = await sharp(MARK).resize({ width: w }).ensureAlpha().toBuffer();
  const { height } = await sharp(mask).metadata();
  return sharp({ create: { width: w, height, channels: 4, background: { ...hex(SPLASH_INK), alpha: 1 } } })
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function onGround(w, h, markW) {
  const mark = await inkMark(markW);
  const { height: mh } = await sharp(mark).metadata();
  return sharp({ create: { width: w, height: h, channels: 3, background: hex(SPLASH_GROUND) } })
    .composite([{ input: mark, left: Math.round((w - markW) / 2), top: Math.round((h - mh) / 2) }])
    .png({ compressionLevel: 9 });
}

for (const s of SPLASH_SCREENS) {
  const file = `${OUT}/${s.file}`;
  await (await onGround(s.w * s.r, s.h * s.r, SPLASH_MARK_W * s.r)).toFile(file);
  console.log('✓', file, `${s.w * s.r}×${s.h * s.r}`);
}
for (const size of [192, 512]) {
  await (await onGround(size, size, Math.round(size * 0.56))).toFile(`${OUT}/maskable-${size}.png`);
  console.log('✓', `${OUT}/maskable-${size}.png`);
}
await sharp(MARK).resize({ width: 192 }).png({ compressionLevel: 9 }).toFile(`${OUT}/mark-mask.png`);
console.log('✓', `${OUT}/mark-mask.png`);
