// ── Brief V2-0 §3 — measure the background-upload budget ──────────────────────
// Uploads a video through the SAME TUS path the app uses (/api/stream/direct-upload
// → PATCH straight to Cloudflare Stream), timing (1) upload wall time and (2) Stream
// processing time to readyToStream (polls the HLS manifest until it 200s).
//
// Needs an env with the Stream creds (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_TOKEN)
// — i.e. the deployed preview, NOT a bare localhost (those are Vercel-only secrets).
//
//   BASE_URL=https://<preview> node test/fixtures/create/measure-upload.mjs /path/to/IMG_1316.mov
//   # throttle to 20 Mbps with your OS/proxy (e.g. `trickle -u 2500`), or read the
//   # transfer-rate line below and compute: 20 Mbps → fileMB*8/20 s.
import { readFileSync, statSync } from 'fs';
import { basename } from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const FILE = process.argv[2];
if (!FILE) { console.error('usage: node measure-upload.mjs <video-file>'); process.exit(1); }
const CHUNK = 5 * 1024 * 1024;
const bytes = readFileSync(FILE);
const size = statSync(FILE).size;
const name = basename(FILE);
console.log(`file: ${name}  ${(size / 1048576).toFixed(1)} MB`);

// 1) sign
const sign = await fetch(`${BASE}/api/stream/direct-upload`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ uploadLength: size, name }),
});
if (!sign.ok) { console.error(`sign failed ${sign.status} — creds missing on ${BASE}?`); process.exit(1); }
const { uploadUrl, uid } = await sign.json();

// 2) TUS upload (timed)
const t0 = Date.now();
let offset = 0;
while (offset < size) {
  const end = Math.min(offset + CHUNK, size);
  const res = await fetch(uploadUrl, {
    method: 'PATCH',
    headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
    body: bytes.subarray(offset, end),
  });
  if (res.status !== 204 && res.status !== 200) { console.error(`PATCH ${res.status} @${offset}`); process.exit(1); }
  offset = Number(res.headers.get('Upload-Offset') ?? end) || end;
  process.stdout.write(`\r  upload ${Math.round((offset / size) * 100)}%`);
}
const uploadMs = Date.now() - t0;
const mbps = ((size * 8) / 1e6) / (uploadMs / 1000);
console.log(`\nUPLOAD wall: ${(uploadMs / 1000).toFixed(1)}s at ${mbps.toFixed(1)} Mbps (actual link)`);
console.log(`  → at a throttled 20 Mbps: ${((size * 8 / 1e6) / 20).toFixed(1)}s`);

// 3) poll Stream HLS manifest until ready (processing time)
const CUST = process.env.STREAM_CUSTOMER_CODE || 'd1di7e2fjth1m0wg';
const manifest = `https://customer-${CUST}.cloudflarestream.com/${uid}/manifest/video.m3u8`;
const p0 = Date.now();
let ready = false;
while (Date.now() - p0 < 10 * 60_000) {
  const r = await fetch(manifest, { method: 'GET' }).catch(() => null);
  if (r && r.ok) { ready = true; break; }
  await new Promise((r) => setTimeout(r, 3000));
  process.stdout.write(`\r  processing ${Math.round((Date.now() - p0) / 1000)}s`);
}
console.log(ready ? `\nSTREAM processing to readyToStream: ${((Date.now() - p0) / 1000).toFixed(0)}s  (uid ${uid})`
                  : `\nSTREAM not ready after 10min (uid ${uid})`);
