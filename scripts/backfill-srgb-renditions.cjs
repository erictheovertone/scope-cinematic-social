// ── Backfill: re-bake ALL image renditions through the sRGB-corrected path (Brief X5 §3) ──
//
// Brief X5 §2 added `.toColorspace('srgb')` to renditionsServer.ts so P3 masters bake to
// faithful (untagged) sRGB WebP instead of washed-out untagged-P3. Existing renditions were
// baked the OLD way, so they stay washed until re-baked. This overwrites 600/1600/2560 in
// place (same filenames, upsert) from the untouched masters — reversible (masters preserved).
//
// Mirrors renditionsServer.ts's chain EXACTLY (rotate → resize → toColorspace('srgb') → webp
// q78, 2560 only when the master is genuinely >=2560). Server-side, SERVICE_ROLE from
// .env.local. Eric-triggered (manual), same as the other backfill scripts.
//
//   node scripts/backfill-srgb-renditions.cjs --dry    # count masters, no writes
//   node scripts/backfill-srgb-renditions.cjs          # re-bake + upload

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const DRY = process.argv.includes('--dry');
const PUBLIC = '/storage/v1/object/public/';
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;
const IS_RENDITION = /\.(?:600|1600|2560)\.webp$/;
const WIDTHS = [600, 1600, 2560];
const CACHE = 'public, max-age=31536000, immutable';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const get = (k) => env[k];
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const parse = (url) => {
  const i = (url || '').indexOf(PUBLIC);
  if (i === -1) return null;
  const rest = url.slice(i + PUBLIC.length).split('?')[0];
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
};

(async () => {
  const { data: posts, error } = await sb.from('posts').select('media_urls').eq('is_deleted', false);
  if (error) { console.error('query error:', error.message); process.exit(1); }
  const masters = [...new Set(
    (posts || []).flatMap((p) => p.media_urls || [])
      .filter(Boolean)
      .map((u) => u.split('?')[0])
      .filter((u) => u.includes(PUBLIC) && IMAGE_EXT.test(u) && !IS_RENDITION.test(u)),
  )];
  console.log(`post-media image masters: ${masters.length}${DRY ? '  (DRY RUN — no writes)' : ''}`);
  if (DRY) { masters.forEach((m) => console.log('  ' + m.slice(m.indexOf(PUBLIC) + PUBLIC.length))); return; }

  let baked = 0, failed = 0, skipped = 0;
  for (const masterUrl of masters) {
    const parsed = parse(masterUrl);
    if (!parsed) { failed++; continue; }
    const { bucket, path } = parsed;
    try {
      const res = await fetch(masterUrl);
      if (!res.ok) { console.warn(`  fetch ${res.status}: ${path}`); failed++; continue; }
      const input = Buffer.from(await res.arrayBuffer());
      let longest = 0;
      try { const meta = await sharp(input).metadata(); longest = Math.max(meta.width || 0, meta.height || 0); } catch { /* 2560 skipped */ }
      for (const w of WIDTHS) {
        if (w >= 2560 && longest < w) { skipped++; continue; }
        const webp = await sharp(input)
          .rotate()
          .resize({ width: w, withoutEnlargement: true, fit: 'inside' })
          .toColorspace('srgb')
          .webp({ quality: 78 })
          .toBuffer();
        const { error: upErr } = await sb.storage.from(bucket).upload(`${path}.${w}.webp`, webp, {
          upsert: true, contentType: 'image/webp', cacheControl: CACHE,
        });
        if (upErr) { console.warn(`  upload ${w} ${path}: ${upErr.message}`); failed++; }
        else { baked++; }
      }
      console.log(`  ✓ ${path} (longest ${longest})`);
    } catch (e) { console.warn(`  error ${path}: ${e.message}`); failed++; }
  }
  console.log(`\nDONE — rendition files baked: ${baked} · skipped(2560<master): ${skipped} · failed: ${failed}`);
})();
