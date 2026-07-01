// ── ONE-TIME backfill: set long cache-control on existing storage media ──────
//
// Fix #1 of the media sequence. Existing storage objects were uploaded with
// cache-control: no-cache → Supabase's Cloudflare CDN (and browsers) never cached
// them, so 63 MB+ re-downloaded on every feed load (cold AND warm). This re-writes
// each referenced object's cache-control to max-age=31536000 (1 year), keeping the
// SAME key/URL (stable public paths — existing posts never break). Filenames are
// unique per upload, so immutable caching is safe.
//
// Server-side (SUPABASE_SERVICE_ROLE_KEY). Non-destructive: metadata only, bytes
// preserved. Run once:  node scripts/backfill-media-cache-control.cjs
// (Idempotent — re-running just re-applies the same header.)

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1];
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const parse = (url) => {
  const m = (url || '').match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  return m ? { bucket: m[1], key: decodeURIComponent(m[2]) } : null;
};

(async () => {
  const { data: posts } = await sb.from('posts').select('media_urls, poster_url, thumbnail_url, autoplay_clip_url');
  const { data: profs } = await sb.from('profiles').select('profile_image_url');
  const urls = new Set();
  for (const p of posts || []) {
    (p.media_urls || []).forEach((u) => u && urls.add(u));
    [p.poster_url, p.thumbnail_url, p.autoplay_clip_url].forEach((u) => u && urls.add(u));
  }
  for (const p of profs || []) if (p.profile_image_url) urls.add(p.profile_image_url);

  const objs = [...urls].map(parse).filter(Boolean);
  console.log(`referenced media objects: ${objs.length}`);

  let ok = 0, skip = 0, fail = 0, bytes = 0;
  for (const { bucket, key } of objs) {
    try {
      const dl = await sb.storage.from(bucket).download(key);
      if (dl.error || !dl.data) { skip++; continue; }
      const buf = Buffer.from(await dl.data.arrayBuffer());
      bytes += buf.length;
      const ct = (dl.data.type || 'application/octet-stream').split(';')[0].trim();
      const up = await sb.storage.from(bucket).update(key, buf, { cacheControl: '31536000', upsert: true, contentType: ct });
      if (up.error) { console.log('update fail', key, up.error.message); fail++; } else ok++;
    } catch (e) { console.log('err', key, e.message); fail++; }
  }
  console.log(`backfilled: ${ok} | skipped: ${skip} | failed: ${fail} | moved ${(bytes / 1048576).toFixed(1)} MB (one-time, server-side)`);
})();
