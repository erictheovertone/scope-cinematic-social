-- ── Screening Room — rank by market cap (UI + metric change) ──────────────────
-- Step 1's cron now ranks the room by MARKET CAP (most-valuable posts), not
-- all-time volume. Add the column the cron writes; `volume` is kept for
-- reference. The next cron run overwrites the cache with the MC-ranked top 50.
--
-- Run manually in the Supabase SQL editor.

ALTER TABLE screening_room ADD COLUMN IF NOT EXISTS market_cap NUMERIC;
