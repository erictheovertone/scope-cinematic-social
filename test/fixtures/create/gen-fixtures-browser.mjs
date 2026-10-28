// ── Brief V1 §3 — EDIT & POST video fixtures WITHOUT ffmpeg ───────────────────
// Records a 1080×1920 animated canvas through MediaRecorder in headless Chromium.
// Recent Chromium records real H.264 in an MP4 container (isTypeSupported
// 'video/mp4;codecs=h264'); we prefer that so the clips decode in iphone-webkit
// exactly like a device H.264 clip. Falls back to webm only if MP4/H.264 is
// unavailable (and warns — webm won't decode in WebKit). Recording is real time,
// so this takes ~20+45+90 ≈ 155s. Output → public/test-fixtures/ (gitignored).
//
//   node test/fixtures/create/gen-fixtures-browser.mjs
//   node test/fixtures/create/gen-fixtures-browser.mjs 4k   # V3 — 4096×2160 8.2s (Eric's device clip shape) → v-4k.mp4
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = join(ROOT, 'public', 'test-fixtures');
mkdirSync(OUT, { recursive: true });

const FOUR_K = process.argv[2] === '4k';
const DURATIONS = FOUR_K ? [8.2] : [20, 45, 90];
const W = FOUR_K ? 4096 : 1080, H = FOUR_K ? 2160 : 1920, FPS = 30, BITRATE = FOUR_K ? 45_000_000 : 12_000_000;
const NAME = (d) => (FOUR_K ? 'v-4k' : `v-${d}s`);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setContent('<!doctype html><body style="margin:0;background:#000"><canvas id="c"></canvas></body>');

for (const d of DURATIONS) {
  process.stdout.write(`→ ${NAME(d)}.mp4 (${W}x${H} H.264, ${d}s, real-time)… `);
  const b64 = await page.evaluate(async ({ W, H, FPS, BITRATE, d }) => {
    const c = document.getElementById('c');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const mimes = ['video/mp4;codecs=h264', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const mime = mimes.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    const stream = c.captureStream(FPS);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });

    // Animate so frames carry real inter-frame delta (not a trivial static decode).
    let raf = 0, t0 = performance.now();
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = `hsl(${(t * 40) % 360} 70% 12%)`; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e6194b';
      const x = (W / 2) + Math.cos(t * 1.7) * (W * 0.3), y = (H / 2) + Math.sin(t * 1.3) * (H * 0.35);
      ctx.beginPath(); ctx.arc(x, y, 180, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 120px monospace';
      ctx.fillText(t.toFixed(1) + 's', 60, 180);
      raf = requestAnimationFrame(draw);
    };
    draw();
    rec.start();
    await new Promise((r) => setTimeout(r, d * 1000));
    cancelAnimationFrame(raf); rec.stop();
    await done;
    const blob = new Blob(chunks, { type: mime });
    const buf = await blob.arrayBuffer();
    let s = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return { mime, b64: btoa(s) };
  }, { W, H, FPS, BITRATE, d });

  const ext = b64.mime.includes('mp4') ? 'mp4' : 'webm';
  const path = join(OUT, `${NAME(d)}.${ext}`);
  const buf = Buffer.from(b64.b64, 'base64');
  writeFileSync(path, buf);
  console.log(`${(buf.length / 1048576).toFixed(1)} MB  [${b64.mime}]`);
  if (ext === 'webm') console.warn('  ⚠ webm fallback — WebKit will not decode this; install ffmpeg for H.264.');
}

await browser.close();
console.log('done →', OUT);
