-- ── Brief Q2 — coin_market_data (batched MC cache) ───────────────────────────
-- A sibling to the screening-room cache that keeps MC for EVERY minted coin (not just the
-- top-50). Written by /api/cron/coin-market every 5 min (refreshCoinMarketData). Read by
-- ambient surfaces (profile grid hover) via getCachedMarketCaps, staleness-filtered.
-- BOUNDARY: ambient DISPLAY only — collect/trade sheets keep LIVE pricing, never this table.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — INSPECT (run first; informs the refresh strategy: all-coins vs tiered)
--
--   SELECT count(*) AS minted_coins FROM posts WHERE coin_address IS NOT NULL;
--   -- < ~2000 → all-coins-every-5-min (shipped default) is comfortably batchable
--   --   (ceil(n/20) getCoins calls per run). If it grows large, tier by activity later.
--   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'screening_room';
--   -- (sibling reference — this table drops rank, adds price_usd/unique_holders, uses updated_at)
-- ─────────────────────────────────────────────────────────────────────────────

-- STEP 2 — CREATE
CREATE TABLE IF NOT EXISTS coin_market_data (
  coin_address   text PRIMARY KEY,
  market_cap     numeric,
  price_usd      numeric,
  unique_holders int,
  symbol         text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coin_market_data ENABLE ROW LEVEL SECURITY;

-- Public read (ambient MC is public info). Writes are service-role only (the cron) — no anon
-- insert/update policy, so the anon key can never write market data.
CREATE POLICY "coin_market_data public read" ON coin_market_data FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_coin_market_updated ON coin_market_data (updated_at);
