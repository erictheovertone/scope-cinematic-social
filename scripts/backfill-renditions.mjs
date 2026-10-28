// ── Brief P0 §2c — backfill post-media renditions ─────────────────────────────
// Posts published before renditions existed (or whose fire-and-forget bake failed) have
// no `.{w}.webp`, so the client 404s them and the scroll falls every tile back to its
// full-res master — the iOS decode storm that kills the tab. This bakes the missing
// 600/1600/2560 WebP via sharp (renditionsServer) and flips posts.media_has_renditions
// so the client serves the small WebP.
//
//   DRY-RUN (default, no writes):  npm run renditions:backfill
//   EXECUTE (bake + flag):         BASE_URL=http://localhost:3000 npm run renditions:backfill -- --run
//                                  (the app server must be running — baking goes through
//                                   /api/renditions so it uses Next's module resolver + sharp)
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const RUN = process.argv.includes('--run');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const env = {};
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
} catch { /* fall through to process.env */ }
const URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('✗ missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)'); process.exit(1); }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;
const isPostImage = (u) => !!u && u.includes('/post-media/') && IMAGE_EXT.test(u.split('?')[0]);
const has600 = async (master) => { try { const r = await fetch(`${master}.600.webp`, { method: 'HEAD' }); return r.ok; } catch { return false; } };

// Every image post (paged — Supabase caps a select at 1000 rows).
const posts = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('posts').select('id, media_urls, media_type').eq('media_type', 'image').range(from, from + 999);
  if (error) { console.error(error); process.exit(1); }
  posts.push(...(data || []));
  if (!data || data.length < 1000) break;
}
const imgPosts = posts.filter((p) => isPostImage(p.media_urls?.[0]));

console.log(`${RUN ? 'EXECUTE' : 'DRY-RUN'} — ${imgPosts.length} image posts with a post-media master`);
let present = 0, missing = 0, baked = 0, flagged = 0, failed = 0;
const missingIds = [];
for (const p of imgPosts) {
  const master = p.media_urls[0];
  if (await has600(master)) {
    present++;
    if (RUN) { const { error } = await supabase.from('posts').update({ media_has_renditions: true }).eq('id', p.id); if (!error) flagged++; }
  } else {
    missing++; missingIds.push(p.id);
    if (RUN) {
      // Bake via the running app's /api/renditions (server-side sharp + Next resolver);
      // the route also flips media_has_renditions after a successful 600-tier bake.
      try {
        const r = await fetch(`${BASE}/api/renditions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ masterUrl: master }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(j.results) && j.results.some((x) => x.width === 600 && x.ok)) { baked++; if (j.flagged) flagged++; }
        else { failed++; console.warn('  ✗ bake failed:', p.id, JSON.stringify(j).slice(0, 160)); }
      } catch (e) { failed++; console.warn('  ✗ bake error:', p.id, String(e).slice(0, 120)); }
    }
  }
}
console.log(`  .600 already present : ${present}`);
console.log(`  .600 MISSING         : ${missing}`);
if (RUN) console.log(`  baked: ${baked}   flagged media_has_renditions=true: ${flagged}   bake-failed: ${failed}`);
else console.log(`  (dry-run — no writes) missing ids (first 25): ${missingIds.slice(0, 25).join(', ')}`);

// ── Brief SCROLL-GUARD — backfill VIDEO POSTER renditions ─────────────────────
// Video posts render the at-rest frame from poster_url (an UPLOADED post-media image, baked by
// publish since V2a). Legacy video posts predate that bake, so their poster has no `.{w}.webp`
// and every scroll tile loaded the multi-MB master. Bake 600/1600/2560 for each uploaded poster
// (Stream thumbnails size live via ?width → skipped). No flag flip: /api/renditions only flags
// a post whose media_urls contains the URL, and a poster is never in media_urls.
const vids = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('posts').select('id, poster_url, media_type').eq('media_type', 'video').range(from, from + 999);
  if (error) { console.error(error); process.exit(1); }
  vids.push(...(data || []));
  if (!data || data.length < 1000) break;
}
const posterPosts = vids.filter((p) => isPostImage(p.poster_url)); // uploaded post-media posters only (excludes Stream thumbnails)
console.log(`\n${RUN ? 'EXECUTE' : 'DRY-RUN'} — ${posterPosts.length} video posts with an uploaded post-media poster`);
let pPresent = 0, pMissing = 0, pBaked = 0, pFailed = 0;
const pMissingIds = [];
for (const p of posterPosts) {
  const poster = p.poster_url;
  if (await has600(poster)) { pPresent++; continue; }
  pMissing++; pMissingIds.push(p.id);
  if (RUN) {
    try {
      const r = await fetch(`${BASE}/api/renditions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ masterUrl: poster }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.results) && j.results.some((x) => x.width === 600 && x.ok)) pBaked++;
      else { pFailed++; console.warn('  ✗ poster bake failed:', p.id, JSON.stringify(j).slice(0, 160)); }
    } catch (e) { pFailed++; console.warn('  ✗ poster bake error:', p.id, String(e).slice(0, 120)); }
  }
}
console.log(`  poster .600 already present : ${pPresent}`);
console.log(`  poster .600 MISSING         : ${pMissing}`);
if (RUN) console.log(`  poster baked: ${pBaked}   poster bake-failed: ${pFailed}`);
else console.log(`  (dry-run — no writes) missing poster ids (first 25): ${pMissingIds.slice(0, 25).join(', ')}`);
