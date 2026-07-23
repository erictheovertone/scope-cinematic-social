-- ── Brief V2 — Cloudflare Stream video pipeline: schema deltas ───────────────
-- Run in the Supabase SQL editor with the two-step INSPECT-then-ALTER discipline.
-- Additive only; nothing dropped. Existing video posts stay video_status = NULL
-- (they keep the current Supabase-file playback path — that is V4's backfill territory).

-- ── STEP 1 — INSPECT (run first, read the output, THEN run Step 2) ────────────
-- 1a. What video-related columns already exist?
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_name = 'posts'
  and column_name in ('video_status','stream_uid','stream_playback_url','stream_poster_url','media_type','poster_url')
order by column_name;

-- 1b. Inventory of current media_type values (the "notifications lesson" — never
--     constrain a text column to a value set before seeing the real inventory).
select media_type, count(*) from posts group by media_type;

-- 1c. How many rows are videos (the population V4 will later backfill)?
select count(*) from posts where media_type = 'video';

-- ── STEP 2 — ALTER (only after reading Step 1) ───────────────────────────────
-- No CHECK constraint on video_status values (inventory-first rule): it holds
-- 'processing' | 'ready' | 'failed' for NEW video posts; NULL for images and for
-- existing (pre-pipeline) videos. Kept as plain text so a future state can't
-- require a migration.
alter table posts add column if not exists video_status        text;
alter table posts add column if not exists stream_uid          text;   -- Cloudflare Stream video UID
alter table posts add column if not exists stream_playback_url text;   -- HLS manifest (…/manifest/video.m3u8) — set by webhook on 'ready'
alter table posts add column if not exists stream_poster_url   text;   -- Stream auto-thumbnail (…/thumbnails/thumbnail.jpg) — set by webhook

comment on column posts.video_status is
  'Brief V2: processing | ready | failed for NEW Stream-backed video posts. NULL = image, or a pre-pipeline video (V4 backfill).';
comment on column posts.stream_uid is
  'Brief V2: Cloudflare Stream video UID. The webhook matches on this to flip status + write playback/poster URLs.';

-- Optional: index the reconciliation query (posts stuck processing). Cheap; safe to skip.
create index if not exists posts_video_status_idx on posts (video_status) where video_status = 'processing';
