-- Brief P0 §2b — posts.media_has_renditions
-- The client requests a baked `.{w}.webp` rendition for a post-media image ONLY when this
-- flag is true; otherwise it loads the master directly. Legacy posts (and posts whose
-- fire-and-forget bake failed) stay false → no 404'd rendition → no fallback-to-master
-- decode storm on the post scroll. /api/renditions sets it true after a successful 600-tier
-- bake; scripts/backfill-renditions.mjs sets it for existing posts.
--
-- Default false is the SAFE state (serve the master). Run in the Supabase SQL editor.

alter table posts
  add column if not exists media_has_renditions boolean not null default false;

-- Optional: flag posts that already HAVE a baked 600 rendition so they keep serving the
-- small WebP immediately (otherwise they ride the master until the backfill runs). The
-- backfill script does this precisely (it HEAD-checks each object); this is a no-op
-- placeholder — prefer `npm run renditions:backfill -- --run` which also bakes the missing.
