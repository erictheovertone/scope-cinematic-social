-- Brief X2b §2 — DATA AUDIT (read-only): do any rows carry a square / 16:9 layout?
-- Run in the Supabase SQL editor. Zero rows everywhere = the square/16:9 ids are pure
-- ghosts (type-system only, no data behind them). Any count > 0 = legacy rows exist;
-- they keep rendering via getAspectRatio's legacy handlers (untouched) and via
-- profile/page's `gl.includes('16:9')` fallback — NEW posts from those profiles now
-- resolve canonical (CreatePostFlow LEGACY_TO_CANONICAL: 3x-square→legacy,
-- 2x-regular-wide→cine-wide-2col, super-wide→scope), so the crop can never re-emit them.

-- 1. PROFILES whose grid_layout is a square / 16:9 / super-wide legacy id
select grid_layout, count(*) as profiles
from profiles
where grid_layout ilike '%square%'
   or grid_layout ilike '%16:9%'   or grid_layout ilike '%16-9%'
   or grid_layout ilike '%regular-wide%'
   or grid_layout ilike '%super-wide%'
   or grid_layout in ('2x-16:9','1x-16:9','3x-square','2x-regular-wide',
                      '2-across-16:9','1-across-16:9','3x-4:3')
group by grid_layout
order by profiles desc;

-- 2. POSTS whose layout_id is a square / 16:9 legacy id (these keep their baked geometry)
select layout_id, count(*) as posts
from posts
where layout_id ilike '%square%'
   or layout_id ilike '%16:9%'   or layout_id ilike '%16-9%'
   or layout_id ilike '%regular-wide%'
   or layout_id ilike '%super-wide%'
   or layout_id in ('2x-16:9','1x-16:9','3x-square','2x-regular-wide',
                    '2-across-16:9','1-across-16:9','3x-4:3')
group by layout_id
order by posts desc;
