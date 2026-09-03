// ── Backfill: bake the 2560 WebP rendition for eligible existing post-media ──────
//
// Brief Q1. The 2560 tier was added to the bake pipeline (renditionsServer + feedImage);
// NEW posts get it at publish. This backfills EXISTING posts whose master is large enough.
//
// Per master image (post-media only):
//   • skip if its .2560.webp already exists            (idempotent — re-run safe)
//   • skip if the master's longest side < 2560         (no upscaling; would be redundant)
//   • else sharp-resize width 2560 (fit:inside, no-enlarge), WebP q78, upload {master}.2560.webp
//     ALONGSIDE the master with immutable cache — the exact path feedImage derives.
// 600/1600 are NOT touched (existing renditions untouched).
//
// Server-side (SUPABASE_SERVICE_ROLE_KEY from .env.local). Eric-triggered (manual), same as
// backfill-media-cache-control.cjs — there is no scheduled cron for renditions.
//
//   DRY RUN (counts only, no writes):  node scripts/backfill-2560-renditions.cjs --dry-run
//   RUN:                               node scripts/backfill-2560-renditions.cjs
//
// The dry-run reports: total masters, already-done, too-small (skip), and ELIGIBLE-to-bake
// — run it FIRST to get the counts + projected storage before the real run.

const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
const fs = require('fs');

const DRY = process.argv.includes('--dry-run');
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1];
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const PUBLIC = '/storage/v1/object/public/';
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;
const IS_RENDITION = /\.(?:600|1600|2560)\.webp$/;

const parse = (url) => {
  const i = (url || '').indexOf(PUBLIC);
  if (i === -1) return null;
  const rest = url.slice(i + PUBLIC.length).split('?')[0];
  const slash = rest.indexOf('/');
  return slash === -1 ? null : { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
};

(async () => {
  const { data: posts } = await sb.from('posts').select('media_urls');
  // Post-media image masters only (not renditions, not videos/foreign hosts).
  const masters = [...new Set(
    (posts || []).flatMap((p) => p.media_urls || [])
      .filter((u) => u && u.includes(PUBLIC + 'post-media/'))
      .map((u) => u.split('?')[0])
      .filter((u) => IMAGE_EXT.test(u) && !IS_RENDITION.test(u)),
  )];
  console.log(`post-media image masters: ${masters.length}${DRY ? '  (DRY RUN)' : ''}`);

  let done = 0, small = 0, eligible = 0, baked = 0, failed = 0, bytesAdded = 0;
  for (const masterUrl of masters) {
    const parsed = parse(masterUrl);
    if (!parsed) { failed++; continue; }
    const { bucket, path } = parsed;
    try {
      // already done? (HEAD the public rendition URL — no download)
      const head = await fetch(`${masterUrl}.2560.webp`, { method: 'HEAD' });
      if (head.ok) { done++; continue; }

      const res = await fetch(masterUrl);
      if (!res.ok) { failed++; continue; }
      const input = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(input).metadata();
      const longest = Math.max(meta.width || 0, meta.height || 0);
      if (longest < 2560) { small++; continue; }

      eligible++;
      if (DRY) continue;

      const webp = await sharp(input).rotate().resize({ width: 2560, withoutEnlargement: true, fit: 'inside' }).webp({ quality: 78 }).toBuffer();
      const up = await sb.storage.from(bucket).upload(`${path}.2560.webp`, webp, {
        upsert: true, contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable',
      });
      if (up.error) { console.log('upload fail', path, up.error.message); failed++; }
      else { baked++; bytesAdded += webp.length; }
    } catch (e) { console.log('err', path, e.message); failed++; }
  }

  if (DRY) {
    console.log(`already-done: ${done} | too-small (skip): ${small} | ELIGIBLE to bake: ${eligible} | errors: ${failed}`);
    console.log(`→ projected storage added ≈ eligible × ~(1600-bytes × 1.8–2.4). Run without --dry-run to bake.`);
  } else {
    console.log(`baked: ${baked} | already-done: ${done} | too-small: ${small} | failed: ${failed} | added ${(bytesAdded / 1048576).toFixed(1)} MB`);
  }
})();
