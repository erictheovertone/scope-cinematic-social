-- LAYOUT MODEL — AR is ONE shared value; COUNT is per-surface.
-- Replaces the desktop_layout blob approach. Run once in the Supabase SQL editor.
--
-- New columns are NULLABLE: the resolver (src/lib/layoutModel.ts) falls back to
-- the legacy fields (grid_layout, desktop_layout) when a new field is null, so
-- existing users keep their current look until they next set something. The
-- backfill below is OPTIONAL — it just makes the shared AR explicit up front.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS aspect_ratio  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mobile_count  int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS desktop_count int;

-- OPTIONAL backfill — seed the shared AR from the mobile grid_layout (the older
-- primary surface), so AR is explicit and mirrors immediately on both surfaces.
-- Only fills where unset; conflicting desktop aspects converge to mobile's.
UPDATE profiles SET aspect_ratio = CASE
    WHEN grid_layout = 'collage'                          THEN 'collage'
    WHEN grid_layout ILIKE '%pana%'                       THEN 'pana-wide'
    WHEN grid_layout ILIKE '%cine%'                       THEN 'cine-wide'
    WHEN grid_layout ILIKE '%legacy%' OR grid_layout ILIKE '%4:3%' THEN 'legacy'
    WHEN grid_layout ILIKE '%scope%' OR grid_layout ILIKE '%2.4%'  THEN 'scope'
    ELSE 'scope'
  END
  WHERE aspect_ratio IS NULL AND grid_layout IS NOT NULL;

-- (mobile_count / desktop_count intentionally left NULL → the count matrix
--  derives them from each other until the user explicitly sets one.)
