// Brief C2 §0 — generate the create-pipeline test fixtures. Each carries a 4×4 colored grid so
// regions can be asserted by cell (A1..D4). Run: `node test/fixtures/create/generate.mjs`.
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));

// 16 distinct, well-separated sRGB colors for the 4×4 grid (row-major A1..D4).
const CELLS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8',
  '#f58231', '#911eb4', '#46f0f0', '#f032e6',
  '#bcf60c', '#fabebe', '#008080', '#9a6324',
  '#800000', '#808000', '#000075', '#a9a9a9',
];

// A known P3-vivid color + its sRGB-clamped reference (for the §1c Δ3 gate). Pure-ish green in P3
// gamut-maps to ~ this sRGB; the harness samples the top-left cell against P3_SRGB_REF.
export const P3_SRGB_REF = { r: 0, g: 249, b: 0 }; // documented reference; harness asserts Δ≤3

function gridSvg(w, h, cells = CELLS) {
  const cols = 4, rows = 4, cw = w / cols, ch = h / rows;
  let rects = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    rects += `<rect x="${c * cw}" y="${r * ch}" width="${cw}" height="${ch}" fill="${cells[i]}"/>`;
    rects += `<text x="${c * cw + 12}" y="${r * ch + 40}" font-family="monospace" font-size="${Math.round(Math.min(cw, ch) * 0.18)}" fill="#000">${'ABCD'[r]}${c + 1}</text>`;
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rects}</svg>`);
}

async function jpeg(name, w, h, opts = {}) {
  let img = sharp(gridSvg(w, h)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  if (opts.p3) img = img.withMetadata({ icc: 'p3' });
  await img.toFile(join(DIR, name));
  console.log('  ', name, `${w}×${h}`, opts.orientation ? `EXIF-${opts.orientation}` : '', opts.p3 ? 'P3' : '');
}

console.log('generating create fixtures:');
await jpeg('landscape-4000x3000-noexif.jpg', 4000, 3000);
// Portrait iPhone: pixels stored landscape 4000×3000 + EXIF orientation 6 (display rotates 90° CW).
await jpeg('portrait-exif6.jpg', 4000, 3000, { orientation: 6 });
await jpeg('square-3000.jpg', 3000, 3000);
// P3-tagged with the vivid-green top-left cell for the color gate.
await jpeg('p3-tagged.jpg', 2000, 2000, { p3: true });
// 12MP perf fixture.
await jpeg('perf-12mp.jpg', 4000, 3000);
console.log('done →', DIR);
