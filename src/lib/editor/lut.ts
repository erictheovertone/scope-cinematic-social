/**
 * LUT engine — parse .cube 3D LUTs and represent them for both the GPU (a 2D-
 * tiled texture sampled with trilinear interp in the LOOK shader) and the CPU
 * (direct trilinear sampling, used to render the Palette's audition thumbnails).
 *
 * WebGL1 has no 3D textures, so the LUT is laid out as a 2D texture of size
 * (N*N) × N: N blue-slices tiled left→right; within a slice x=red, y=green.
 * Small in-house parser — no dependency.
 */

export interface ParsedLut { size: number; data: Float32Array; } // data: size³·3, red fastest

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function parseCube(text: string): ParsedLut {
  let size = 0;
  const vals: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const up = line.toUpperCase();
    if (up.startsWith('TITLE')) continue;
    if (up.startsWith('LUT_3D_SIZE')) { size = parseInt(line.split(/\s+/)[1], 10); continue; }
    if (up.startsWith('LUT_1D_SIZE')) throw new Error('1D LUTs are not supported');
    if (up.startsWith('DOMAIN_MIN') || up.startsWith('DOMAIN_MAX')) continue; // assume 0..1 domain
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && !parts.slice(0, 3).some((n) => Number.isNaN(n))) {
      vals.push(parts[0], parts[1], parts[2]);
    }
  }
  const expected = size * size * size * 3;
  if (!size || vals.length !== expected) {
    throw new Error(`Invalid .cube: LUT_3D_SIZE=${size}, got ${vals.length} values (expected ${expected})`);
  }
  return { size, data: Float32Array.from(vals) };
}

/** 2D-tiled texture: (N*N)×N, slice z tiled at columns [z*N, z*N+N). */
export function lutToCanvas(lut: ParsedLut): HTMLCanvasElement {
  const { size, data } = lut;
  const w = size * size, h = size;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('lutToCanvas: no 2d context');
  const img = ctx.createImageData(w, h);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const li = ((b * size + g) * size + r) * 3;
        const pi = (g * w + (b * size + r)) * 4;
        img.data[pi] = Math.round(clamp01(data[li]) * 255);
        img.data[pi + 1] = Math.round(clamp01(data[li + 1]) * 255);
        img.data[pi + 2] = Math.round(clamp01(data[li + 2]) * 255);
        img.data[pi + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** CPU trilinear sample (rgb in 0..1) → [r,g,b] 0..1. */
export function sampleLut(lut: ParsedLut, r: number, g: number, b: number): [number, number, number] {
  const { size, data } = lut;
  const n1 = size - 1;
  const fr = clamp01(r) * n1, fg = clamp01(g) * n1, fb = clamp01(b) * n1;
  const r0 = Math.floor(fr), g0 = Math.floor(fg), b0 = Math.floor(fb);
  const r1 = Math.min(r0 + 1, n1), g1 = Math.min(g0 + 1, n1), b1 = Math.min(b0 + 1, n1);
  const dr = fr - r0, dg = fg - g0, db = fb - b0;
  const idx = (rr: number, gg: number, bb: number) => ((bb * size + gg) * size + rr) * 3;
  const lerp = (a: number, c: number, t: number) => a + (c - a) * t;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const x00 = lerp(data[idx(r0, g0, b0) + c], data[idx(r1, g0, b0) + c], dr);
    const x10 = lerp(data[idx(r0, g1, b0) + c], data[idx(r1, g1, b0) + c], dr);
    const x01 = lerp(data[idx(r0, g0, b1) + c], data[idx(r1, g0, b1) + c], dr);
    const x11 = lerp(data[idx(r0, g1, b1) + c], data[idx(r1, g1, b1) + c], dr);
    const y0 = lerp(x00, x10, dg), y1 = lerp(x01, x11, dg);
    out[c] = lerp(y0, y1, db);
  }
  return out;
}

/** Apply a LUT to an ImageData (full strength) → new ImageData. CPU; for thumbnails. */
export function applyLutToImageData(lut: ParsedLut, src: ImageData): ImageData {
  const out = new ImageData(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    const [r, g, b] = sampleLut(lut, src.data[i] / 255, src.data[i + 1] / 255, src.data[i + 2] / 255);
    out.data[i] = Math.round(clamp01(r) * 255);
    out.data[i + 1] = Math.round(clamp01(g) * 255);
    out.data[i + 2] = Math.round(clamp01(b) * 255);
    out.data[i + 3] = src.data[i + 3];
  }
  return out;
}

// ── Cache: fetch + parse + build once per look id ──
export interface LutEntry { parsed: ParsedLut; canvas: HTMLCanvasElement }
const cache = new Map<string, LutEntry>();
const inflight = new Map<string, Promise<LutEntry>>();

export async function ensureLut(id: string, file: string): Promise<LutEntry> {
  const hit = cache.get(id);
  if (hit) return hit;
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = (async () => {
    const res = await fetch(encodeURI(file)); // folders contain spaces / &
    if (!res.ok) throw new Error(`LUT fetch failed: ${file} (${res.status})`);
    const parsed = parseCube(await res.text());
    const entry: LutEntry = { parsed, canvas: lutToCanvas(parsed) };
    cache.set(id, entry);
    inflight.delete(id);
    return entry;
  })();
  inflight.set(id, p);
  return p;
}

export const getCachedLut = (id: string | null): LutEntry | null => (id ? cache.get(id) ?? null : null);
