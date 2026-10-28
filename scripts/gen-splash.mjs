// Brief M21 / U2b — PWA launch artwork. Produces, from the aperture logomark (public/logomark-plain-white.png):
//   • public/splash/iphone-{W}x{H}@{R}.png — one iOS startup image per current iPhone portrait
//     viewport × DPR. Brief U2b §1: these are rendered FROM THE LOADER'S OWN FIRST FRAME — a headless
//     browser paints LaunchCue's resting frame (SPLASH_GROUND ground, the mark in SPLASH_INK, 96px wide
//     at 1× centered, masked by the SAME mark-mask.png the cue uses) and we screenshot it. So the static
//     splash is pixel-identical to what the in-app LaunchCue paints when it takes over — no hand-off jump
//     (the earlier sharp-drawn mark matched in geometry but left a ~1px rasterizer AA fringe at the edge).
//   • public/splash/maskable-{192,512}.png — Android maskable icons (mark inside the 80% safe zone), sharp.
//   • public/splash/mark-mask.png — the mark at 192px wide: the LaunchCue's CSS mask (also this script's
//     mask source), generated FIRST so the browser render can reference it.
// If a browser can't be launched (no Playwright/chromium), the iPhone images fall back to the sharp
// draw — geometry is identical, only the edge AA differs. The set is committed (reusable as the native
// @capacitor/splash-screen artwork). Re-run after a logomark change:  npm run splash:gen
// The <link> tags + the mark geometry (SPLASH_MARK_W, MARK_ASPECT) live in src/lib/splash.ts.
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'fs';
import { SPLASH_SCREENS, SPLASH_MARK_W, MARK_ASPECT, SPLASH_GROUND, SPLASH_INK } from '../src/lib/splash.ts';

const MARK = 'public/logomark-plain-white.png';
const OUT = 'public/splash';
const MASK = `${OUT}/mark-mask.png`;
mkdirSync(OUT, { recursive: true });

const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

// ── mark-mask.png FIRST — the cue's mask (and this script's render source) ────
await sharp(MARK).resize({ width: 192 }).png({ compressionLevel: 9 }).toFile(MASK);
console.log('✓', MASK);

// ── The LaunchCue's resting first frame, as HTML (mirrors src/components/LaunchCue.tsx +
//    the .launch-* rules in globals.css: a 96×(96·MARK_ASPECT) mark, centered, SPLASH_INK
//    behind the mark-mask.png alpha, on a SPLASH_GROUND field). The mask is inlined as a
//    data: URI so there is no load race. Reduced-motion = the resting frame (no sweep/grow). */
const maskDataUri = `data:image/png;base64,${readFileSync(MASK).toString('base64')}`;
const cueHtml = (markW) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:${SPLASH_GROUND};}
  .cue{position:fixed;inset:0;background:${SPLASH_GROUND};}
  .mark{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:${markW}px;height:${markW * MARK_ASPECT}px;}
  .base{position:absolute;inset:0;background:${SPLASH_INK};
    -webkit-mask:url(${maskDataUri}) center / contain no-repeat;
    mask:url(${maskDataUri}) center / contain no-repeat;}
</style></head><body><div class="cue"><span class="mark"><span class="base"></span></span></div></body></html>`;

// ── sharp fallback (geometry-identical; used only if no browser) ──────────────
async function inkMark(w) {
  const mask = await sharp(MARK).resize({ width: w }).ensureAlpha().toBuffer();
  const { height } = await sharp(mask).metadata();
  return sharp({ create: { width: w, height, channels: 4, background: { ...hex(SPLASH_INK), alpha: 1 } } })
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}
async function sharpGround(w, h, markW) {
  const mark = await inkMark(markW);
  const { height: mh } = await sharp(mark).metadata();
  return sharp({ create: { width: w, height: h, channels: 3, background: hex(SPLASH_GROUND) } })
    .composite([{ input: mark, left: Math.round((w - markW) / 2), top: Math.round((h - mh) / 2) }])
    .png({ compressionLevel: 9 });
}

// ── iPhone startup images — render the cue frame in a browser (preferred) ─────
let browser = null;
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch();
} catch (e) {
  console.warn('⚠ no browser (', e.message, ') — falling back to the sharp draw for iPhone splashes');
}

if (browser) {
  for (const s of SPLASH_SCREENS) {
    const ctx = await browser.newContext({
      viewport: { width: s.w, height: s.h },
      deviceScaleFactor: s.r,
      reducedMotion: 'reduce',
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    await page.setContent(cueHtml(SPLASH_MARK_W), { waitUntil: 'load' });
    await page.screenshot({ path: `${OUT}/${s.file}`, clip: { x: 0, y: 0, width: s.w, height: s.h } });
    await ctx.close();
    console.log('✓', `${OUT}/${s.file}`, `${s.w * s.r}×${s.h * s.r}`, '(cue frame)');
  }
  await browser.close();
} else {
  for (const s of SPLASH_SCREENS) {
    await (await sharpGround(s.w * s.r, s.h * s.r, SPLASH_MARK_W * s.r)).toFile(`${OUT}/${s.file}`);
    console.log('✓', `${OUT}/${s.file}`, `${s.w * s.r}×${s.h * s.r}`, '(sharp fallback)');
  }
}

// ── Android maskable icons — sharp, unchanged ─────────────────────────────────
for (const size of [192, 512]) {
  await (await sharpGround(size, size, Math.round(size * 0.56))).toFile(`${OUT}/maskable-${size}.png`);
  console.log('✓', `${OUT}/maskable-${size}.png`);
}
