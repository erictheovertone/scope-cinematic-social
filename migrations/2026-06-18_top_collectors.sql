-- ── Awarding layer · Step 2 — Collector ranking cache ────────────────────────
-- Plan: docs/economy/Indexer_Decisions.md §Collector. The nightly Collector
-- cron (/api/cron/collector) overwrites this table each run with the current
-- weighted-composite ranking (top 1000). The is_top_collector flag on profiles
-- already exists (display reads it) — this only adds the cache table.
--
-- Run manually in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS top_collectors (
  rank             INT PRIMARY KEY,
  user_id          TEXT NOT NULL,          -- users.id (= profiles.user_id)
  score            NUMERIC NOT NULL,        -- weighted composite, 0–1
  distinct_posts   INT,                     -- signal: distinct Scope coins held
  distinct_creators INT,                    -- signal: distinct creators supported
  holdings_value   NUMERIC,                 -- signal: USD value of Scope holdings
  trade_volume     NUMERIC,                 -- signal: cumulative USD trade volume
  computed_at      TIMESTAMPTZ DEFAULT now()
);

-- Look up a user's standing without scanning by rank.
CREATE INDEX IF NOT EXISTS top_collectors_user_id_idx ON top_collectors (user_id);

-- Public read (the ranking is a public showcase, same posture as screening_room);
-- writes are service-role only (the cron), which bypasses RLS.
ALTER TABLE top_collectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "top_collectors public read" ON top_collectors;
CREATE POLICY "top_collectors public read" ON top_collectors
  FOR SELECT USING (true);
