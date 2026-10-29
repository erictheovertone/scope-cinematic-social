// ── BRIEF MX-3 + C4 — labeled 10×10 grid fixtures ────────────────────────────
// Each cell (r,c) carries a DECODABLE fill so the matrix test can read which fixture cell a
// delivered sample came from (delivered-region check), plus the printed index + a border colour
// cycling every 2 cells (human aids for the attached divergent-cell images).
//
//   Fill encoding (robust to a default grade + JPEG):  R = 25 + r*22,  G = 25 + c*22,  B = 120.
//     decode:  r = round((R-25)/22),  c = round((G-25)/22)   (B≈120 marks "grid", else letterbox)
//   22-step with ±11 decode tolerance survives moderate chroma/tone shift; B=120 is the letterbox
//   discriminator (a grey like 64,64,59 fails |B-120|≤30 → "outside image").
//
//   Run:  node test/fixtures/create/gen-grid-fixtures.mjs   → test/fixtures/create/grid/
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'grid');
mkdirSync(DIR, { recursive: true });

const N = 10; // 10×10
// Shared encode/decode (kept in sync with the test's gridDecode in create-matrix.spec.ts).
export const fillFor = (r, c) => ({ R: 25 + r * 22, G: 25 + c * 22, B: 120 });
const BORDER_HUES = ['#ff3b30', '#34c759', '#007aff', '#ffcc00', '#af52de', '#5ac8fa']; // cycle every 2 cells

function gridSvg(w, h) {
  const cw = w / N, ch = h / N;
  const fs = Math.round(Math.min(cw, ch) * 0.22);
  const bw = Math.max(2, Math.round(Math.min(cw, ch) * 0.03)); // thin border
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const f = fillFor(r, c);
    const x = c * cw, y = r * ch;
    const border = BORDER_HUES[Math.floor((r * N + c) / 2) % BORDER_HUES.length];
    s += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="rgb(${f.R},${f.G},${f.B})"/>`;
    s += `<rect x="${x + bw / 2}" y="${y + bw / 2}" width="${cw - bw}" height="${ch - bw}" fill="none" stroke="${border}" stroke-width="${bw}"/>`;
    // index printed top-left (human aid); small so a centre/patch sample reads the fill
    s += `<text x="${x + cw * 0.08}" y="${y + ch * 0.26}" font-family="monospace" font-size="${fs}" fill="#000">${r},${c}</text>`;
  }
  return Buffer.from(s + '</svg>');
}

// Upright fixture (pixels == display).
async function upright(name, w, h) {
  await sharp(gridSvg(w, h)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(join(DIR, name));
  console.log('  ', name, `${w}×${h}`);
}

// EXIF-6 fixture: DISPLAY is portrait w×h; stored landscape (rotate pixels 90° CCW) + orientation 6
// (viewer rotates 90° CW → upright portrait). Direction verified by the harness bare-<img> decode.
async function exif6(name, w, h) {
  const portrait = await sharp(gridSvg(w, h)).png().toBuffer(); // upright display pixels (w×h)
  await sharp(portrait)
    .rotate(270)                       // store rotated 90° CCW (so orientation-6's +90° CW restores it)
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(join(DIR, name));
  console.log('  ', name, `display ${w}×${h} (stored ${h}×${w} EXIF-6)`);
}

console.log('generating labeled 10×10 grid fixtures →', DIR);
await upright('grid-1920x1440.jpg', 1920, 1440);  // landscape 4:3
await upright('grid-1440x1920.jpg', 1440, 1920);  // portrait 3:4
await upright('grid-1920x1920.jpg', 1920, 1920);  // square
await upright('grid-1080x1350.jpg', 1080, 1350);  // portrait 4:5
await upright('grid-1080x1920.jpg', 1080, 1920);  // portrait 9:16
await upright('grid-1170x2532.jpg', 1170, 2532);  // portrait (iPhone)
await upright('grid-3024x4032.jpg', 3024, 4032);  // portrait large 3:4
await exif6('grid-1170x2532-exif6.jpg', 1170, 2532);
await exif6('grid-3024x4032-exif6.jpg', 3024, 4032);

// ── self-test: round-trip decode a few known cells through the JPEG ───────────
const markerOk = (p) => Math.abs(p.B - 120) <= 30 && p.R >= 14 && p.R <= 234 && p.G >= 14 && p.G <= 234;
const decode = (p) => ({ r: Math.round((p.R - 25) / 22), c: Math.round((p.G - 25) / 22) });
async function selfTest(name, w, h) {
  const { data, info } = await sharp(join(DIR, name)).rotate().raw().toBuffer({ resolveWithObject: true }); // .rotate() applies EXIF
  const at = (nx, ny) => { const x = Math.round(nx * info.width), y = Math.round(ny * info.height); const i = (y * info.width + x) * info.channels; return { R: data[i], G: data[i + 1], B: data[i + 2] }; };
  // centres of cells (r,c) = ((c+0.5)/10, (r+0.5)/10)
  const checks = [[0, 0], [0, 9], [9, 0], [9, 9], [4, 6]];
  const bad = [];
  for (const [r, c] of checks) {
    const p = at((c + 0.5) / N, (r + 0.5) / N);
    const d = decode(p);
    if (!markerOk(p) || d.r !== r || d.c !== c) bad.push(`(${r},${c})→${JSON.stringify(p)} decoded(${d.r},${d.c}) marker=${markerOk(p)}`);
  }
  console.log(`   self-test ${name}: ${bad.length ? 'FAIL ' + bad.join(' ; ') : 'ok (5/5 cells decode)'}`);
  return bad.length === 0;
}
console.log('self-test (decode round-trips through JPEG + EXIF):');
let allOk = true;
allOk = await selfTest('grid-1920x1440.jpg', 1920, 1440) && allOk;
allOk = await selfTest('grid-1440x1920.jpg', 1440, 1920) && allOk;
allOk = await selfTest('grid-3024x4032.jpg', 3024, 4032) && allOk;
allOk = await selfTest('grid-1170x2532-exif6.jpg', 1170, 2532) && allOk;
allOk = await selfTest('grid-3024x4032-exif6.jpg', 3024, 4032) && allOk;
console.log(allOk ? 'done — all self-tests passed' : 'done — SELF-TEST FAILURES above');
process.exit(allOk ? 0 : 1);
